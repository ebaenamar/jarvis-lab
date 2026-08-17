/**
 * Core type definitions for the Human-Agent Control Observatory.
 *
 * These types model the unified event timeline that both the transcript
 * collector and the OTel collector normalize into. All metrics operate
 * on this common model, regardless of data source.
 */

/** Source of a timeline event. */
export type EventSource = 'transcript' | 'otel' | 'hook';

/** Phase of development within a session, used for delegation breakdown. */
export type DevPhase = 'planning' | 'implementation' | 'debugging' | 'verification' | 'deployment' | 'unknown';

/** Classification of who performed an action. */
export type Actor = 'agent' | 'human' | 'system' | 'external';

/** Permission mode at the time of an event. */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'unknown';

/** Origin of a user message — distinguishes actual human input from tool results. */
export type UserOrigin = 'human' | 'task-notification' | 'tool-result' | 'unknown';

/**
 * A single tool invocation by the agent, reconstructed from either
 * transcript JSONL or OTel spans.
 */
export interface ToolCallEvent {
  id: string;
  source: EventSource;
  timestamp: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolResult?: string;
  isError: boolean;
  /** Risk score 1-10, assigned by the risk classifier. */
  riskScore: number;
  /** Autonomy score 1-10, how independently the agent acted. */
  autonomyScore: number;
  /** Whether the call was auto-approved or required human permission. */
  autoApproved: boolean;
  /** Time spent waiting for human permission, in ms (from OTel blocked_on_user span). */
  permissionWaitMs?: number;
  /** Duration of tool execution in ms. */
  durationMs?: number;
  /** Dev phase this tool call belongs to. */
  phase: DevPhase;
  /** Session ID this event belongs to. */
  sessionId: string;
  /** Parent tool use ID (for sub-agent calls). */
  parentToolUseId?: string;
  /** Whether the tool call was blocked by a hook or permission denial. */
  blocked: boolean;
  /** Whether the tool call was interrupted by the human. */
  interrupted: boolean;
}

/**
 * A human action within the session — prompts, corrections, interruptions,
 * approvals, or manual edits.
 */
export interface HumanActionEvent {
  id: string;
  source: EventSource;
  timestamp: string;
  sessionId: string;
  /** Type of human action. */
  kind: HumanActionKind;
  /** The content of the action (prompt text, correction detail, etc.). */
  content: string;
  /** Whether this action constitutes oversight evidence. */
  isOversight: boolean;
  /** The tool call this action is responding to, if applicable. */
  relatedToolCallId?: string;
  /** Permission mode at the time of the action. */
  permissionMode: PermissionMode;
}

/** Kinds of human actions we track. */
export type HumanActionKind =
  | 'prompt'           // Initial or follow-up prompt
  | 'correction'       // Correcting agent output
  | 'interruption'     // Interrupting agent mid-task
  | 'approval'         // Approving a tool call
  | 'rejection'        // Rejecting/denying a tool call
  | 'clarification'    // Asking for clarification
  | 'pushback'         // Pushing back on agent's approach
  | 'plan-challenge'   // Challenging the plan
  | 'manual-edit'      // Human manually edited code
  | 'manual-test'      // Human manually ran tests
  | 'diff-review'      // Human reviewed a diff
  | 'session-start'    // Session started
  | 'session-end';     // Session ended

/**
 * A system-level event (mode changes, hook executions, etc.).
 */
export interface SystemEvent {
  id: string;
  source: EventSource;
  timestamp: string;
  sessionId: string;
  subtype: string;
  data: Record<string, unknown>;
}

/**
 * Unified timeline event — discriminated union of the three event types.
 */
export type TimelineEvent =
  | { kind: 'tool-call'; data: ToolCallEvent }
  | { kind: 'human-action'; data: HumanActionEvent }
  | { kind: 'system'; data: SystemEvent };

/**
 * A complete session, reconstructed from a transcript or OTel trace.
 */
export interface Session {
  id: string;
  source: EventSource;
  cwd: string;
  gitBranch?: string;
  version?: string;
  startTime: string;
  endTime?: string;
  events: TimelineEvent[];
  permissionMode: PermissionMode;
  entrypoint?: string;
}

/**
 * Result of computing all six metrics for a session.
 */
export interface MetricResult<T = number | Record<string, number>> {
  name: string;
  value: T;
  raw: Record<string, unknown>;
  description: string;
  /** Breakdown by dev phase, if applicable. */
  byPhase?: Partial<Record<DevPhase, T>>;
  /** Human-readable interpretation. */
  interpretation?: string;
}

/**
 * Complete metric report for a session.
 */
export interface SessionReport {
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime?: string;
  duration: number;
  metrics: MetricResult[];
  /** Total tool calls. */
  totalToolCalls: number;
  /** Total human actions. */
  totalHumanActions: number;
  /** Timeline of all events, sorted by timestamp. */
  timeline: TimelineEvent[];
  /** Risk distribution of tool calls. */
  riskDistribution: RiskDistribution;
}

/** Distribution of tool calls across risk levels. */
export interface RiskDistribution {
  critical: number;  // risk 9-10
  high: number;      // risk 7-8
  medium: number;    // risk 4-6
  low: number;       // risk 1-3
}

/** Configuration for the risk classifier. */
export interface RiskProfile {
  toolName: string;
  baseRisk: number;
  baseAutonomy: number;
  /** Patterns in tool input that modify risk/autonomy. */
  inputPatterns?: InputPattern[];
}

/** A pattern that modifies risk/autonomy based on tool input content. */
export interface InputPattern {
  /** Regex pattern to match against tool input (stringified). */
  pattern: string;
  /** Risk delta when matched (can be negative). */
  riskDelta: number;
  /** Autonomy delta when matched. */
  autonomyDelta: number;
  /** Human-readable label for why this pattern matters. */
  label: string;
}

/** Verification evidence for a tool call. */
export interface VerificationEvidence {
  toolCallId: string;
  /** Who verified: agent itself, second model, CI, human, etc. */
  verifier: 'agent-self' | 'second-model' | 'ci' | 'static-analyzer' | 'human' | 'human-plus-ci' | 'none';
  /** Independence level 0-1, where 1 = fully independent. */
  independence: number;
  /** What kind of verification was performed. */
  method: string;
  timestamp: string;
}

/** Authority/privilege exposure entry. */
export interface AuthorityEntry {
  toolCallId: string;
  timestamp: string;
  capability: string;
  /** Whether the capability was granted, used, or blocked. */
  status: 'granted' | 'used' | 'blocked' | 'denied';
  /** Whether the capability is sensitive. */
  sensitive: boolean;
  /** Scope of the resource accessed. */
  resourceScope?: string;
}
