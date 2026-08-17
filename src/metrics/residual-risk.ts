/**
 * Metric 6: Residual Unverified Risk
 *
 *   ResidualRisk = Σ Impact_i × Autonomy_i × (1 - Verification_i)
 *
 * This is the star metric. It does NOT penalize autonomy.
 * It penalizes: autonomy + impact + absence of verification evidence.
 *
 * An agent that autonomously runs `git status` (low impact) with no
 * verification produces near-zero residual risk.
 *
 * An agent that autonomously writes code to production (high impact)
 * with no independent verification produces high residual risk.
 *
 * The verification factor (Verification_i) is derived from the
 * Independent Verification Rate metric's per-change evidence.
 */

import type { Session, TimelineEvent, MetricResult, ToolCallEvent, VerificationEvidence } from '../types.js';
import { computeIndependentVerification } from './independent-verification.js';

const CHANGE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

export function computeResidualRisk(session: Session): MetricResult {
  const events = session.events;
  const toolCalls = events.filter(e => e.kind === 'tool-call').map(e => e.data) as ToolCallEvent[];

  // Get verification evidence from the IVR metric
  const ivrResult = computeIndependentVerification(session);
  const evidenceMap = new Map<string, VerificationEvidence>();
  const evidenceList = (ivrResult.raw.verificationEvidence ?? []) as VerificationEvidence[];
  for (const ev of evidenceList) {
    evidenceMap.set(ev.toolCallId, ev);
  }

  let totalResidual = 0;
  const contributions: {
    tool: string;
    risk: number;
    autonomy: number;
    verification: number;
    residual: number;
    timestamp: string;
    description: string;
  }[] = [];

  for (const tc of toolCalls) {
    // Only change-producing actions contribute to residual risk
    if (!CHANGE_TOOLS.has(tc.toolName)) continue;

    const impact = tc.riskScore;  // Use risk score as impact proxy
    const autonomy = tc.autonomyScore;

    // Get verification factor (0 = no verification, 1 = fully verified)
    const evidence = evidenceMap.get(tc.id);
    const verification = evidence ? evidence.independence : 0;

    const residual = impact * autonomy * (1 - verification);
    totalResidual += residual;

    if (residual > 0) {
      contributions.push({
        tool: tc.toolName,
        risk: impact,
        autonomy,
        verification,
        residual,
        timestamp: tc.timestamp,
        description: describeContribution(tc, evidence),
      });
    }
  }

  // Sort by residual contribution descending
  contributions.sort((a, b) => b.residual - a.residual);

  // Normalize to 0-100 scale for readability
  // Theoretical max per action: 10 × 10 × 1 = 100
  // We report raw sum and a normalized "risk index"
  const maxPossible = toolCalls.filter(tc => CHANGE_TOOLS.has(tc.toolName)).length * 100;
  const normalized = maxPossible > 0 ? (totalResidual / maxPossible) * 100 : 0;

  return {
    name: 'Residual Unverified Risk',
    value: { raw: totalResidual, normalized },
    raw: {
      totalResidualRisk: totalResidual,
      normalizedRiskIndex: normalized,
      maxPossible,
      changeActions: toolCalls.filter(tc => CHANGE_TOOLS.has(tc.toolName)).length,
      topContributors: contributions.slice(0, 20),
      totalContributors: contributions.length,
    },
    description: 'Σ(Impact × Autonomy × (1 - Verification)) — risk that remains after accounting for verification',
    interpretation: interpretResidualRisk(totalResidual, normalized, contributions.length),
  };
}

function describeContribution(tc: ToolCallEvent, evidence?: VerificationEvidence): string {
  const fileMatch = JSON.stringify(tc.toolInput).match(/"file_path"\s*:\s*"([^"]+)"/);
  const file = fileMatch ? fileMatch[1] : 'unknown file';
  const verifStr = evidence ? evidence.method : 'no verification';
  return `${tc.toolName} → ${file} (risk=${tc.riskScore}, autonomy=${tc.autonomyScore}, verification: ${verifStr})`;
}

function interpretResidualRisk(raw: number, normalized: number, contributorCount: number): string {
  if (raw === 0) return 'Zero residual risk. All changes were verified or no changes were made.';
  if (normalized < 5) return `Residual risk index: ${normalized.toFixed(1)}/100 (raw: ${raw.toFixed(0)}). Very low — most changes were verified.`;
  if (normalized < 15) return `Residual risk index: ${normalized.toFixed(1)}/100 (raw: ${raw.toFixed(0)}). Low — some changes lacked verification.`;
  if (normalized < 30) return `Residual risk index: ${normalized.toFixed(1)}/100 (raw: ${raw.toFixed(0)}). Moderate — ${contributorCount} change(s) contributed unverified risk.`;
  if (normalized < 50) return `Residual risk index: ${normalized.toFixed(1)}/100 (raw: ${raw.toFixed(0)}). High — significant unverified autonomous changes. Review top contributors.`;
  return `Residual risk index: ${normalized.toFixed(1)}/100 (raw: ${raw.toFixed(0)}). Very high — many high-impact autonomous changes lacked independent verification.`;
}
