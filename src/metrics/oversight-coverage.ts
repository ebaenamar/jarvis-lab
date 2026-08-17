/**
 * Metric 3: Oversight Coverage
 *
 *   high-risk actions with evidence of human oversight
 *   -----------------------------------------------
 *              all high-risk actions
 *
 * Evidence of oversight can be:
 *   - approval (permission was requested and granted)
 *   - inspection (human reviewed the diff or output)
 *   - interruption (human stopped the agent mid-task)
 *   - correction (human corrected the agent's output)
 *   - plan challenge (human pushed back on the approach)
 *   - manual test (human ran tests independently)
 *   - diff review (human reviewed the changes)
 *
 * This metric uses the Microsoft 4-phase oversight taxonomy:
 *   a priori control → co-planning → real-time monitoring → post-hoc review
 *
 * We compute both an overall coverage and a per-phase breakdown.
 */

import type { Session, TimelineEvent, MetricResult, ToolCallEvent, HumanActionEvent } from '../types.js';

const HIGH_RISK_THRESHOLD = 7;

export function computeOversightCoverage(session: Session): MetricResult {
  const events = session.events;
  const toolCalls = events.filter(e => e.kind === 'tool-call').map(e => e.data) as ToolCallEvent[];
  const humanActions = events.filter(e => e.kind === 'human-action').map(e => e.data) as HumanActionEvent[];

  const highRiskActions = toolCalls.filter(tc => tc.riskScore >= HIGH_RISK_THRESHOLD);

  if (highRiskActions.length === 0) {
    return {
      name: 'Oversight Coverage',
      value: 1,
      raw: {
        highRiskActions: 0,
        overseenActions: 0,
        oversightTypes: {},
        phases: { aPriori: 0, coPlanning: 0, runtimeMonitoring: 0, postHocReview: 0 },
      },
      description: 'Fraction of high-risk actions with evidence of human oversight',
      interpretation: 'No high-risk actions in this session. Oversight coverage is vacuously complete.',
    };
  }

  // For each high-risk action, check if there's oversight evidence
  const overseenActions: ToolCallEvent[] = [];
  const oversightTypes: Record<string, number> = {};
  const phaseCounts = { aPriori: 0, coPlanning: 0, runtimeMonitoring: 0, postHocReview: 0 };

  for (const tc of highRiskActions) {
    const oversight = detectOversight(tc, events, humanActions);
    if (oversight.found) {
      overseenActions.push(tc);
      for (const type of oversight.types) {
        oversightTypes[type] = (oversightTypes[type] ?? 0) + 1;
      }
      for (const phase of oversight.phases) {
        phaseCounts[phase]++;
      }
    }
  }

  const coverage = overseenActions.length / highRiskActions.length;

  return {
    name: 'Oversight Coverage',
    value: coverage,
    raw: {
      highRiskActions: highRiskActions.length,
      overseenActions: overseenActions.length,
      unoverseenActions: highRiskActions.length - overseenActions.length,
      oversightTypes,
      phases: phaseCounts,
      unoverseen: highRiskActions
        .filter(tc => !overseenActions.includes(tc))
        .map(tc => ({
          tool: tc.toolName,
          risk: tc.riskScore,
          autonomy: tc.autonomyScore,
          timestamp: tc.timestamp,
          autoApproved: tc.autoApproved,
        })),
    },
    description: 'Fraction of high-risk actions (risk ≥ 7) with evidence of human oversight',
    interpretation: interpretOversight(coverage, highRiskActions.length, overseenActions.length),
  };
}

interface OversightDetection {
  found: boolean;
  types: string[];
  phases: ('aPriori' | 'coPlanning' | 'runtimeMonitoring' | 'postHocReview')[];
}

