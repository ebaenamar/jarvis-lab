/**
 * Hooks installer — installs Claude Code hooks that capture live events
 * and forward them to the observatory.
 *
 * Installs hooks for:
 *   - PreToolUse: log tool calls before execution (with risk classification)
 *   - PostToolUse: log tool results after execution
 *   - UserPromptSubmit: log human prompts
 *   - Stop: log session completion
 *   - SessionStart: log session start
 *
 * The hooks write events to a shared event log that the dashboard
 * can read in real-time.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOOK_SCRIPT = `#!/bin/bash
# Jarvis Lab — Human-Agent Control Observatory hook
# Captures Claude Code events and writes them to the event log.

JARVIS_EVENT_LOG="\${JARVIS_EVENT_LOG:-$HOME/.jarvis-lab/events.jsonl}"
mkdir -p "$(dirname "$JARVIS_EVENT_LOG")"

# Read the hook input from stdin
INPUT=$(cat)

# Extract event type from the hook input
EVENT_TYPE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('hook_event_name','unknown'))" 2>/dev/null || echo "unknown")

# Write the event to the log
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")
echo "{\"type\":\"hook\",\"hookEvent\":\"$EVENT_TYPE\",\"timestamp\":\"$TIMESTAMP\",\"data\":$INPUT}" >> "$JARVIS_EVENT_LOG"

# Always allow the tool to proceed (hooks are observers, not blockers)
exit 0
`;

export async function installHooks(): Promise<void> {
  const claudeDir = join(homedir(), '.claude');
  const settingsPath = join(claudeDir, 'settings.json');
  const hookScriptDir = join(homedir(), '.jarvis-lab');
  const hookScriptPath = join(hookScriptDir, 'hook.sh');
  const eventLogDir = join(homedir(), '.jarvis-lab');

  // Create directories
  if (!existsSync(hookScriptDir)) {
    mkdirSync(hookScriptDir, { recursive: true });
  }
  if (!existsSync(eventLogDir)) {
    mkdirSync(eventLogDir, { recursive: true });
  }

  // Write the hook script
  writeFileSync(hookScriptPath, HOOK_SCRIPT, { mode: 0o755 });
  console.log(`✓ Hook script written to ${hookScriptPath}`);

  // Read existing settings
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      console.error('Warning: Could not parse existing settings.json. Creating backup.');
      writeFileSync(settingsPath + '.bak', readFileSync(settingsPath, 'utf-8'));
    }
  }

  // Add hooks configuration
  const hookCommand = `bash ${hookScriptPath}`;
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const hookEvents = ['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop', 'SessionStart'];

  for (const event of hookEvents) {
    if (!hooks[event]) {
      hooks[event] = [];
    }
    const existing = hooks[event] as Array<{ matcher?: string; hooks: Array<{ command: string }> }>;
    // Check if our hook is already installed
    const alreadyInstalled = existing.some(
      group => group.hooks?.some(h => h.command === hookCommand)
    );
    if (!alreadyInstalled) {
      existing.push({
        matcher: '',
        hooks: [{ command: hookCommand }],
      });
    }
  }

  settings.hooks = hooks;

  // Write updated settings
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`✓ Hooks installed in ${settingsPath}`);
  console.log('');
  console.log('The following hook events are now captured:');
  for (const event of hookEvents) {
    console.log(`  • ${event}`);
  }
  console.log('');
  console.log('Events are logged to:');
  console.log(`  ${join(homedir(), '.jarvis-lab', 'events.jsonl')}`);
  console.log('');
  console.log('To enable OTel telemetry in Claude Code, add these to your environment:');
  console.log('  export CLAUDE_CODE_ENABLE_TELEMETRY=1');
  console.log('  export CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1');
  console.log('  export OTEL_TRACES_EXPORTER=otlp');
  console.log('  export OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf');
  console.log('  export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318');
  console.log('  export OTEL_LOG_USER_PROMPTS=1');
  console.log('  export OTEL_LOG_TOOL_DETAILS=1');
  console.log('  export OTEL_LOG_TOOL_CONTENT=1');
}

/**
 * Read events from the hook event log.
 */
export function readHookEvents(): string[] {
  const logPath = join(homedir(), '.jarvis-lab', 'events.jsonl');
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf-8').split('\n').filter(l => l.trim());
}

/**
 * Append an event to the hook event log.
 */
export function appendHookEvent(event: Record<string, unknown>): void {
  const logPath = join(homedir(), '.jarvis-lab', 'events.jsonl');
  const dir = join(homedir(), '.jarvis-lab');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(logPath, JSON.stringify(event) + '\n');
}
