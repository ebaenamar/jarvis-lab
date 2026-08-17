/**
 * Visual renderer — produces terminal-friendly ASCII visualizations
 * for the Human-Agent Control Observatory.
 *
 * Uses fixed-width box drawing with visual-width-aware padding.
 */

import type { SessionReport, MetricResult, DevPhase } from './types.js';

const FULL = '█';
const EMPTY = '░';

/**
 * Generate an ASCII progress bar.
 * `pct` is 0-1.
 */
export function bar(pct: number, width = 10): string {
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.round(clamped * width);
  return FULL.repeat(filled) + EMPTY.repeat(width - filled);
}

/**
 * Label for human control level based on percentage.
 */
function controlLabel(humanPct: number): string {
  if (humanPct >= 0.8) return 'human-led';
  if (humanPct >= 0.5) return 'substantial';
  if (humanPct >= 0.3) return 'shared';
  if (humanPct >= 0.1) return 'minimal';
  return 'agent-controlled';
}

/**
 * Risk severity label.
 */
function riskLabel(value: number): string {
  if (value >= 50) return 'CRITICAL';
  if (value >= 30) return 'HIGH';
  if (value >= 15) return 'MODERATE';
  if (value >= 5) return 'LOW';
  return 'MINIMAL';
}

/**
 * Wrap text to a maximum width.
 */
function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current.length + word.length + 1 > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? current + ' ' + word : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Render the full visual report.
 */
