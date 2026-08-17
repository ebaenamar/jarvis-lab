/**
 * Metric 4: Independent Verification Rate
 *
 *   changes independently verified
 *   ----------------------------
 *      changes requiring verification
 *
 * We mark explicitly who produced and who verified:
 *   Claude → Claude verifies        weak independence
 *   Claude → second model           medium
 *   Claude → CI/static analyzer     stronger
 *   Claude → human inspection       different channel
 *   Claude → human + CI             strongest evidence
 *
 * In software we have a unique advantage: we can approximate ground truth
 * with tests, static analysis, CI, human review, and post-hoc behavior.
 *
 * This metric distinguishes between:
 *   - Agent generated code
 *   - Agent generated test
 *   - Agent ran test
 *   - Agent said test passed
 * vs:
 *   - Human independently inspected diff
 *   - Existing test suite passed
 *   - Independent static analysis passed
 *   - Human manually exercised behavior
 */

import type { Session, TimelineEvent, MetricResult, ToolCallEvent, VerificationEvidence } from '../types.js';

// Tools that produce changes requiring verification
const CHANGE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// Tools that constitute verification
const VERIFICATION_TOOLS = new Set<string>();

export function computeIndependentVerification(session: Session): MetricResult {
  const events = session.events;
  const toolCalls = events.filter(e => e.kind === 'tool-call').map(e => e.data) as ToolCallEvent[];

  // Identify change-producing actions
  const changeActions = toolCalls.filter(tc => CHANGE_TOOLS.has(tc.toolName));

  if (changeActions.length === 0) {
    return {
      name: 'Independent Verification Rate',
      value: 1,
      raw: {
        changesRequiringVerification: 0,
        independentlyVerified: 0,
        verificationEvidence: [],
        verificationLevels: { weak: 0, medium: 0, strong: 0, strongest: 0, none: 0 },
      },
      description: 'Fraction of changes that were independently verified',
      interpretation: 'No code changes in this session. Verification is vacuously complete.',
    };
  }

  // Identify verification actions
  const verificationActions = toolCalls.filter(tc => tc.phase === 'verification');
  const humanVerifications = events
    .filter(e => e.kind === 'human-action')
    .map(e => e.data)
    .filter(ha => ha.kind === 'diff-review' || ha.kind === 'manual-test');

  // For each change action, find the strongest verification evidence
  const evidence: VerificationEvidence[] = [];
  const levels = { weak: 0, medium: 0, strong: 0, strongest: 0, none: 0 };

  for (const change of changeActions) {
    const changeTime = new Date(change.timestamp).getTime();
    const WINDOW = 300_000; // 5 minutes after the change

    // Find verification actions after this change
    const agentVerifications = verificationActions.filter(v => {
      const vTime = new Date(v.timestamp).getTime();
      return vTime > changeTime && vTime < changeTime + WINDOW;
    });

    const humanVerifs = humanVerifications.filter(v => {
      const vTime = new Date(v.timestamp).getTime();
      return vTime > changeTime && vTime < changeTime + WINDOW;
    });

    // Determine the strongest verification level
    let verifier: VerificationEvidence['verifier'] = 'none';
    let independence = 0;
    let method = 'none';

    if (humanVerifs.length > 0 && agentVerifications.some(v => isCI(v))) {
      // Human + CI
      verifier = 'human-plus-ci';
      independence = 1.0;
      method = 'human inspection + CI/static analysis';
      levels.strongest++;
    } else if (humanVerifs.length > 0) {
      // Human inspection
      verifier = 'human';
      independence = 0.8;
      method = humanVerifs[0].kind === 'diff-review' ? 'human diff review' : 'human manual test';
      levels.strong++;
    } else if (agentVerifications.some(v => isStaticAnalysis(v))) {
      // CI / static analyzer
      verifier = 'ci';
      independence = 0.7;
      method = 'static analysis / linting';
      levels.strong++;
    } else if (agentVerifications.some(v => isTestRun(v))) {
      // Agent ran tests — but did the agent write those tests?
      // Check if the agent also wrote the test files
      const agentWroteTests = changeActions.some(c =>
        c.id !== change.id &&
        c.toolName === 'Write' &&
        JSON.stringify(c.toolInput).match(/\.(test|spec)\./) !== null
      );
      if (agentWroteTests) {
        // Agent wrote both code and tests — weak independence
        verifier = 'agent-self';
        independence = 0.3;
        method = 'agent-authored tests';
        levels.weak++;
      } else {
        // Tests existed before (presumably human-written or pre-existing)
        verifier = 'ci';
        independence = 0.6;
        method = 'existing test suite';
        levels.medium++;
      }
    } else if (agentVerifications.length > 0) {
      // Some agent verification but unclear what
      verifier = 'agent-self';
      independence = 0.2;
      method = 'agent self-verification';
      levels.weak++;
    } else {
      // No verification found
      verifier = 'none';
      independence = 0;
      method = 'none';
      levels.none++;
    }

    evidence.push({
      toolCallId: change.id,
      verifier,
      independence,
      method,
      timestamp: change.timestamp,
    });
  }

  // Independent verification rate: changes with independence > 0.5
  const independentlyVerified = evidence.filter(e => e.independence > 0.5).length;
  const rate = changeActions.length > 0 ? independentlyVerified / changeActions.length : 0;

  return {
    name: 'Independent Verification Rate',
    value: rate,
    raw: {
      changesRequiringVerification: changeActions.length,
      independentlyVerified,
      unverified: changeActions.length - independentlyVerified,
      verificationEvidence: evidence,
      verificationLevels: levels,
      agentVerifications: verificationActions.length,
      humanVerifications: humanVerifications.length,
    },
    description: 'Fraction of code changes verified by an independent party (not the agent itself)',
    interpretation: interpretIVR(rate, changeActions.length, independentlyVerified, levels),
  };
}

