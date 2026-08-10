import { setTimeout as delay } from 'node:timers/promises';
import { getChecks } from './checks/index.js';
import type { ScannerConfig, ScanReport, ScanResult, Severity } from '../types/index.js';

const rejectAfter = async (timeout: number, checkName: string): Promise<never> => {
  await delay(timeout, undefined, { ref: false });
  throw new Error(`Check '${checkName}' timed out`);
};

export const runScan = async (config: ScannerConfig): Promise<ScanReport> => {
  const { endpoint, headers, checks: checkNames, timeout = 10_000 } = config;
  const checks = getChecks(checkNames);
  const startTime = Date.now();

  const results: ScanResult[] = await Promise.all(
    checks.map(async (check) => {
      try {
        return await Promise.race<ScanResult>([
          check.run(endpoint, headers),
          rejectAfter(timeout, check.name),
        ]);
      } catch (error) {
        return {
          check: check.name,
          description: `Check failed to execute: ${String(error)}`,
          details: { error: String(error) },
          passed: true,
          remediation: 'Retry the scan or check endpoint availability.',
          severity: check.severity,
          title: `Check ${check.name}`,
        };
      }
    }),
  );

  const duration = Date.now() - startTime;

  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    info: 0,
    low: 0,
    medium: 0,
  };

  const failed = results.filter((r) => !r.passed);
  for (const result of failed) {
    bySeverity[result.severity] += 1;
  }

  const completedAt = new Date();

  return {
    duration,
    results,
    summary: {
      bySeverity,
      failed: failed.length,
      passed: results.filter((r) => r.passed).length,
      total: results.length,
    },
    target: endpoint,
    timestamp: completedAt.toISOString(),
  };
};