export function renderReport(report: SessionReport): string {
  const L: string[] = [];

  // ── Header ──────────────────────────────────────────────────────
  L.push('');
  L.push('  ╔═══════════════════════════════════════════════════════════════╗');
  L.push('  ║         HUMAN-AGENT CONTROL OBSERVATORY                        ║');
  L.push('  ╚═══════════════════════════════════════════════════════════════╝');
  L.push('');
  L.push(`  Session   ${report.sessionId}`);
  L.push(`  Start     ${report.sessionStartTime}`);
  if (report.sessionEndTime) L.push(`  End       ${report.sessionEndTime}`);
  L.push(`  Duration  ${(report.duration / 60000).toFixed(1)} min`);
  L.push(`  Tools     ${report.totalToolCalls} calls   ·   ${report.totalHumanActions} human actions`);
  L.push('');

  // ── HUMAN CONTROL ───────────────────────────────────────────────
  const delegation = report.metrics.find(m => m.name === 'Delegation Ratio');

  L.push('  ┌─ HUMAN CONTROL ───────────────────────────────────────────────┐');
  L.push('  │                                                               │');

  const phases: { label: string; key: DevPhase }[] = [
    { label: 'Task definition', key: 'planning' },
    { label: 'Planning', key: 'planning' },
    { label: 'Implementation', key: 'implementation' },
    { label: 'Debugging', key: 'debugging' },
    { label: 'Verification', key: 'verification' },
    { label: 'Deployment', key: 'deployment' },
  ];

  if (delegation?.byPhase) {
    for (const { label, key } of phases) {
      const agentPct = typeof delegation.byPhase[key] === 'number' ? delegation.byPhase[key] as number : 0;
      const humanPct = 1 - agentPct;
      const b = bar(humanPct, 10);
      const lbl = controlLabel(humanPct);
      L.push(`  │  ${label.padEnd(18)} ${b}   ${lbl.padEnd(20)}│`);
    }
  }
  L.push('  │                                                               │');
  L.push('  └───────────────────────────────────────────────────────────────┘');
  L.push('');

  // ── CASCADE FLOW ────────────────────────────────────────────────
  const rae = report.metrics.find(m => m.name === 'Risk-Weighted Autonomy Exposure');
  const oversight = report.metrics.find(m => m.name === 'Oversight Coverage');
  const ivr = report.metrics.find(m => m.name === 'Independent Verification Rate');
  const authority = report.metrics.find(m => m.name === 'Authority / Privilege Exposure');
  const residual = report.metrics.find(m => m.name === 'Residual Unverified Risk');

  const delegationPct = delegation && typeof delegation.value === 'number'
    ? Math.round(delegation.value * 100) : 0;

  const changesRequiring = (ivr?.raw.changesRequiringVerification as number) ?? 0;
  const independentlyVerified = (ivr?.raw.independentlyVerified as number) ?? 0;

  const sensitiveCaps = (authority?.raw.sensitiveCapabilities as string[]) ?? [];
  const sensitiveUsed = (authority?.raw.autoApprovedSensitive as number) ?? sensitiveCaps.length;

  const residualNormalized = residual && typeof residual.value === 'object' && residual.value !== null
    ? (residual.value as { normalized: number }).normalized : 0;

  const highExpCount = (rae?.raw.highExposureCount as number) ?? 0;
  const rLabel = riskLabel(residualNormalized);

  L.push('  ┌─ CONTROL CASCADE ─────────────────────────────────────────────┐');
  L.push('  │                                                               │');
  L.push('  │  DELEGATION                                                   │');
  L.push(`  │  ${String(delegationPct).padStart(3)}%  ${bar(delegationPct / 100, 30)}${' '.repeat(Math.max(0, 24))}│`);
  L.push('  │                                                               │');
  L.push('  │                       ↓                                       │');
  L.push('  │                                                               │');
  L.push('  │  CODE CHANGES                                                 │');
  L.push(`  │  ${String(changesRequiring).padStart(3)} changes produced by agent${' '.repeat(Math.max(0, 28 - String(changesRequiring).length))}│`);
  L.push('  │                                                               │');
  L.push('  │                       ↓                                       │');
  L.push('  │                                                               │');
  L.push('  │  INDEPENDENTLY VERIFIED                                       │');
  const verifPct = changesRequiring > 0 ? independentlyVerified / changesRequiring : 0;
  const verifStr = `${independentlyVerified} / ${changesRequiring} verified`;
  L.push(`  │  ${verifStr.padEnd(20)} ${bar(verifPct, 20)}${' '.repeat(Math.max(0, 14))}│`);
  L.push('  │                                                               │');
  L.push('  │                       ↓                                       │');
  L.push('  │                                                               │');
  L.push('  │  SENSITIVE AUTHORITY USED                                     │');
  const sensStr = `${sensitiveUsed} sensitive capabilities`;
  L.push(`  │  ${sensStr}${' '.repeat(Math.max(0, 47 - sensStr.length))}│`);
  L.push('  │                                                               │');
  L.push('  │                       ↓                                       │');
  L.push('  │                                                               │');
  L.push('  │  RESIDUAL UNVERIFIED RISK                                     │');
  const resStr = `${residualNormalized.toFixed(1)} / 100`;
  L.push(`  │  ${resStr.padEnd(12)} [${rLabel}]${' '.repeat(Math.max(0, 37 - rLabel.length - resStr.length))}│`);
  L.push('  │                                                               │');
  L.push('  └───────────────────────────────────────────────────────────────┘');
  L.push('');

  // ── RISK DISTRIBUTION ───────────────────────────────────────────
  const rd = report.riskDistribution;
  const total = rd.critical + rd.high + rd.medium + rd.low;
  L.push('  ┌─ RISK DISTRIBUTION ───────────────────────────────────────────┐');
  L.push('  │                                                               │');
  if (total > 0) {
    const segments = [
      { label: 'Critical', count: rd.critical },
      { label: 'High', count: rd.high },
      { label: 'Medium', count: rd.medium },
      { label: 'Low', count: rd.low },
    ];
    for (const seg of segments) {
      if (seg.count === 0) continue;
      const pct = seg.count / total;
      const b = bar(pct, 20);
      const info = `${seg.label.padEnd(10)} ${b}  ${String(seg.count).padStart(4)} actions`;
      L.push(`  │  ${info}${' '.repeat(Math.max(0, 47 - info.length))}│`);
    }
  } else {
    L.push('  │  No tool calls.                                               │');
  }
  L.push('  │                                                               │');
  L.push('  └───────────────────────────────────────────────────────────────┘');
  L.push('');

  // ── METRIC DETAILS ──────────────────────────────────────────────
  for (const metric of report.metrics) {
    const title = metric.name.toUpperCase();
    const innerWidth = 61;
    L.push(`  ┌─ ${title} ${'─'.repeat(Math.max(0, innerWidth - title.length - 1))}┐`);
    L.push('  │                                                               │');

    // Value
    let valStr = '';
    if (typeof metric.value === 'number') {
      valStr = metric.value <= 1 ? `${(metric.value * 100).toFixed(1)}%` : metric.value.toFixed(2);
    } else if (typeof metric.value === 'object' && metric.value !== null) {
      valStr = Object.entries(metric.value).map(([k, v]) => `${k}: ${v}`).join('  ');
    }
    L.push(`  │  ${valStr}${' '.repeat(Math.max(0, innerWidth - valStr.length))}│`);

    // By phase
    if (metric.byPhase) {
      L.push('  │                                                               │');
      for (const [phase, val] of Object.entries(metric.byPhase)) {
        const numVal = typeof val === 'number' ? val : 0;
        const pct = Math.round(numVal * 100);
        const b = bar(numVal, 10);
        const info = `    ${phase.padEnd(16)} ${b}  ${String(pct).padStart(3)}%`;
        L.push(`  │${info}${' '.repeat(Math.max(0, innerWidth - info.length))}│`);
      }
    }

    // Interpretation
    if (metric.interpretation) {
      L.push('  │                                                               │');
      const wrapped = wrapText(metric.interpretation, innerWidth - 2);
      for (const w of wrapped) {
        L.push(`  │  ${w}${' '.repeat(Math.max(0, innerWidth - w.length - 2))}│`);
      }
    }

    L.push('  │                                                               │');
    L.push(`  └${'─'.repeat(innerWidth + 2)}┘`);
    L.push('');
  }

  // ── HIGH-EXPOSURE ACTIONS ───────────────────────────────────────
  if (rae && Array.isArray(rae.raw.highExposureActions) && rae.raw.highExposureActions.length > 0) {
    const actions = rae.raw.highExposureActions as Array<{ tool: string; risk: number; autonomy: number; exposure: number; timestamp: string }>;
    L.push('  ┌─ HIGH-EXPOSURE ACTIONS (risk × autonomy ≥ 49) ────────────────┐');
    L.push('  │                                                               │');
    for (const a of actions.slice(0, 10)) {
      const time = a.timestamp.substring(11, 19);
      const info = `${time}  ${a.tool.padEnd(12)} risk=${a.risk} auto=${a.autonomy} exp=${a.exposure}`;
      L.push(`  │  ${info}${' '.repeat(Math.max(0, 61 - info.length))}│`);
    }
    L.push('  │                                                               │');
    L.push(`  └${'─'.repeat(63)}┘`);
    L.push('');
  }

  // ── UNOVERSEEN HIGH-RISK ACTIONS ────────────────────────────────
  if (oversight && Array.isArray(oversight.raw.unoverseen) && oversight.raw.unoverseen.length > 0) {
    const actions = oversight.raw.unoverseen as Array<{ tool: string; risk: number; autonomy: number; timestamp: string; autoApproved: boolean }>;
    L.push('  ┌─ UNOVERSEEN HIGH-RISK ACTIONS ────────────────────────────────┐');
    L.push('  │                                                               │');
    for (const a of actions.slice(0, 10)) {
      const time = a.timestamp.substring(11, 19);
      const mode = a.autoApproved ? 'auto' : 'approved';
      const info = `${time}  ${a.tool.padEnd(12)} risk=${a.risk} auto=${a.autonomy} ${mode}`;
      L.push(`  │  ${info}${' '.repeat(Math.max(0, 61 - info.length))}│`);
    }
    L.push('  │                                                               │');
    L.push(`  └${'─'.repeat(63)}┘`);
    L.push('');
  }

  // ── TOP RESIDUAL RISK CONTRIBUTORS ──────────────────────────────
  if (residual && Array.isArray(residual.raw.topContributors) && residual.raw.topContributors.length > 0) {
    const contributors = residual.raw.topContributors as Array<{ description: string; residual: number; timestamp: string }>;
    L.push('  ┌─ TOP RESIDUAL RISK CONTRIBUTORS ──────────────────────────────┐');
    L.push('  │                                                               │');
    for (const c of contributors.slice(0, 10)) {
      const time = c.timestamp.substring(11, 19);
      const desc = c.description.length > 45 ? c.description.substring(0, 42) + '...' : c.description;
      const info = `${time}  ${desc.padEnd(45)} → ${c.residual.toFixed(1)}`;
      L.push(`  │  ${info}${' '.repeat(Math.max(0, 61 - info.length))}│`);
    }
    L.push('  │                                                               │');
    L.push(`  └${'─'.repeat(63)}┘`);
    L.push('');
  }

  return L.join('\n');
}