function detectOversight(
  tc: ToolCallEvent,
  events: TimelineEvent[],
  humanActions: HumanActionEvent[],
): OversightDetection {
  const types: string[] = [];
  const phases: ('aPriori' | 'coPlanning' | 'runtimeMonitoring' | 'postHocReview')[] = [];

  const tcTime = new Date(tc.timestamp).getTime();
  const WINDOW_BEFORE = 60_000;  // 1 minute before
  const WINDOW_AFTER = 120_000;   // 2 minutes after

  // 1. Approval — not auto-approved means human had to approve
  if (!tc.autoApproved) {
    types.push('approval');
    phases.push('runtimeMonitoring');
  }

  // 2. Look for human actions around this tool call
  for (const ha of humanActions) {
    const haTime = new Date(ha.timestamp).getTime();
    const diff = haTime - tcTime;

    // Before the tool call — a priori / co-planning
    if (diff < 0 && diff > -WINDOW_BEFORE) {
      if (ha.kind === 'plan-challenge') {
        types.push('plan-challenge');
        phases.push('coPlanning');
      }
      if (ha.kind === 'clarification') {
        types.push('clarification');
        phases.push('aPriori');
      }
    }

    // After the tool call — runtime monitoring / post-hoc review
    if (diff > 0 && diff < WINDOW_AFTER) {
      if (ha.kind === 'correction') {
        types.push('correction');
        phases.push('runtimeMonitoring');
      }
      if (ha.kind === 'interruption') {
        types.push('interruption');
        phases.push('runtimeMonitoring');
      }
      if (ha.kind === 'pushback') {
        types.push('pushback');
        phases.push('runtimeMonitoring');
      }
      if (ha.kind === 'diff-review') {
        types.push('diff-review');
        phases.push('postHocReview');
      }
      if (ha.kind === 'manual-test') {
        types.push('manual-test');
        phases.push('postHocReview');
      }
    }
  }

  // 3. Check if a verification tool call follows this action (post-hoc)
  const tcIdx = events.findIndex(e => e.kind === 'tool-call' && e.data.id === tc.id);
  if (tcIdx >= 0) {
    for (let i = tcIdx + 1; i < Math.min(tcIdx + 10, events.length); i++) {
      const next = events[i];
      if (next.kind === 'tool-call') {
        const nextTc = next.data;
        const nextTime = new Date(nextTc.timestamp).getTime();
        if (nextTime - tcTime > WINDOW_AFTER) break;
        // If the next action is a verification action by the agent
        // that was triggered by a human prompt, it counts as post-hoc review
        if (nextTc.phase === 'verification') {
          // Check if there was a human prompt between tc and this verification
          for (let j = tcIdx + 1; j < i; j++) {
            const midEvent = events[j];
            if (midEvent.kind === 'human-action' && midEvent.data.kind === 'prompt') {
              types.push('agent-verification-after-prompt');
              phases.push('postHocReview');
              break;
            }
          }
        }
      }
    }
  }

  return {
    found: types.length > 0,
    types: [...new Set(types)],
    phases: [...new Set(phases)],
  };
}

function interpretOversight(coverage: number, total: number, overseen: number): string {
  const pct = (coverage * 100).toFixed(1);
  if (coverage >= 0.9) return `${pct}% of high-risk actions had oversight evidence (${overseen}/${total}). Strong oversight.`;
  if (coverage >= 0.7) return `${pct}% of high-risk actions had oversight evidence (${overseen}/${total}). Good oversight with some gaps.`;
  if (coverage >= 0.5) return `${pct}% of high-risk actions had oversight evidence (${overseen}/${total}). Partial oversight — ${total - overseen} high-risk action(s) lacked evidence.`;
  if (coverage >= 0.3) return `${pct}% of high-risk actions had oversight evidence (${overseen}/${total}). Weak oversight — ${total - overseen} high-risk action(s) lacked evidence.`;
  return `${pct}% of high-risk actions had oversight evidence (${overseen}/${total}). Minimal oversight — ${total - overseen} high-risk action(s) lacked evidence.`;
}
