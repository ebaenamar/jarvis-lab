/**
 * Metric 1: Delegation Ratio
 *
 * Not "what percentage of code did AI write" but:
 *   decisions made by agent / meaningful decisions in session
 *
 * Separated by dev phase: planning, implementation, debugging,
 * verification, deployment.
 *
 * A "meaningful decision" is any tool call that is not purely read-only
 * inspection (Read, Glob, Grep, LS, NotebookRead) — those are information
 * gathering, not decisions. Tool calls that modify state (Write, Edit,
 * Bash with side effects, etc.) are decisions. Human prompts that direct
 * the work are also decisions.
 */

import type { Session, TimelineEvent, MetricResult, DevPhase } from '../types.js';

const READ_ONLY_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead']);

export function computeDelegationRatio(session: Session): MetricResult {
  const events = session.events;

  // Count agent decisions (non-read-only tool calls) by phase
  const agentDecisionsByPhase: Record<DevPhase, number> = {
    planning: 0, implementation: 0, debugging: 0, verification: 0, deployment: 0, unknown: 0,
  };
  const humanDecisionsByPhase: Record<DevPhase, number> = {
    planning: 0, implementation: 0, debugging: 0, verification: 0, deployment: 0, unknown: 0,
  };

  let agentDecisions = 0;
  let humanDecisions = 0;

  for (const event of events) {
    if (event.kind === 'tool-call') {
      const tc = event.data;
      if (!READ_ONLY_TOOLS.has(tc.toolName)) {
        agentDecisions++;
        agentDecisionsByPhase[tc.phase]++;
      }
    } else if (event.kind === 'human-action') {
      const ha = event.data;
      // Human prompts that direct work are decisions (not just approvals or session events)
      if (['prompt', 'correction', 'pushback', 'plan-challenge', 'clarification', 'manual-edit'].includes(ha.kind)) {
        humanDecisions++;
        // Infer phase from surrounding context — use the most recent tool call phase
        const phase = inferPhaseFromContext(events, event);
        humanDecisionsByPhase[phase]++;
      }
    }
  }

  const totalDecisions = agentDecisions + humanDecisions;
  const ratio = totalDecisions > 0 ? agentDecisions / totalDecisions : 0;

  const byPhase: Partial<Record<DevPhase, number>> = {};
  for (const phase of ['planning', 'implementation', 'debugging', 'verification', 'deployment'] as DevPhase[]) {
    const total = agentDecisionsByPhase[phase] + humanDecisionsByPhase[phase];
    byPhase[phase] = total > 0 ? agentDecisionsByPhase[phase] / total : 0;
  }

  return {
    name: 'Delegation Ratio',
    value: ratio,
    raw: {
      agentDecisions,
      humanDecisions,
      totalDecisions,
      agentDecisionsByPhase,
      humanDecisionsByPhase,
    },
    byPhase,
    description: 'Fraction of meaningful decisions made by the agent vs the human, broken down by development phase',
    interpretation: interpretDelegationRatio(ratio, agentDecisions, humanDecisions),
  };
}

function inferPhaseFromContext(events: TimelineEvent[], currentEvent: TimelineEvent): DevPhase {
  const idx = events.indexOf(currentEvent);
  // Look backwards for the most recent tool call
  for (let i = idx - 1; i >= 0; i--) {
    const ev = events[i];
    if (ev.kind === 'tool-call') {
      return ev.data.phase;
    }
  }
  return 'planning';
}

function interpretDelegationRatio(ratio: number, agent: number, human: number): string {
  if (agent + human === 0) return 'No meaningful decisions detected in this session.';
  const pct = (ratio * 100).toFixed(1);
  if (ratio > 0.9) return `Agent made ${pct}% of decisions (${agent}/${agent + human}). Very high delegation — verify the human was meaningfully engaged.`;
  if (ratio > 0.7) return `Agent made ${pct}% of decisions (${agent}/${agent + human}). High delegation. Check oversight coverage for high-risk actions.`;
  if (ratio > 0.5) return `Agent made ${pct}% of decisions (${agent}/${agent + human}). Moderate delegation with human involvement.`;
  if (ratio > 0.3) return `Agent made ${pct}% of decisions (${agent}/${agent + human}). Human-led session with agent assistance.`;
  return `Agent made ${pct}% of decisions (${agent}/${agent + human}). Human-directed session.`;
}
