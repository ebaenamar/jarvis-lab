/**
 * Metric 5: Authority / Privilege Exposure
 *
 * The "Okta" layer. Tracks:
 *   - granted capability
 *   - used capability
 *   - sensitive capability
 *   - credential lifetime
 *   - privilege escalation attempts
 *   - blocked operations
 *   - scope of reachable resources
 *
 * Produces:
 *   - Privilege Surface: number of distinct capabilities exercised
 *   - Blast Radius: scope of resources the agent could reach
 *   - Least-Privilege Gap: capabilities used that exceed what was needed
 *
 * In Claude Code, authority is expressed through:
 *   - Permission modes (default, acceptEdits, bypassPermissions)
 *   - Tool permissions (allow/deny lists in settings)
 *   - Bash command access (what commands the agent can run)
 *   - File access (what paths the agent can read/write)
 *   - Network access (WebFetch, WebSearch)
 *   - MCP server access (external tool integrations)
 */

import type { Session, TimelineEvent, MetricResult, ToolCallEvent, AuthorityEntry } from '../types.js';

// Sensitive path patterns
const SENSITIVE_PATH_PATTERNS = [
  /\.env/i, /\.secret/i, /\.key$/i, /\.pem$/i, /\.pfx$/i, /\.p12$/i, /\.cred/i,
  /id_rsa/i, /id_ed25519/i, /\/\.ssh\//i, /\/\.aws\//i, /\/\.gnupg\//i,
  /password/i, /token/i, /credential/i,
];

// Sensitive command patterns
const SENSITIVE_CMD_PATTERNS = [
  { pattern: /\bsudo\b/i, capability: 'elevated-privileges', label: 'sudo / elevated privileges' },
  { pattern: /\bchmod\s+[0-7]{3,4}\b/i, capability: 'permission-modification', label: 'file permission changes' },
  { pattern: /\bchown\b/i, capability: 'ownership-modification', label: 'file ownership changes' },
  { pattern: /\b(curl|wget)\s+.*\|.*sh/i, capability: 'remote-script-exec', label: 'piping remote script to shell' },
  { pattern: /\bgit\s+push\b/i, capability: 'remote-write', label: 'pushing to remote repository' },
  { pattern: /\bgit\s+push\s+--force\b/i, capability: 'force-push', label: 'force-pushing (history rewrite)' },
  { pattern: /\b(terraform|kubectl)\s+(apply|destroy|delete)\b/i, capability: 'infra-mutation', label: 'infrastructure mutation' },
  { pattern: /\bdocker\s+(run|exec|push)\b/i, capability: 'container-ops', label: 'container operations' },
  { pattern: /\b(npm|yarn|pnpm|pip|uv)\s+install\b/i, capability: 'dependency-install', label: 'installing dependencies' },
  { pattern: /\brm\s+-rf?\b/i, capability: 'destructive-delete', label: 'recursive file deletion' },
  { pattern: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE)/i, capability: 'destructive-db', label: 'destructive database operation' },
  { pattern: /\bkill\s+(-9\s+)?\d+/i, capability: 'process-kill', label: 'killing processes' },
];

// Capability categories for tools
const TOOL_CAPABILITIES: Record<string, string> = {
  Bash: 'shell-execution',
  Write: 'file-write',
  Edit: 'file-edit',
  MultiEdit: 'file-edit',
  Read: 'file-read',
  Glob: 'file-discovery',
  Grep: 'content-search',
  LS: 'file-discovery',
  WebFetch: 'network-fetch',
  WebSearch: 'network-search',
  Agent: 'sub-agent-spawn',
  Task: 'sub-agent-spawn',
  NotebookEdit: 'notebook-edit',
};

