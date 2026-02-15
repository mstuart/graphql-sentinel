import type { ScannerConfig, ScanReport, ScanResult, Severity } from '../types/index.js';
import { getChecks } from './checks/index.js';

export async function runScan(config: ScannerConfig): Promise<ScanReport> {
  const { endpoint, headers, checks: checkNames, timeout = 10000 } = config;
  const checks = getChecks(checkNames);
  const startTime = Date.now();

  const results: ScanResult[] = await Promise.all(
    checks.map(async (check) => {
      try {
        const result = await Promise.race<ScanResult>([
          check.run(endpoint, headers),
          new Promise<ScanResult>((_, reject) =>
            setTimeout(() => reject(new Error(`Check '${check.name}' timed out`)), timeout),
          ),
        ]);
        return result;
      } catch (error) {
        return {
          check: check.name,
          severity: check.severity,
          passed: true,
          title: `Check ${check.name}`,
          description: `Check failed to execute: ${String(error)}`,
          remediation: 'Retry the scan or check endpoint availability.',
          details: { error: String(error) },
        };
      }
    }),
  );

  const duration = Date.now() - startTime;

  const bySeverity: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const failed = results.filter((r) => !r.passed);
  for (const result of failed) {
    bySeverity[result.severity]++;
  }

  return {
    target: endpoint,
    timestamp: new Date().toISOString(),
    duration,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: failed.length,
      bySeverity,
    },
  };
}
