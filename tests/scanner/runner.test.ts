import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runScan } from '../../src/scanner/runner.js';
import { startServer, stopServer } from './mock-server.js';
import type http from 'node:http';

describe('Scanner Runner', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    ({ server, url } = await startServer({
      aliasLimitEnabled: false,
      batchEnabled: true,
      depthLimitEnabled: false,
      fieldSuggestionsEnabled: true,
      getQueriesEnabled: true,
      introspectionEnabled: true,
    }));
  });

  afterAll(async () => {
    await stopServer(server);
  });

  it('should run all checks and return a report', async () => {
    const report = await runScan({ endpoint: url });

    expect(report.target).toBe(url);
    expect(report.timestamp).toBeDefined();
    expect(report.duration).toBeGreaterThanOrEqual(0);
    expect(report.results).toHaveLength(7);
    expect(report.summary.total).toBe(7);
    expect(report.summary.passed + report.summary.failed).toBe(7);
  });

  it('should filter checks by name', async () => {
    const report = await runScan({
      checks: ['introspection', 'csrf'],
      endpoint: url,
    });

    expect(report.results).toHaveLength(2);
    expect(report.results.map((r) => r.check)).toContain('introspection');
    expect(report.results.map((r) => r.check)).toContain('csrf');
  });

  it('should aggregate summary correctly', async () => {
    const report = await runScan({ endpoint: url });

    expect(report.summary.total).toBe(report.results.length);
    expect(report.summary.passed).toBe(report.results.filter((r) => r.passed).length);
    expect(report.summary.failed).toBe(report.results.filter((r) => !r.passed).length);

    // Verify bySeverity counts match failed results
    let severityTotal = 0;
    for (const count of Object.values(report.summary.bySeverity)) {
      severityTotal += count;
    }
    expect(severityTotal).toBe(report.summary.failed);
  });

  it('should handle timeout gracefully', async () => {
    const report = await runScan({
      checks: ['introspection'],
      endpoint: url,
      timeout: 10_000,
    });

    expect(report.results).toHaveLength(1);
    expect(report.results[0].check).toBe('introspection');
  });
});