export function computeAuthorityExposure(session: Session): MetricResult {
  const events = session.events;
  const toolCalls = events.filter(e => e.kind === 'tool-call').map(e => e.data) as ToolCallEvent[];

  const entries: AuthorityEntry[] = [];
  const capabilities = new Set<string>();
  const sensitiveCapabilities = new Set<string>();
  const resourceScopes = new Set<string>();
  let blockedOps = 0;
  let deniedOps = 0;

  for (const tc of toolCalls) {
    const baseCapability = TOOL_CAPABILITIES[tc.toolName] ?? tc.toolName.toLowerCase();
    capabilities.add(baseCapability);

    // Check for sensitive file paths
    const inputStr = JSON.stringify(tc.toolInput);
    for (const pattern of SENSITIVE_PATH_PATTERNS) {
      if (pattern.test(inputStr)) {
        sensitiveCapabilities.add('sensitive-file-access');
        entries.push({
          toolCallId: tc.id,
          timestamp: tc.timestamp,
          capability: 'sensitive-file-access',
          status: tc.blocked ? 'blocked' : 'used',
          sensitive: true,
          resourceScope: extractPath(inputStr),
        });
      }
    }

    // Check for sensitive commands (Bash)
    if (tc.toolName === 'Bash') {
      const cmd = String(tc.toolInput.command ?? '');
      for (const { pattern, capability, label } of SENSITIVE_CMD_PATTERNS) {
        if (pattern.test(cmd)) {
          sensitiveCapabilities.add(capability);
          entries.push({
            toolCallId: tc.id,
            timestamp: tc.timestamp,
            capability,
            status: tc.blocked ? 'blocked' : tc.autoApproved ? 'used' : 'granted',
            sensitive: true,
            resourceScope: label,
          });
        }
      }
    }

    // Check for MCP tool access (external integrations)
    if (tc.toolName.startsWith('mcp__') || tc.toolName.startsWith('MCP')) {
      capabilities.add('mcp-integration');
      sensitiveCapabilities.add('mcp-integration');
      entries.push({
        toolCallId: tc.id,
        timestamp: tc.timestamp,
        capability: 'mcp-integration',
        status: 'used',
        sensitive: true,
        resourceScope: tc.toolName,
      });
    }

    // Track blocked/denied operations
    if (tc.blocked) {
      blockedOps++;
      entries.push({
        toolCallId: tc.id,
        timestamp: tc.timestamp,
        capability: baseCapability,
        status: 'blocked',
        sensitive: false,
      });
    }

    // Track resource scopes
    const path = extractPath(inputStr);
    if (path) {
      const scope = pathToScope(path);
      if (scope) resourceScopes.add(scope);
    }
  }

  // Compute permission mode exposure
  const bypassMode = session.permissionMode === 'bypassPermissions';
  const acceptEditsMode = session.permissionMode === 'acceptEdits';

  // Privilege Surface: number of distinct capabilities
  const privilegeSurface = capabilities.size;

  // Blast Radius: number of distinct resource scopes + sensitive capabilities
  const blastRadius = resourceScopes.size + sensitiveCapabilities.size;

  // Least-Privilege Gap: sensitive capabilities that were auto-approved
  const autoApprovedSensitive = entries.filter(e => e.sensitive && e.status === 'used').length;
  const leastPrivilegeGap = bypassMode ? autoApprovedSensitive : 0;

  return {
    name: 'Authority / Privilege Exposure',
    value: {
      privilegeSurface,
      blastRadius,
      leastPrivilegeGap,
    },
    raw: {
      capabilities: Array.from(capabilities),
      sensitiveCapabilities: Array.from(sensitiveCapabilities),
      resourceScopes: Array.from(resourceScopes),
      entries: entries.slice(0, 50),
      blockedOps,
      deniedOps,
      permissionMode: session.permissionMode,
      bypassMode,
      acceptEditsMode,
      autoApprovedSensitive,
    },
    description: 'Privilege surface, blast radius, and least-privilege gap based on capabilities exercised by the agent',
    interpretation: interpretAuthority(
      privilegeSurface,
      blastRadius,
      sensitiveCapabilities.size,
      blockedOps,
      bypassMode,
      autoApprovedSensitive,
    ),
  };
}

function extractPath(inputStr: string): string | undefined {
  // Try to extract file_path from tool input
  const match = inputStr.match(/"file_path"\s*:\s*"([^"]+)"/);
  if (match) return match[1];
  const pathMatch = inputStr.match(/"path"\s*:\s*"([^"]+)"/);
  if (pathMatch) return pathMatch[1];
  return undefined;
}

function pathToScope(path: string): string | undefined {
  if (path.startsWith('/')) {
    // Absolute path — get top 2 directory levels
    const parts = path.split('/').filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
    if (parts.length === 1) return `/${parts[0]}`;
  }
  if (path.startsWith('~')) return 'home-directory';
  return undefined;
}

function interpretAuthority(
  surface: number,
  blast: number,
  sensitive: number,
  blocked: number,
  bypass: boolean,
  autoSensitive: number,
): string {
  let parts: string[] = [];
  parts.push(`Privilege surface: ${surface} distinct capabilities`);
  parts.push(`Blast radius: ${blast} (resource scopes + sensitive capabilities)`);
  parts.push(`Sensitive capabilities: ${sensitive}`);
  if (bypass) {
    parts.push(`WARNING: bypassPermissions mode — agent had unrestricted access. ${autoSensitive} sensitive operations auto-executed.`);
  }
  if (blocked > 0) parts.push(`${blocked} operation(s) were blocked by hooks/permissions`);
  if (sensitive > 0 && blocked === 0 && !bypass) {
    parts.push(`${sensitive} sensitive capabilities were exercised without any blocks — review if all were necessary.`);
  }
  return parts.join('. ') + '.';
}
