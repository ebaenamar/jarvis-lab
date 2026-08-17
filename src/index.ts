#!/usr/bin/env node
/**
 * Jarvis Lab — Human-Agent Control Observatory
 *
 * CLI entry point for the metrics framework.
 *
 * Commands:
 *   jarvis-lab dashboard              Start the web dashboard
 *   jarvis-lab analyze [session-id]   Analyze a specific session (or most recent)
 *   jarvis-lab list                   List available sessions
 *   jarvis-lab watch                  Start OTel collector for real-time monitoring
 *   jarvis-lab install-hooks          Install Claude Code hooks for live capture
 *   jarvis-lab summary                Show aggregate summary of recent sessions
 */

import { RiskClassifier } from './risk/classifier.js';
import { TranscriptCollector } from './collectors/transcript-collector.js';
import { OtelCollector } from './collectors/otel-collector.js';
import { MetricEngine } from './metrics/engine.js';
import { DashboardServer } from './dashboard/server.js';
import { installHooks } from './hooks/install.js';

const command = process.argv[2] ?? 'help';
const arg = process.argv[3];

function usage(): void {
  console.log(`
Jarvis Lab — Human-Agent Control Observatory

Commands:
  dashboard              Start the web dashboard (default: http://localhost:7777)
  analyze [session-id]   Analyze a specific session, or the most recent one
  list                   List available Claude Code sessions
  watch [--port 4318]    Start OTel collector for real-time monitoring
  summary                Show aggregate summary of recent sessions
  install-hooks          Install Claude Code hooks for live event capture
  help                   Show this help message

Environment:
  JARVIS_DASHBOARD_PORT  Dashboard port (default: 7777)
  JARVIS_OTEL_PORT       OTel collector port (default: 4318)
`);
}