/**
 * Render a compact summary table for multiple sessions.
 */
export function renderSummaryTable(
  reports: Array<{
    sessionId: string;
    startTime: string;
    toolCalls: number;
    humanActions: number;
    riskDistribution: { critical: number; high: number; medium: number; low: number };
    metrics: MetricResult[];
  }>,
): string {
  const L: string[] = [];
  L.push('');
  L.push('  ╔═══════════════════════════════════════════════════════════════╗');
  L.push('  ║         CONTROL OBSERVATORY — RECENT SESSIONS                  ║');
  L.push('  ╚═══════════════════════════════════════════════════════════════╝');
  L.push('');
  L.push('  ┌────────────────────────┬───────┬────────┬────────┬────────┬────────┐');
  L.push('  │ Session                │ Tools │ Human  │ Deleg. │ RAE    │ Resid. │');
  L.push('  ├────────────────────────┼───────┼────────┼────────┼────────┼────────┤');

  for (const r of reports) {
    const getMetric = (name: string): string => {
      const m = r.metrics.find(m => m.name.includes(name));
      if (!m) return '-';
      if (typeof m.value === 'number') {
        return m.value <= 1 ? `${Math.round(m.value * 100)}%` : m.value.toFixed(1);
      }
      if (m.value && typeof m.value === 'object' && 'normalized' in m.value) {
        return (m.value as { normalized: number }).normalized.toFixed(0);
      }
      return '-';
    };
    const time = new Date(r.startTime).toLocaleDateString().substring(0, 10);
    const id = r.sessionId.substring(0, 12);
    L.push(`  │ ${id}  ${time} │ ${String(r.toolCalls).padStart(5)} │ ${String(r.humanActions).padStart(6)} │ ${getMetric('Delegation').padStart(6)} │ ${getMetric('Risk-Weighted').padStart(6)} │ ${getMetric('Residual').padStart(6)} │`);
  }

  L.push('  └────────────────────────┴───────┴────────┴────────┴────────┴────────┘');
  L.push('');
  return L.join('\n');
}
