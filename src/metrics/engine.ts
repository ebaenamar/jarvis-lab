/**
 * Metric engine — computes all six metrics for a session and produces
 * a unified SessionReport.
 */

import type { Session, SessionReport, MetricResult, TimelineEvent, RiskDistribution } from '../types.js';
import { RiskClassifier } from '../risk/classifier.js';
import { computeDelegationRatio } from './delegation-ratio.js';
import { computeRAE } from './risk-weighted-autonomy.js';
import { computeOversightCoverage } from './oversight-coverage.js';
import { computeIndependentVerification } from './independent-verification.js';
import { computeAuthorityExposure } from './authority-exposure.js';
import { computeResidualRisk } from './residual-risk.js';

export class MetricEngine {
  private classifier: RiskClassifier;

  constructor(classifier?: RiskClassifier) {
    this.classifier = classifier ?? new RiskClassifier();
  }

  /**
   * Compute all six metrics for a session.
   */
  compute(session: Session): SessionReport {
    const metrics: MetricResult[] = [
      computeDelegationRatio(session),
      computeRAE(session),
      computeOversightCoverage(session),
      computeIndependentVerification(session),
      computeAuthorityExposure(session),
      computeResidualRisk(session),
    ];

    const toolCalls = session.events.filter(e => e.kind === 'tool-call').map(e => e.data);
    const humanActions = session.events.filter(e => e.kind === 'human-action').map(e => e.data);

    const riskDistribution: RiskDistribution = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const tc of toolCalls) {
      const bucket = this.classifier.riskBucket(tc.riskScore);
      riskDistribution[bucket]++;
    }

    const timeline = [...session.events].sort((a, b) =>
      a.data.timestamp.localeCompare(b.data.timestamp),
    );

    const duration = session.endTime
      ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
      : 0;

    return {
      sessionId: session.id,
      sessionStartTime: session.startTime,
      sessionEndTime: session.endTime,
      duration,
      metrics,
      totalToolCalls: toolCalls.length,
      totalHumanActions: humanActions.length,
      timeline,
      riskDistribution,
    };
  }

  /**
   * Compute a summary across multiple sessions.
   */
  computeSummary(sessions: Session[]): {
    totalSessions: number;
    totalToolCalls: number;
    totalHumanActions: number;
    averageMetrics: Record<string, number>;
    aggregateRiskDistribution: RiskDistribution;
    sessions: { sessionId: string; startTime: string; toolCalls: number; humanActions: number; metrics: MetricResult[] }[];
  } {
    const reports = sessions.map(s => this.compute(s));
    const aggregateRisk: RiskDistribution = { critical: 0, high: 0, medium: 0, low: 0 };
    let totalToolCalls = 0;
    let totalHumanActions = 0;

    for (const r of reports) {
      totalToolCalls += r.totalToolCalls;
      totalHumanActions += r.totalHumanActions;
      aggregateRisk.critical += r.riskDistribution.critical;
      aggregateRisk.high += r.riskDistribution.high;
      aggregateRisk.medium += r.riskDistribution.medium;
      aggregateRisk.low += r.riskDistribution.low;
    }

    // Average scalar metrics across sessions
    const metricSums: Record<string, { sum: number; count: number }> = {};
    for (const r of reports) {
      for (const m of r.metrics) {
        const val = typeof m.value === 'number' ? m.value : (m.value as { normalized?: number }).normalized ?? 0;
        if (!metricSums[m.name]) metricSums[m.name] = { sum: 0, count: 0 };
        metricSums[m.name].sum += val;
        metricSums[m.name].count++;
      }
    }

    const averageMetrics: Record<string, number> = {};
    for (const [name, { sum, count }] of Object.entries(metricSums)) {
      averageMetrics[name] = count > 0 ? sum / count : 0;
    }

    return {
      totalSessions: sessions.length,
      totalToolCalls,
      totalHumanActions,
      averageMetrics,
      aggregateRiskDistribution: aggregateRisk,
      sessions: reports.map(r => ({
        sessionId: r.sessionId,
        startTime: r.sessionStartTime,
        toolCalls: r.totalToolCalls,
        humanActions: r.totalHumanActions,
        metrics: r.metrics,
      })),
    };
  }
}
