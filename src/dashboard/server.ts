/**
 * Dashboard server — serves the Human-Agent Control Observatory web UI.
 *
 * Provides:
 *   GET  /            → Dashboard HTML
 *   GET  /api/sessions → List available sessions
 *   GET  /api/session/:id → Get session report with all metrics
 *   GET  /api/summary → Aggregate summary across recent sessions
 *   POST /api/refresh → Re-scan transcripts
 */

import express from 'express';
import { TranscriptCollector } from '../collectors/transcript-collector.js';
import { RiskClassifier } from '../risk/classifier.js';
import { MetricEngine } from '../metrics/engine.js';
import { DASHBOARD_HTML } from './html.js';

export class DashboardServer {
  private app: express.Express;
  private classifier: RiskClassifier;
  private collector: TranscriptCollector;
  private engine: MetricEngine;
  private port: number;
  private server: ReturnType<express.Express['listen']> | null = null;

  constructor(port = 7777) {
    this.port = port;
    this.app = express();
    this.classifier = new RiskClassifier();
    this.collector = new TranscriptCollector(this.classifier);
    this.engine = new MetricEngine(this.classifier);
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.get('/', (_req, res) => {
      res.type('html').send(DASHBOARD_HTML);
    });

    this.app.get('/api/sessions', (_req, res) => {
      try {
        const sessions = this.collector.listSessions().slice(0, 50).map(s => ({
          sessionId: s.sessionId,
          projectDir: s.projectDir,
          size: s.size,
          mtime: s.mtime.toISOString(),
        }));
        res.json(sessions);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/session/:id', (req, res) => {
      try {
        const session = this.collector.getSessionById(req.params.id);
        if (!session) {
          res.status(404).json({ error: 'Session not found' });
          return;
        }
        const report = this.engine.compute(session);
        res.json(report);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/summary', (_req, res) => {
      try {
        const sessions = this.collector.getRecentSessions(20);
        const summary = this.engine.computeSummary(sessions);
        res.json(summary);
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/recent', (_req, res) => {
      try {
        const sessions = this.collector.getRecentSessions(10);
        const reports = sessions.map(s => this.engine.compute(s));
        res.json(reports.map(r => ({
          sessionId: r.sessionId,
          startTime: r.sessionStartTime,
          duration: r.duration,
          toolCalls: r.totalToolCalls,
          humanActions: r.totalHumanActions,
          riskDistribution: r.riskDistribution,
          metrics: r.metrics.map(m => ({
            name: m.name,
            value: m.value,
            interpretation: m.interpretation,
          })),
        })));
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.error(`[dashboard] Observatory running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}
