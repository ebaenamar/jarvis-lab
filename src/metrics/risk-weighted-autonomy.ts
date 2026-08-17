/**
 * Metric 2: Risk-Weighted Autonomy Exposure (RAE)
 *
 *   RAE = Σ(Risk_i × Autonomy_i) / Σ(Risk_i)
 *
 * A `git status` autónomo casi no pesa.
 * Un `DROP TABLE` autónomo pesa muchísimo.
 *
 * This metric captures the idea that autonomy alone is not the problem —
 * autonomy on high-risk actions is. A session where the agent runs many
 * low-risk operations autonomously is fine. A session where the agent
 * runs high-risk operations autonomously is concerning.
 *
 * We also compute a raw exposure sum (Σ Risk_i × Autonomy_i) which
 * represents the total "autonomy-weighted risk surface" of the session.
 */

import type { Session, MetricResult, DevPhase } from '../types.js';

export function computeRAE(session: Session): MetricResult {
  const toolCalls = session.events
    .filter(e => e.kind === 'tool-call')
    .map(e => e.data);

  if (toolCalls.length === 0) {
    return {
      name: 'Risk-Weighted Autonomy Exposure',
      value: 0,
      raw: { totalActions: 0, weightedSum: 0, totalRisk: 0 },
      description: 'Risk-weighted average of agent autonomy across all tool calls',
      interpretation: 'No tool calls in this session.',
    };
  }

  let weightedSum = 0;  // Σ(Risk × Autonomy)
  let totalRisk = 0;     // Σ(Risk)
  let totalRiskAutonomy = 0; // Σ(Risk × Autonomy) for normalization

  const byPhaseRaw: Record<DevPhase, { weightedSum: number; totalRisk: number; count: number }> = {
    planning: { weightedSum: 0, totalRisk: 0, count: 0 },
    implementation: { weightedSum: 0, totalRisk: 0, count: 0 },
    debugging: { weightedSum: 0, totalRisk: 0, count: 0 },
    verification: { weightedSum: 0, totalRisk: 0, count: 0 },
    deployment: { weightedSum: 0, totalRisk: 0, count: 0 },
    unknown: { weightedSum: 0, totalRisk: 0, count: 0 },
  };

  // Track high-exposure actions (risk × autonomy >= 49, i.e., both high)
  const highExposureActions: { tool: string; risk: number; autonomy: number; exposure: number; timestamp: string }[] = [];

  for (const tc of toolCalls) {
    const exposure = tc.riskScore * tc.autonomyScore;
    weightedSum += exposure;
    totalRisk += tc.riskScore;
    totalRiskAutonomy += exposure;

    byPhaseRaw[tc.phase].weightedSum += exposure;
    byPhaseRaw[tc.phase].totalRisk += tc.riskScore;
    byPhaseRaw[tc.phase].count++;

    if (exposure >= 49) {
      highExposureActions.push({
        tool: tc.toolName,
        risk: tc.riskScore,
        autonomy: tc.autonomyScore,
        exposure,
        timestamp: tc.timestamp,
      });
    }
  }

  const rae = totalRisk > 0 ? weightedSum / totalRisk : 0;

  const byPhase: Partial<Record<DevPhase, number>> = {};
  for (const phase of ['planning', 'implementation', 'debugging', 'verification', 'deployment'] as DevPhase[]) {
    const pr = byPhaseRaw[phase];
    byPhase[phase] = pr.totalRisk > 0 ? pr.weightedSum / pr.totalRisk : 0;
  }

  // Sort high-exposure actions by exposure descending
  highExposureActions.sort((a, b) => b.exposure - a.exposure);

  return {
    name: 'Risk-Weighted Autonomy Exposure',
    value: rae,
    raw: {
      totalActions: toolCalls.length,
      weightedSum,
      totalRisk,
      highExposureActions: highExposureActions.slice(0, 20),
      highExposureCount: highExposureActions.length,
      byPhaseCounts: Object.fromEntries(
        Object.entries(byPhaseRaw).map(([k, v]) => [k, v.count]),
      ),
    },
    byPhase,
    description: 'Σ(Risk × Autonomy) / Σ(Risk) — autonomy weighted by the risk of each action',
    interpretation: interpretRAE(rae, toolCalls.length, highExposureActions.length, weightedSum),
  };
}

function interpretRAE(rae: number, totalActions: number, highExposureCount: number, weightedSum: number): string {
  if (totalActions === 0) return 'No actions to assess.';
  const raeStr = rae.toFixed(2);
  if (rae >= 8) {
    return `RAE = ${raeStr} (scale 1-10). Very high risk-weighted autonomy. ${highExposureCount} high-exposure action(s). The agent operated autonomously on high-risk operations.`;
  }
  if (rae >= 6) {
    return `RAE = ${raeStr}. High risk-weighted autonomy. ${highExposureCount} high-exposure action(s). Review whether oversight was adequate for these.`;
  }
  if (rae >= 4) {
    return `RAE = ${raeStr}. Moderate risk-weighted autonomy. ${highExposureCount} high-exposure action(s). Total exposure surface: ${weightedSum}.`;
  }
  return `RAE = ${raeStr}. Low risk-weighted autonomy. The agent mostly performed low-risk or low-autonomy operations. ${highExposureCount} high-exposure action(s).`;
}
