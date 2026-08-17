/**
 * Risk classification engine.
 *
 * Assigns risk (1-10) and autonomy (1-10) scores to tool calls based on
 * the tool type and its input arguments. The scoring is driven by
 * configurable risk profiles in config/risk-profiles.json.
 *
 * This is the core knowledge base that makes the metrics meaningful.
 * A `git status` autónomo casi no pesa; un `DROP TABLE` autónomo pesa muchísimo.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RiskProfile, InputPattern, DevPhase, ToolCallEvent } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface RiskAssessment {
  riskScore: number;
  autonomyScore: number;
  matchedPatterns: { label: string; riskDelta: number; autonomyDelta: number }[];
  phase: DevPhase;
}

export class RiskClassifier {
  private profiles: Map<string, RiskProfile> = new Map();
  private compiledPatterns: Map<string, { pattern: RegExp; config: InputPattern }[]> = new Map();

  constructor(profilesPath?: string) {
    const defaultPath = resolve(__dirname, '../../config/risk-profiles.json');
    this.loadProfiles(profilesPath ?? defaultPath);
  }

  private loadProfiles(path: string): void {
    const raw = readFileSync(path, 'utf-8');
    const profiles: RiskProfile[] = JSON.parse(raw);
    for (const p of profiles) {
      this.profiles.set(p.toolName, p);
      const compiled = (p.inputPatterns ?? []).map(ip => ({
        pattern: new RegExp(ip.pattern, 'i'),
        config: ip,
      }));
      this.compiledPatterns.set(p.toolName, compiled);
    }
  }

  /**
   * Classify a tool call, producing risk/autonomy scores and dev phase.
   */
  classify(toolName: string, toolInput: Record<string, unknown>): RiskAssessment {
    const profile = this.profiles.get(toolName);
    const baseRisk = profile?.baseRisk ?? 5;
    const baseAutonomy = profile?.baseAutonomy ?? 5;

    const inputStr = this.stringifyInput(toolInput);
    const patterns = this.compiledPatterns.get(toolName) ?? [];

    let riskScore = baseRisk;
    let autonomyScore = baseAutonomy;
    const matchedPatterns: RiskAssessment['matchedPatterns'] = [];

    for (const { pattern, config } of patterns) {
      if (pattern.test(inputStr)) {
        riskScore += config.riskDelta;
        autonomyScore += config.autonomyDelta;
        matchedPatterns.push({
          label: config.label,
          riskDelta: config.riskDelta,
          autonomyDelta: config.autonomyDelta,
        });
      }
    }

    // Clamp to 1-10
    riskScore = Math.max(1, Math.min(10, riskScore));
    autonomyScore = Math.max(1, Math.min(10, autonomyScore));

    const phase = this.inferPhase(toolName, toolInput, matchedPatterns);

    return { riskScore, autonomyScore, matchedPatterns, phase };
  }

  /**
   * Infer the development phase from tool name and input.
   */
  private inferPhase(
    toolName: string,
    toolInput: Record<string, unknown>,
    matchedPatterns: RiskAssessment['matchedPatterns'],
  ): DevPhase {
    const inputStr = this.stringifyInput(toolInput).toLowerCase();
    const labels = matchedPatterns.map(m => m.label.toLowerCase());

    // Verification: tests, linting, type checking, static analysis
    if (
      labels.some(l => l.includes('verification') || l.includes('test') || l.includes('lint') || l.includes('static analysis')) ||
      /\b(pytest|unittest|jest|vitest|mocha|cargo\s+test|go\s+test|npm\s+test|yarn\s+test)\b/.test(inputStr) ||
      /\b(eslint|prettier|biome|ruff|flake8|mypy|pyright|tsc|typecheck)\b/.test(inputStr)
    ) {
      return 'verification';
    }

    // Deployment: push, deploy, publish, terraform apply, kubectl apply
    if (
      labels.some(l => l.includes('push') || l.includes('deploy') || l.includes('infrastructure')) ||
      /\b(git\s+push|deploy|publish|terraform\s+apply|kubectl\s+apply|docker\s+push|release)\b/.test(inputStr)
    ) {
      return 'deployment';
    }

    // Debugging: error traces, log inspection, debugging tools
    if (
      /\b(debug|backtrace|stack\s+trace|error|exception|traceback|gdb|lldb|strace|dtrace)\b/.test(inputStr) ||
      toolName === 'Grep' && /\b(error|bug|fix|issue|traceback|exception)\b/.test(inputStr)
    ) {
      return 'debugging';
    }

    // Planning: TodoWrite, AskUserQuestion, reading docs, searching
    if (
      toolName === 'TodoWrite' ||
      toolName === 'AskUserQuestion' ||
      toolName === 'WebSearch' ||
      toolName === 'WebFetch' && /\b(docs|documentation|guide|tutorial|reference)\b/.test(inputStr)
    ) {
      return 'planning';
    }

    // Implementation: Write, Edit, MultiEdit, NotebookEdit
    if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
      return 'implementation';
    }

    // Read-only operations could be any phase, default to unknown
    if (['Read', 'Glob', 'Grep', 'LS', 'NotebookRead'].includes(toolName)) {
      return 'unknown';
    }

    return 'unknown';
  }

  /**
   * Convert tool input object to a string for pattern matching.
   */
  private stringifyInput(input: Record<string, unknown>): string {
    return JSON.stringify(input);
  }

  /**
   * Get all loaded profile names.
   */
  getProfileNames(): string[] {
    return Array.from(this.profiles.keys());
  }

  /**
   * Check if a tool call is considered "high-risk" (risk >= 7).
   */
  isHighRisk(assessment: RiskAssessment): boolean {
    return assessment.riskScore >= 7;
  }

  /**
   * Check if a tool call is considered "critical-risk" (risk >= 9).
   */
  isCriticalRisk(assessment: RiskAssessment): boolean {
    return assessment.riskScore >= 9;
  }

  /**
   * Categorize risk into a bucket.
   */
  riskBucket(riskScore: number): 'critical' | 'high' | 'medium' | 'low' {
    if (riskScore >= 9) return 'critical';
    if (riskScore >= 7) return 'high';
    if (riskScore >= 4) return 'medium';
    return 'low';
  }
}