async function main(): Promise<void> {
  const classifier = new RiskClassifier();

  switch (command) {
    case 'dashboard': {
      const port = parseInt(process.env.JARVIS_DASHBOARD_PORT ?? '7777', 10);
      const server = new DashboardServer(port);
      await server.start();
      console.log(`\n  → Open http://localhost:${port} in your browser\n`);
      // Keep process alive
      process.on('SIGINT', async () => {
        await server.stop();
        process.exit(0);
      });
      break;
    }

    case 'analyze': {
      const collector = new TranscriptCollector(classifier);
      const engine = new MetricEngine(classifier);

      let session;
      if (arg) {
        session = collector.getSessionById(arg);
        if (!session) {
          console.error(`Session not found: ${arg}`);
          process.exit(1);
        }
      } else {
        const sessions = collector.listSessions();
        if (sessions.length === 0) {
          console.error('No sessions found.');
          process.exit(1);
        }
        const latest = sessions[0];
        console.error(`Analyzing most recent session: ${latest.sessionId} (${latest.projectDir})`);
        session = collector.parseSession(latest.filePath);
      }

      const report = engine.compute(session);

      console.log('\n' + '='.repeat(80));
      console.log('HUMAN-AGENT CONTROL OBSERVATORY — SESSION REPORT');
      console.log('='.repeat(80));
      console.log(`Session:     ${report.sessionId}`);
      console.log(`Start:       ${report.sessionStartTime}`);
      console.log(`End:         ${report.sessionEndTime ?? 'N/A'}`);
      console.log(`Duration:    ${(report.duration / 60000).toFixed(1)} minutes`);
      console.log(`Tool calls:  ${report.totalToolCalls}`);
      console.log(`Human acts:  ${report.totalHumanActions}`);
      console.log('');

      // Risk distribution
      console.log('─'.repeat(80));
      console.log('RISK DISTRIBUTION');
      console.log('─'.repeat(80));
      const rd = report.riskDistribution;
      const total = rd.critical + rd.high + rd.medium + rd.low;
      if (total > 0) {
        console.log(`  Critical (9-10): ${rd.critical}`);
        console.log(`  High (7-8):     ${rd.high}`);
        console.log(`  Medium (4-6):   ${rd.medium}`);
        console.log(`  Low (1-3):      ${rd.low}`);
      } else {
        console.log('  No tool calls.');
      }
      console.log('');

      // Metrics
      for (const metric of report.metrics) {
        console.log('─'.repeat(80));
        console.log(metric.name.toUpperCase());
        console.log('─'.repeat(80));
        if (typeof metric.value === 'number') {
          const display = metric.value <= 1
            ? `${(metric.value * 100).toFixed(1)}%`
            : metric.value.toFixed(2);
          console.log(`  Value: ${display}`);
        } else if (typeof metric.value === 'object' && metric.value !== null) {
          for (const [k, v] of Object.entries(metric.value)) {
            console.log(`  ${k}: ${v}`);
          }
        }
        console.log(`  ${metric.description}`);
        if (metric.interpretation) {
          console.log(`  → ${metric.interpretation}`);
        }
        if (metric.byPhase) {
          console.log('  By phase:');
          for (const [phase, val] of Object.entries(metric.byPhase)) {
            const numVal = typeof val === 'number' ? val : 0;
            const pct = (numVal * 100).toFixed(0);
            console.log(`    ${phase}: ${pct}%`);
          }
        }
        console.log('');
      }

      // Top high-exposure actions from RAE
      const rae = report.metrics.find(m => m.name === 'Risk-Weighted Autonomy Exposure');
      if (rae && Array.isArray(rae.raw.highExposureActions) && rae.raw.highExposureActions.length > 0) {
        console.log('─'.repeat(80));
        console.log('HIGH-EXPOSURE ACTIONS (risk × autonomy ≥ 49)');
        console.log('─'.repeat(80));
        for (const a of rae.raw.highExposureActions.slice(0, 10)) {
          console.log(`  [${a.timestamp}] ${a.tool} (risk=${a.risk}, auto=${a.autonomy}, exposure=${a.exposure})`);
        }
        console.log('');
      }

      // Unoverseen high-risk actions
      const oversight = report.metrics.find(m => m.name === 'Oversight Coverage');
      if (oversight && Array.isArray(oversight.raw.unoverseen) && oversight.raw.unoverseen.length > 0) {
        console.log('─'.repeat(80));
        console.log('UNOVERSEEN HIGH-RISK ACTIONS');
        console.log('─'.repeat(80));
        for (const a of oversight.raw.unoverseen.slice(0, 10)) {
          console.log(`  [${a.timestamp}] ${a.tool} (risk=${a.risk}, auto=${a.autonomy}) ${a.autoApproved ? '⚡auto-approved' : '✋approved'}`);
        }
        console.log('');
      }

      // Top residual risk contributors
      const residual = report.metrics.find(m => m.name === 'Residual Unverified Risk');
      if (residual && Array.isArray(residual.raw.topContributors) && residual.raw.topContributors.length > 0) {
        console.log('─'.repeat(80));
        console.log('TOP RESIDUAL RISK CONTRIBUTORS');
        console.log('─'.repeat(80));
        for (const c of residual.raw.topContributors.slice(0, 10)) {
          console.log(`  [${c.timestamp}] ${c.description} → residual=${c.residual.toFixed(1)}`);
        }
        console.log('');
      }

      console.log('='.repeat(80));
      break;
    }

    case 'list': {
      const collector = new TranscriptCollector(classifier);
      const sessions = collector.listSessions();
      if (sessions.length === 0) {
        console.log('No sessions found.');
        break;
      }
      console.log(`\nFound ${sessions.length} sessions:\n`);
      console.log('  Date                  Project                                          Size');
      console.log('  ' + '─'.repeat(76));
      for (const s of sessions.slice(0, 30)) {
        const date = new Date(s.mtime).toLocaleString();
        const size = (s.size / 1024).toFixed(0) + 'KB';
        const dir = s.projectDir.substring(0, 45).padEnd(46);
        const id = s.sessionId.substring(0, 12);
        console.log(`  ${date}  ${dir} ${size.padStart(8)}  ${id}...`);
      }
      if (sessions.length > 30) {
        console.log(`  ... and ${sessions.length - 30} more`);
      }
      break;
    }

    case 'watch': {
      const port = parseInt(process.env.JARVIS_OTEL_PORT ?? '4318', 10);
      const otelCollector = new OtelCollector(classifier, port);
      await otelCollector.start();
      console.log('\n  Waiting for Claude Code telemetry...');
      console.log('  Make sure Claude Code is configured to export OTel to this endpoint.\n');
      process.on('SIGINT', async () => {
        await otelCollector.stop();
        process.exit(0);
      });
      break;
    }

    case 'summary': {
      const collector = new TranscriptCollector(classifier);
      const engine = new MetricEngine(classifier);
      const sessions = collector.getRecentSessions(20);
      if (sessions.length === 0) {
        console.log('No sessions found.');
        break;
      }
      const summary = engine.computeSummary(sessions);
      console.log('\n' + '='.repeat(80));
      console.log('AGGREGATE SUMMARY — LAST 20 SESSIONS');
      console.log('='.repeat(80));
      console.log(`Sessions:      ${summary.totalSessions}`);
      console.log(`Tool calls:    ${summary.totalToolCalls}`);
      console.log(`Human actions: ${summary.totalHumanActions}`);
      console.log('');
      console.log('Average metrics:');
      for (const [name, val] of Object.entries(summary.averageMetrics)) {
        const display = val <= 1 ? `${(val * 100).toFixed(1)}%` : val.toFixed(2);
        console.log(`  ${name}: ${display}`);
      }
      console.log('');
      console.log('Aggregate risk distribution:');
      const rd = summary.aggregateRiskDistribution;
      console.log(`  Critical: ${rd.critical}, High: ${rd.high}, Medium: ${rd.medium}, Low: ${rd.low}`);
      console.log('');
      break;
    }

    case 'install-hooks': {
      await installHooks();
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      usage();
      break;
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