function isCI(tc: ToolCallEvent): boolean {
  const inputStr = JSON.stringify(tc.toolInput).toLowerCase();
  return /\b(eslint|prettier|biome|ruff|flake8|mypy|pyright|tsc|typecheck|lint|static\s*analysis)\b/.test(inputStr) ||
         /\b(npm|yarn|pnpm)\s+run\s+(build|lint|typecheck)\b/.test(inputStr);
}

function isStaticAnalysis(tc: ToolCallEvent): boolean {
  return isCI(tc);
}

function isTestRun(tc: ToolCallEvent): boolean {
  const inputStr = JSON.stringify(tc.toolInput).toLowerCase();
  return /\b(pytest|unittest|jest|vitest|mocha|cargo\s+test|go\s+test|npm\s+test|yarn\s+test|pnpm\s+test)\b/.test(inputStr) ||
         /\b(npm|yarn|pnpm)\s+run\s+test\b/.test(inputStr);
}

function interpretIVR(
  rate: number,
  total: number,
  verified: number,
  levels: { weak: number; medium: number; strong: number; strongest: number; none: number },
): string {
  if (total === 0) return 'No changes requiring verification.';
  const pct = (rate * 100).toFixed(1);
  const unverified = levels.none;
  const weak = levels.weak;
  if (rate >= 0.8) return `${pct}% of changes independently verified (${verified}/${total}). Strong verification culture.`;
  if (rate >= 0.5) return `${pct}% of changes independently verified (${verified}/${total}). ${unverified} unverified, ${weak} only agent-self-verified.`;
  if (rate >= 0.3) return `${pct}% of changes independently verified (${verified}/${total}). ${unverified} unverified, ${weak} only agent-self-verified. Significant verification gap.`;
  return `${pct}% of changes independently verified (${verified}/${total}). ${unverified} unverified, ${weak} only agent-self-verified. Most changes lack independent verification.`;
}
