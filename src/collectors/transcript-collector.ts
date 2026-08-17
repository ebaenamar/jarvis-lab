/**
 * Transcript collector — parses Claude Code session JSONL transcripts.
 *
 * Claude Code stores session transcripts as JSONL files in
 * ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 *
 * Each line is a JSON object with a `type` field:
 *  - "user": user messages (including tool results) and human prompts
 *  - "assistant": assistant messages containing text, thinking, and tool_use blocks
 *  - "system": system events (hook summaries, etc.)
 *  - "mode": mode changes
 *  - "progress": hook execution progress
 *  - "queue-operation": prompt queueing
 *  - "ai-title": auto-generated session titles
 *  - "attachment": deferred tools, agent listings, etc.
 *
 * This collector normalizes all of these into the unified TimelineEvent model.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import type {
  Session,
  TimelineEvent,
  ToolCallEvent,
  HumanActionEvent,
  SystemEvent,
  PermissionMode,
  DevPhase,
} from '../types.js';
import { RiskClassifier } from '../risk/classifier.js';

interface RawTranscriptLine {
  type: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  isSidechain?: boolean;
  userType?: string;
  permissionMode?: string;
  entrypoint?: string;
  origin?: { kind?: string };
  promptSource?: string;
  message?: {
    role?: string;
    content?: unknown;
    model?: string;
    id?: string;
    usage?: Record<string, number>;
  };
  subtype?: string;
  data?: Record<string, unknown>;
  content?: unknown;
  hookEvent?: string;
  hookName?: string;
  command?: string;
  operation?: string;
  toolUseID?: string;
  parentToolUseID?: string;
}

export class TranscriptCollector {
  private classifier: RiskClassifier;
  private projectsDir: string;

  constructor(classifier: RiskClassifier, projectsDir?: string) {
    this.classifier = classifier;
    this.projectsDir = projectsDir ?? join(homedir(), '.claude', 'projects');
  }

  /**
   * List all available sessions across all projects.
   */
  listSessions(): { sessionId: string; projectDir: string; filePath: string; size: number; mtime: Date }[] {
    const sessions: { sessionId: string; projectDir: string; filePath: string; size: number; mtime: Date }[] = [];
    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.projectsDir).map(d => join(this.projectsDir, d));
    } catch {
      return sessions;
    }

    for (const projectDir of projectDirs) {
      try {
        const stat = statSync(projectDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      let files: string[];
      try {
        files = readdirSync(projectDir);
      } catch {
        continue;
      }

      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = join(projectDir, file);
        try {
          const fstat = statSync(filePath);
          const sessionId = file.replace('.jsonl', '');
          sessions.push({
            sessionId,
            projectDir: basename(projectDir),
            filePath,
            size: fstat.size,
            mtime: fstat.mtime,
          });
        } catch {
          continue;
        }
      }
    }

    return sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  }

  /**
   * Parse a single session transcript file into a Session object.
   */
  parseSession(filePath: string): Session {
    const raw = readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter(l => l.trim().length > 0);

    const events: TimelineEvent[] = [];
    let sessionId = '';
    let cwd = '';
    let gitBranch: string | undefined;
    let version: string | undefined;
    let startTime = '';
    let endTime: string | undefined;
    let permissionMode: PermissionMode = 'unknown';
    let entrypoint: string | undefined;

    // Track tool_use blocks by ID to match with tool_results
    const toolUseById = new Map<string, { toolName: string; toolInput: Record<string, unknown>; timestamp: string; uuid: string }>();

    // Track the last assistant timestamp to detect interruptions
    let lastAssistantTimestamp: string | undefined;

    for (const line of lines) {
      let obj: RawTranscriptLine;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      // Extract session metadata from any line that has it
      if (obj.sessionId && !sessionId) sessionId = obj.sessionId;
      if (obj.cwd && !cwd) cwd = obj.cwd;
      if (obj.gitBranch && !gitBranch) gitBranch = obj.gitBranch;
      if (obj.version && !version) version = obj.version;
      if (obj.entrypoint && !entrypoint) entrypoint = obj.entrypoint;
      if (obj.permissionMode) {
        permissionMode = this.normalizePermissionMode(obj.permissionMode);
      }
      if (obj.timestamp) {
        if (!startTime) startTime = obj.timestamp;
        endTime = obj.timestamp;
      }

      switch (obj.type) {
        case 'assistant':
          this.processAssistantLine(obj, events, toolUseById, sessionId);
          lastAssistantTimestamp = obj.timestamp;
          break;

        case 'user':
          this.processUserLine(obj, events, toolUseById, sessionId, lastAssistantTimestamp);
          break;

        case 'system':
          this.processSystemLine(obj, events, sessionId);
          break;

        case 'mode':
          // Mode changes are system events
          if (obj.timestamp && sessionId) {
            events.push({
              kind: 'system',
              data: {
                id: obj.uuid ?? `sys-${obj.timestamp}`,
                source: 'transcript',
                timestamp: obj.timestamp,
                sessionId,
                subtype: 'mode-change',
                data: { mode: (obj as unknown as Record<string, unknown>).mode ?? 'unknown' },
              },
            });
          }
          break;

        case 'progress':
          // Hook execution progress
          if (obj.timestamp && sessionId && obj.hookEvent) {
            events.push({
              kind: 'system',
              data: {
                id: obj.uuid ?? `prog-${obj.timestamp}`,
                source: 'transcript',
                timestamp: obj.timestamp,
                sessionId,
                subtype: `hook-${obj.hookEvent}`,
                data: {
                  hookName: obj.hookName,
                  command: obj.command,
                  toolUseID: obj.toolUseID,
                },
              },
            });
          }
          break;
      }
    }

    // Sort events by timestamp
    events.sort((a, b) => {
      const ta = a.data.timestamp ?? '';
      const tb = b.data.timestamp ?? '';
      return ta.localeCompare(tb);
    });

    return {
      id: sessionId || basename(filePath, '.jsonl'),
      source: 'transcript',
      cwd,
      gitBranch,
      version,
      startTime: startTime || new Date(0).toISOString(),
      endTime,
      events,
      permissionMode,
      entrypoint,
    };
  }

  private processAssistantLine(
    obj: RawTranscriptLine,
    events: TimelineEvent[],
    toolUseById: Map<string, { toolName: string; toolInput: Record<string, unknown>; timestamp: string; uuid: string }>,
    sessionId: string,
  ): void {
    if (!obj.message?.content || !Array.isArray(obj.message.content)) return;

    for (const block of obj.message.content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;

      if (b.type === 'tool_use') {
        const toolName = b.name as string;
        const toolInput = (b.input ?? {}) as Record<string, unknown>;
        const toolUseId = b.id as string;

        toolUseById.set(toolUseId, {
          toolName,
          toolInput,
          timestamp: obj.timestamp ?? '',
          uuid: obj.uuid ?? toolUseId,
        });

        // Classify risk
        const assessment = this.classifier.classify(toolName, toolInput);

        // Determine if auto-approved based on permission mode
        const permMode = this.normalizePermissionMode(obj.permissionMode ?? '');
        const autoApproved = permMode === 'bypassPermissions' || permMode === 'acceptEdits';

        const toolCall: ToolCallEvent = {
          id: toolUseId,
          source: 'transcript',
          timestamp: obj.timestamp ?? '',
          toolName,
          toolInput,
          isError: false,
          riskScore: assessment.riskScore,
          autonomyScore: assessment.autonomyScore,
          autoApproved,
          phase: assessment.phase,
          sessionId,
          parentToolUseId: obj.parentToolUseID,
          blocked: false,
          interrupted: false,
        };

        events.push({ kind: 'tool-call', data: toolCall });
      }
    }
  }

  private processUserLine(
    obj: RawTranscriptLine,
    events: TimelineEvent[],
    toolUseById: Map<string, { toolName: string; toolInput: Record<string, unknown>; timestamp: string; uuid: string }>,
    sessionId: string,
    lastAssistantTimestamp: string | undefined,
  ): void {
    if (!obj.message?.content) return;

    const origin = obj.origin?.kind ?? 'unknown';
    const content = obj.message.content;

    // Tool results come as arrays of blocks
    if (Array.isArray(content)) {
      for (const block of content) {
        if (typeof block !== 'object' || block === null) continue;
        const b = block as Record<string, unknown>;

        if (b.type === 'tool_result') {
          const toolUseId = b.tool_use_id as string;
          const isErr = b.is_error === true;
          const resultContent = this.extractToolResultContent(b.content);

          // Update the corresponding tool call with result info
          const toolCallEvent = events.find(
            e => e.kind === 'tool-call' && e.data.id === toolUseId,
          );
          if (toolCallEvent && toolCallEvent.kind === 'tool-call') {
            toolCallEvent.data.toolResult = resultContent;
            toolCallEvent.data.isError = isErr;
          }
        }
      }
      return;
    }

    // Human prompt (not a tool result)
    if (typeof content === 'string' && origin === 'human') {
      const kind = this.classifyHumanAction(content, lastAssistantTimestamp);
      const isOversight = this.isOversightAction(kind, content);

      const humanAction: HumanActionEvent = {
        id: obj.uuid ?? `human-${obj.timestamp ?? Date.now()}`,
        source: 'transcript',
        timestamp: obj.timestamp ?? '',
        sessionId,
        kind,
        content: content.substring(0, 5000),
        isOversight,
        permissionMode: this.normalizePermissionMode(obj.permissionMode ?? ''),
      };

      events.push({ kind: 'human-action', data: humanAction });
    }
  }

  private processSystemLine(
    obj: RawTranscriptLine,
    events: TimelineEvent[],
    sessionId: string,
  ): void {
    if (!obj.timestamp || !sessionId) return;

    const sysEvent: SystemEvent = {
      id: obj.uuid ?? `sys-${obj.timestamp}`,
      source: 'transcript',
      timestamp: obj.timestamp,
      sessionId,
      subtype: obj.subtype ?? obj.type,
      data: {
        hookCount: obj.data?.hookCount,
        hookErrors: obj.data?.hookErrors,
        preventedContinuation: obj.data?.preventedContinuation,
        stopReason: obj.data?.stopReason,
        level: obj.data?.level,
      },
    };

    events.push({ kind: 'system', data: sysEvent });
  }

  /**
   * Classify a human message into an action kind.
   */
  private classifyHumanAction(content: string, lastAssistantTimestamp: string | undefined): HumanActionEvent['kind'] {
    const lower = content.toLowerCase().trim();

    // Very short messages after assistant work often indicate interruptions or quick corrections
    if (lower.length < 5) {
      if (['stop', 'wait', 'no', 'halt', 'pause'].includes(lower)) return 'interruption';
      if (['d', 'ok', 'yes', 'y', 'go'].includes(lower)) return 'approval';
    }

    // Correction patterns
    if (/\b(no,?|stop|wait|actually|don't|do not|wrong|incorrect|undo|revert|rollback|fix this|that's wrong|not that)\b/.test(lower)) {
      return 'correction';
    }

    // Pushback patterns
    if (/\b(but|however|instead|rather|reconsider|think again|are you sure|double-check|why did you|that doesn't|that does not)\b/.test(lower)) {
      return 'pushback';
    }

    // Clarification
    if (/\b(what do you mean|clarify|explain|why|how come|what is|what are|confused|don't understand)\b/.test(lower)) {
      return 'clarification';
    }

    // Plan challenge
    if (/\b(let's? think|step back|reconsider the plan|different approach|another way|plan b|change (the )?plan)\b/.test(lower)) {
      return 'plan-challenge';
    }

    // Manual test
    if (/\b(i ran|i run|i tested|i checked|i verified|let me (test|check|verify))\b/.test(lower)) {
      return 'manual-test';
    }

    // Diff review
    if (/\b(i reviewed|reviewed (the )?diff|checked (the )?diff|looks good|lgtm|approved)\b/.test(lower)) {
      return 'diff-review';
    }

    // Default: it's a prompt
    return 'prompt';
  }

  /**
   * Determine if a human action constitutes oversight evidence.
   */
  private isOversightAction(kind: HumanActionEvent['kind'], _content: string): boolean {
    return [
      'correction',
      'interruption',
      'rejection',
      'pushback',
      'plan-challenge',
      'manual-edit',
      'manual-test',
      'diff-review',
    ].includes(kind);
  }

  private extractToolResultContent(content: unknown): string {
    if (typeof content === 'string') return content.substring(0, 10000);
    if (Array.isArray(content)) {
      return content
        .map(c => {
          if (typeof c === 'string') return c;
          if (typeof c === 'object' && c !== null) {
            const obj = c as Record<string, unknown>;
            if (typeof obj.text === 'string') return obj.text;
          }
          return JSON.stringify(c);
        })
        .join('\n')
        .substring(0, 10000);
    }
    return JSON.stringify(content).substring(0, 10000);
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
   * Get the most recent N sessions.
   */
  getRecentSessions(limit: number): Session[] {
    const available = this.listSessions().slice(0, limit);
    return available.map(s => this.parseSession(s.filePath));
  }

  /**
   * Get a specific session by ID.
   */
  getSessionById(sessionId: string): Session | null {
    const available = this.listSessions();
    const match = available.find(s => s.sessionId === sessionId);
    if (!match) return null;
    return this.parseSession(match.filePath);
  }
}
