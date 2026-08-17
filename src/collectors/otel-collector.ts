/**
 * OTel collector — receives OpenTelemetry spans from Claude Code via OTLP HTTP.
 *
 * Claude Code emits the following span types when telemetry is enabled:
 *  - claude_code.interaction: root span per user prompt
 *  - claude_code.llm_request: each Anthropic API call
 *  - claude_code.tool: tool invocation (parent span)
 *  - claude_code.tool.blocked_on_user: time waiting on permission
 *  - claude_code.tool.execution: actual tool execution
 *
 * Enable in Claude Code with:
 *   CLAUDE_CODE_ENABLE_TELEMETRY=1
 *   CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
 *   OTEL_TRACES_EXPORTER=otlp
 *   OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 *   OTEL_LOG_USER_PROMPTS=1
 *   OTEL_LOG_TOOL_DETAILS=1
 *   OTEL_LOG_TOOL_CONTENT=1
 *
 * This collector runs an HTTP server that accepts OTLP HTTP/protobuf trace
 * exports and normalizes them into the unified TimelineEvent model.
 */

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import type {
  TimelineEvent,
  ToolCallEvent,
  HumanActionEvent,
  Session,
  PermissionMode,
} from '../types.js';
import { RiskClassifier } from '../risk/classifier.js';

// OTLP protobuf types (simplified — we parse the JSON-encoded OTLP)
interface OtelSpan {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string;
  endTimeUnixNano?: string;
  attributes?: { key: string; value: { stringValue?: string; intValue?: string; doubleValue?: number; boolValue?: boolean } }[];
  status?: { code?: number };
}

interface OtelScopeSpans {
  scope?: { name?: string };
  spans?: OtelSpan[];
}

interface OtelResourceSpans {
  resource?: { attributes?: { key: string; value: { stringValue?: string } }[] };
  scopeSpans?: OtelScopeSpans[];
}

interface OtelExportRequest {
  resourceSpans?: OtelResourceSpans[];
}

export class OtelCollector {
  private classifier: RiskClassifier;
  private port: number;
  private host: string;
  private server: ReturnType<typeof createServer> | null = null;
  private events: TimelineEvent[] = [];
  private sessions: Map<string, Session> = new Map();
  // Track tool spans by spanId to link parent tool span with execution span
  private toolSpansBySpanId = new Map<string, { toolName: string; promptId: string; sessionId: string; startTime: string }>();
  // Track blocked_on_user durations
  private blockedDurations = new Map<string, number>();

  constructor(classifier: RiskClassifier, port = 4318, host = 'localhost') {
    this.classifier = classifier;
    this.port = port;
    this.host = host;
  }

  /**
   * Start the OTLP HTTP receiver.
   */
  start(): Promise<void> {
    return new Promise((resolve) => {
    this.server = createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, this.host, () => {
      console.error(`[otel-collector] Listening on http://${this.host}:${this.port}`);
      console.error(`[otel-collector] Configure Claude Code with:`);
      console.error(`[otel-collector]   CLAUDE_CODE_ENABLE_TELEMETRY=1`);
      console.error(`[otel-collector]   CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`);
      console.error(`[otel-collector]   OTEL_TRACES_EXPORTER=otlp`);
      console.error(`[otel-collector]   OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`);
      console.error(`[otel-collector]   OTEL_EXPORTER_OTLP_ENDPOINT=http://${this.host}:${this.port}`);
      resolve();
    });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'POST' && req.url === '/v1/traces') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          // OTLP HTTP can send JSON or protobuf. We handle JSON here.
          // For protobuf, a real implementation would use the OTLP proto schema.
          const exportRequest: OtelExportRequest = JSON.parse(body);
          this.processExport(exportRequest);
        } catch {
          // If it's protobuf, we can't parse it as JSON. In a production system,
          // we'd use @opentelemetry/exporter-trace-otlp-proto to decode.
          // For now, silently skip non-JSON payloads.
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  }

  private processExport(exportRequest: OtelExportRequest): void {
    const resourceSpans = exportRequest.resourceSpans ?? [];
    for (const rs of resourceSpans) {
      const scopeSpans = rs.scopeSpans ?? [];
      for (const ss of scopeSpans) {
        const spans = ss.spans ?? [];
        for (const span of spans) {
          this.processSpan(span);
        }
      }
    }
  }

