import { describe, it, expect } from 'vitest';
import type { ScanReport } from '../../src/types/index.js';
import { generateReport } from '../../src/reporter/index.js';
import { generateJsonReport } from '../../src/reporter/json.js';
import { generateTerminalReport } from '../../src/reporter/terminal.js';
import { generateHtmlReport } from '../../src/reporter/html.js';

const mockReport: ScanReport = {
  target: 'http://localhost:4000/graphql',
  timestamp: '2024-01-15T10:30:00.000Z',
  duration: 1500,
  results: [
    {
      check: 'introspection',
      severity: 'medium',
      passed: false,
      title: 'Introspection Enabled',
      description: 'GraphQL introspection is enabled.',
      remediation: 'Disable introspection in production.',
    },
    {
      check: 'depth-limit',
      severity: 'high',
      passed: false,
      title: 'No Query Depth Limit',
      description: 'Server does not enforce depth limits.',
      remediation: 'Enforce query depth limits.',
    },
    {
      check: 'csrf',
      severity: 'high',
      passed: true,
      title: 'GET Mutations Allowed',
      description: 'Server does not accept GET queries.',
      remediation: 'Disable GET for mutations.',
    },
  ],
  summary: {
    total: 3,
    passed: 1,
    failed: 2,
    bySeverity: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
  },
};

describe('JSON Reporter', () => {
  it('should generate valid JSON', () => {
    const output = generateJsonReport(mockReport);
    const parsed = JSON.parse(output);
    expect(parsed.target).toBe('http://localhost:4000/graphql');
    expect(parsed.results).toHaveLength(3);
    expect(parsed.summary.total).toBe(3);
  });

  it('should be pretty-printed', () => {
    const output = generateJsonReport(mockReport);
    expect(output).toContain('\n');
    expect(output).toContain('  ');
  });
});

describe('Terminal Reporter', () => {
  it('should generate terminal output', () => {
    const output = generateTerminalReport(mockReport);
    expect(output).toContain('GraphQL Sentinel Security Scan');
    expect(output).toContain('localhost:4000');
    expect(output).toContain('Introspection Enabled');
    expect(output).toContain('No Query Depth Limit');
  });

  it('should include summary section', () => {
    const output = generateTerminalReport(mockReport);
    expect(output).toContain('Summary');
    expect(output).toContain('Total checks: 3');
    expect(output).toContain('Passed: 1');
    expect(output).toContain('Failed: 2');
  });

  it('should include remediation for failed checks', () => {
    const output = generateTerminalReport(mockReport);
    expect(output).toContain('Remediation:');
    expect(output).toContain('Disable introspection');
  });
});

describe('HTML Reporter', () => {
  it('should generate valid HTML', () => {
    const output = generateHtmlReport(mockReport);
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('</html>');
    expect(output).toContain('<head>');
    expect(output).toContain('<body>');
  });

  it('should include report data', () => {
    const output = generateHtmlReport(mockReport);
    expect(output).toContain('GraphQL Sentinel Security Report');
    expect(output).toContain('localhost:4000');
    expect(output).toContain('Introspection Enabled');
    expect(output).toContain('No Query Depth Limit');
  });

  it('should include inline CSS', () => {
    const output = generateHtmlReport(mockReport);
    expect(output).toContain('<style>');
    expect(output).toContain('</style>');
  });

  it('should include severity badges', () => {
    const output = generateHtmlReport(mockReport);
    expect(output).toContain('severity-badge');
    expect(output).toContain('HIGH');
    expect(output).toContain('MEDIUM');
  });

  it('should include remediation sections for failed checks', () => {
    const output = generateHtmlReport(mockReport);
    expect(output).toContain('Remediation');
    expect(output).toContain('Disable introspection');
  });

  it('should escape HTML in user data', () => {
    const reportWithHtml: ScanReport = {
      ...mockReport,
      target: '<script>alert("xss")</script>',
    };
    const output = generateHtmlReport(reportWithHtml);
    expect(output).not.toContain('<script>alert("xss")</script>');
    expect(output).toContain('&lt;script&gt;');
  });
});

describe('generateReport', () => {
  it('should route to JSON formatter', () => {
    const output = generateReport(mockReport, 'json');
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('should route to terminal formatter', () => {
    const output = generateReport(mockReport, 'terminal');
    expect(output).toContain('GraphQL Sentinel Security Scan');
  });

  it('should route to HTML formatter', () => {
    const output = generateReport(mockReport, 'html');
    expect(output).toContain('<!DOCTYPE html>');
  });

  it('should throw for unknown format', () => {
    expect(() => generateReport(mockReport, 'xml' as never)).toThrow('Unknown report format');
  });
});
