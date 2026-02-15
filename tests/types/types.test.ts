import { describe, it, expect } from 'vitest';
import type { Severity, ScanResult, ScanReport, ScannerConfig, ShieldConfig } from '../../src/types/index.js';

describe('Types', () => {
  it('should define Severity type correctly', () => {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    expect(severities).toHaveLength(5);
  });

  it('should define ScanResult interface', () => {
    const result: ScanResult = {
      check: 'test-check',
      severity: 'high',
      passed: true,
      title: 'Test Check',
      description: 'A test check',
      remediation: 'No action needed',
    };
    expect(result.check).toBe('test-check');
    expect(result.passed).toBe(true);
  });

  it('should define ScanReport interface', () => {
    const report: ScanReport = {
      target: 'http://localhost:4000/graphql',
      timestamp: new Date().toISOString(),
      duration: 1000,
      results: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
    };
    expect(report.target).toBe('http://localhost:4000/graphql');
  });

  it('should define ScannerConfig interface', () => {
    const config: ScannerConfig = {
      endpoint: 'http://localhost:4000/graphql',
      headers: { Authorization: 'Bearer token' },
      checks: ['introspection'],
      timeout: 5000,
    };
    expect(config.endpoint).toBe('http://localhost:4000/graphql');
  });

  it('should define ShieldConfig interface', () => {
    const config: ShieldConfig = {
      maxDepth: 10,
      maxComplexity: 1000,
      maxAliases: 15,
      disableIntrospection: true,
      rateLimit: { window: 60000, max: 100 },
    };
    expect(config.maxDepth).toBe(10);
  });
});