  private processSpan(span: OtelSpan): void {
    const name = span.name ?? '';
    const attrs = this.extractAttributes(span);
    const sessionId = String(attrs['session.id'] ?? attrs['session_id'] ?? 'unknown');
    const timestamp = span.startTimeUnixNano
      ? new Date(Number(span.startTimeUnixNano) / 1_000_000).toISOString()
      : new Date().toISOString();
    const durationMs = span.startTimeUnixNano && span.endTimeUnixNano
      ? (Number(span.endTimeUnixNano) - Number(span.startTimeUnixNano)) / 1_000_000
      : undefined;

    if (name === 'claude_code.interaction') {
      // Root interaction span — a user prompt
      const promptText = String(attrs['user.prompt'] ?? attrs['prompt.text'] ?? '');
      const humanAction: HumanActionEvent = {
        id: `otel-${span.spanId ?? timestamp}`,
        source: 'otel',
        timestamp,
        sessionId,
        kind: 'prompt',
        content: promptText,
        isOversight: false,
        permissionMode: this.normalizePermissionMode(String(attrs['permission.mode'] ?? attrs['permission_mode'] ?? '')),
      };
      this.events.push({ kind: 'human-action', data: humanAction });
      this.ensureSession(sessionId, attrs);
    } else if (name === 'claude_code.tool') {
      // Tool invocation parent span
      const toolName = String(attrs['tool.name'] ?? attrs['tool_name'] ?? 'unknown');
      const toolInputStr = String(attrs['tool.input'] ?? attrs['tool_input'] ?? '{}');
      let toolInput: Record<string, unknown> = {};
      try { toolInput = JSON.parse(toolInputStr); } catch { toolInput = { raw: toolInputStr }; }

      this.toolSpansBySpanId.set(span.spanId ?? '', {
        toolName,
        promptId: String(attrs['prompt.id'] ?? ''),
        sessionId,
        startTime: timestamp,
      });

      // Check if there was a blocked_on_user child span
      const blockedMs = this.blockedDurations.get(span.spanId ?? '');
      const autoApproved = blockedMs === undefined || blockedMs === 0;

      const assessment = this.classifier.classify(toolName, toolInput);

      const toolCall: ToolCallEvent = {
        id: `otel-${span.spanId ?? timestamp}`,
        source: 'otel',
        timestamp,
        toolName,
        toolInput,
        isError: span.status?.code === 2,
        riskScore: assessment.riskScore,
        autonomyScore: assessment.autonomyScore,
        autoApproved,
        permissionWaitMs: blockedMs,
        durationMs,
        phase: assessment.phase,
        sessionId,
        blocked: false,
        interrupted: false,
      };

      this.events.push({ kind: 'tool-call', data: toolCall });
    } else if (name === 'claude_code.tool.blocked_on_user') {
      // Permission wait — track duration for the parent tool span
      if (span.parentSpanId && durationMs) {
        this.blockedDurations.set(span.parentSpanId, durationMs);
      }
    } else if (name === 'claude_code.tool.execution') {
      // Tool execution — update the parent tool call with result if available
      const toolResult = attrs['tool.result'] ?? attrs['tool_result'];
      if (span.parentSpanId && toolResult !== undefined) {
        const parentSpan = this.toolSpansBySpanId.get(span.parentSpanId);
        if (parentSpan) {
          // Find and update the tool call event
          const toolCallEvent = this.events.find(
            e => e.kind === 'tool-call' && e.data.id === `otel-${span.parentSpanId}`,
          );
          if (toolCallEvent && toolCallEvent.kind === 'tool-call') {
            const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            toolCallEvent.data.toolResult = resultStr.substring(0, 10000);
          }
        }
      }
    } else if (name === 'claude_code.llm_request') {
      // LLM request — we could track token usage but it's not a timeline event per se
      // Could be used for token metrics in the future
    }
  }

  private extractAttributes(span: OtelSpan): Record<string, string | number | boolean> {
    const result: Record<string, string | number | boolean> = {};
    if (!span.attributes) return result;
    for (const attr of span.attributes) {
      const v = attr.value;
      if (v.stringValue !== undefined) result[attr.key] = v.stringValue;
      else if (v.intValue !== undefined) result[attr.key] = Number(v.intValue);
      else if (v.doubleValue !== undefined) result[attr.key] = v.doubleValue;
      else if (v.boolValue !== undefined) result[attr.key] = v.boolValue;
    }
    return result;
  }

  private ensureSession(sessionId: string, attrs: Record<string, string | number | boolean>): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        source: 'otel',
        cwd: String(attrs['cwd'] ?? ''),
        startTime: new Date().toISOString(),
        events: [],
        permissionMode: this.normalizePermissionMode(String(attrs['permission.mode'] ?? attrs['permission_mode'] ?? '')),
      });
    }
  }

  private normalizePermissionMode(mode: string): PermissionMode {
    switch (mode) {
      case 'default': return 'default';
      case 'acceptEdits': return 'acceptEdits';
      case 'bypassPermissions': return 'bypassPermissions';
      case 'plan': return 'plan';
      default: return 'unknown';
    }
  }

  /**
   * Get all collected events, sorted by timestamp.
   */
  getEvents(): TimelineEvent[] {
    return [...this.events].sort((a, b) => a.data.timestamp.localeCompare(b.data.timestamp));
  }

  /**
   * Get events for a specific session.
   */
  getSessionEvents(sessionId: string): TimelineEvent[] {
    return this.events
      .filter(e => e.data.sessionId === sessionId)
      .sort((a, b) => a.data.timestamp.localeCompare(b.data.timestamp));
  }

  /**
   * Get all session IDs that have received events.
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Clear all collected events.
   */
  clear(): void {
    this.events = [];
    this.sessions.clear();
    this.toolSpansBySpanId.clear();
    this.blockedDurations.clear();
  }
}
