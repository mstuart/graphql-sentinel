import { describe, it, expect } from 'vitest';
import type {
  Severity,
  ScanResult,
  ScanReport,
  ScannerConfig,
  ShieldConfig,
} from '../../src/types/index.js';

describe('Types', () => {
  it('should define Severity type correctly', () => {
    const severities: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];
    expect(severities).toHaveLength(5);
  });

  it('should define ScanResult interface', () => {
    const result: ScanResult = {
      check: 'test-check',
      description: 'A test check',
      passed: true,
      remediation: 'No action needed',
      severity: 'high',
      title: 'Test Check',
    };
    expect(result).toEqual({
      check: 'test-check',
      description: 'A test check',
      passed: true,
      remediation: 'No action needed',
      severity: 'high',
      title: 'Test Check',
    });
  });

  it('should define ScanReport interface', () => {
    const report: ScanReport = {
      duration: 1000,
      results: [],
      summary: {
        bySeverity: { critical: 0, high: 0, info: 0, low: 0, medium: 0 },
        failed: 0,
        passed: 0,
        total: 0,
      },
      target: 'http://localhost:4000/graphql',
      timestamp: (() => {
        const timestamp = new Date();
        return timestamp.toISOString();
      })(),
    };
    expect(report).toEqual({
      duration: 1000,
      results: [],
      summary: {
        bySeverity: { critical: 0, high: 0, info: 0, low: 0, medium: 0 },
        failed: 0,
        passed: 0,
        total: 0,
      },
      target: 'http://localhost:4000/graphql',
      timestamp: report.timestamp,
    });
  });

  it('should define ScannerConfig interface', () => {
    const config: ScannerConfig = {
      checks: ['introspection'],
      endpoint: 'http://localhost:4000/graphql',
      headers: { Authorization: 'Bearer token' },
      timeout: 5000,
    };
    expect(config).toEqual({
      checks: ['introspection'],
      endpoint: 'http://localhost:4000/graphql',
      headers: { Authorization: 'Bearer token' },
      timeout: 5000,
    });
  });

  it('should define ShieldConfig interface', () => {
    const config: ShieldConfig = {
      disableIntrospection: true,
      maxAliases: 15,
      maxComplexity: 1000,
      maxDepth: 10,
      rateLimit: { max: 100, window: 60_000 },
    };
    expect(config).toEqual({
      disableIntrospection: true,
      maxAliases: 15,
      maxComplexity: 1000,
      maxDepth: 10,
      rateLimit: { max: 100, window: 60_000 },
    });
  });
});
