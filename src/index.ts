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
import { renderReport, renderSummaryTable, bar } from './render.js';

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

      console.log(renderReport(report));
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

      // Build compact report array for the visual table
      const reports = sessions.map(s => {
        const r = engine.compute(s);
        return {
          sessionId: r.sessionId,
          startTime: r.sessionStartTime,
          toolCalls: r.totalToolCalls,
          humanActions: r.totalHumanActions,
          riskDistribution: r.riskDistribution,
          metrics: r.metrics,
        };
      });

      console.log(renderSummaryTable(reports));

      // Aggregate stats
      console.log('  ┌─ AGGREGATE ──────────────────────────────────────────────────┐');
      console.log('  │                                                              │');
      console.log(`  │  Sessions:       ${String(summary.totalSessions).padEnd(44)}    │`);
      console.log(`  │  Tool calls:     ${String(summary.totalToolCalls).padEnd(44)}    │`);
      console.log(`  │  Human actions:  ${String(summary.totalHumanActions).padEnd(44)}    │`);
      console.log('  │                                                              │');
      console.log('  │  Average metrics:                                            │');
      for (const [name, val] of Object.entries(summary.averageMetrics)) {
        const display = val <= 1 ? `${(val * 100).toFixed(1)}%` : val.toFixed(2);
        const b = val <= 1 ? bar(val) : bar(val / 10);
        console.log(`  │    ${name.padEnd(28)} ${b}  ${display.padEnd(8)}             │`);
      }
      console.log('  │                                                              │');
      const rd = summary.aggregateRiskDistribution;
      const totalRisk = rd.critical + rd.high + rd.medium + rd.low;
      if (totalRisk > 0) {
        console.log('  │  Risk distribution:                                          │');
        console.log(`  │    Critical: ${String(rd.critical).padStart(4)}   High: ${String(rd.high).padStart(4)}   Medium: ${String(rd.medium).padStart(4)}   Low: ${String(rd.low).padStart(4)}       │`);
      }
      console.log('  │                                                              │');
      console.log('  └──────────────────────────────────────────────────────────────┘');
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
