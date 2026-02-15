import { describe, it, expect } from 'vitest';
import type { ScanReport } from '../../src/types/index.js';
import { generateReport } from '../../src/reporter/index.js';
import { generateJsonReport } from '../../src/reporter/json.js';
import { generateTerminalReport } from '../../src/reporter/terminal.js';
import { generateHtmlReport } from '../../src/reporter/html.js';
import { generateSarifReport } from '../../src/reporter/sarif.js';
import { generateDashboard, calculatePostureScore } from '../../src/reporter/dashboard.js';

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

  it('should route to SARIF formatter', () => {
    const output = generateReport(mockReport, 'sarif');
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe('2.1.0');
  });

  it('should throw for unknown format', () => {
    expect(() => generateReport(mockReport, 'xml' as never)).toThrow('Unknown report format');
  });
});

describe('SARIF Reporter', () => {
  it('should generate valid SARIF JSON', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.$schema).toContain('sarif-schema-2.1.0');
  });

  it('should include tool driver information', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const driver = parsed.runs[0].tool.driver;
    expect(driver.name).toBe('graphql-sentinel');
    expect(driver.version).toBe('0.1.0');
    expect(driver.informationUri).toContain('graphql-sentinel');
  });

  it('should include rules for all check results', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;
    expect(rules).toHaveLength(3);
    expect(rules[0].id).toBe('introspection');
    expect(rules[1].id).toBe('depth-limit');
  });

  it('should only include failed results in results array', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;
    // mockReport has 2 failed results (introspection and depth-limit)
    expect(results).toHaveLength(2);
    expect(results[0].ruleId).toBe('introspection');
    expect(results[1].ruleId).toBe('depth-limit');
  });

  it('should map severity to SARIF levels correctly', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;
    // introspection is medium -> warning
    expect(results[0].level).toBe('warning');
    // depth-limit is high -> error
    expect(results[1].level).toBe('error');
  });

  it('should include location with target URI', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;
    expect(results[0].locations[0].physicalLocation.artifactLocation.uri).toBe(
      'http://localhost:4000/graphql',
    );
  });

  it('should include remediation as fix descriptions', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const results = parsed.runs[0].results;
    expect(results[0].fixes).toBeDefined();
    expect(results[0].fixes[0].description.text).toContain('Disable introspection');
  });

  it('should include security and graphql tags', () => {
    const output = generateSarifReport(mockReport);
    const parsed = JSON.parse(output);
    const rules = parsed.runs[0].tool.driver.rules;
    expect(rules[0].properties.tags).toContain('security');
    expect(rules[0].properties.tags).toContain('graphql');
  });

  it('should handle report with no failures', () => {
    const allPassedReport: ScanReport = {
      ...mockReport,
      results: [{ ...mockReport.results[2] }], // only the passing one
      summary: { total: 1, passed: 1, failed: 0, bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 } },
    };
    const output = generateSarifReport(allPassedReport);
    const parsed = JSON.parse(output);
    expect(parsed.runs[0].results).toHaveLength(0);
    expect(parsed.runs[0].tool.driver.rules).toHaveLength(1);
  });
});

describe('Dashboard Reporter', () => {
  it('should generate valid HTML', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('</html>');
    expect(output).toContain('Security Dashboard');
  });

  it('should include security posture score', () => {
    const output = generateDashboard([mockReport]);
    const score = calculatePostureScore(mockReport.results);
    expect(output).toContain(`>${score}<`);
    expect(output).toContain('Security Posture');
  });

  it('should include executive summary', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('Executive Summary');
    expect(output).toContain('localhost:4000');
  });

  it('should include category breakdown', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('Category Breakdown');
    expect(output).toContain('Information Disclosure');
    expect(output).toContain('Authorization');
  });

  it('should include check details with expandable sections', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('Check Details');
    expect(output).toContain('Introspection Enabled');
    expect(output).toContain('No Query Depth Limit');
    expect(output).toContain('toggleCheck');
  });

  it('should include remediation for failed checks', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('Remediation');
    expect(output).toContain('Disable introspection');
  });

  it('should have dark theme styling', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('background:#0f172a');
    expect(output).toContain('color:#e2e8f0');
  });

  it('should include inline CSS with no external dependencies', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('<style>');
    expect(output).not.toContain('href="http');
    expect(output).not.toContain('src="http');
  });

  it('should include localStorage persistence script', () => {
    const output = generateDashboard([mockReport]);
    expect(output).toContain('localStorage');
    expect(output).toContain('graphql-sentinel-history');
  });

  it('should support custom title', () => {
    const output = generateDashboard([mockReport], { title: 'My API Security' });
    expect(output).toContain('My API Security');
  });

  it('should handle empty reports array', () => {
    const output = generateDashboard([]);
    expect(output).toContain('No reports provided');
  });
});

describe('calculatePostureScore', () => {
  it('should return 100 for all passed checks', () => {
    const results = [
      { ...mockReport.results[2] }, // passed
    ];
    expect(calculatePostureScore(results)).toBe(100);
  });

  it('should return 0 for all failed critical checks', () => {
    const results = [
      { ...mockReport.results[0], severity: 'critical' as const, passed: false },
    ];
    expect(calculatePostureScore(results)).toBe(0);
  });

  it('should return 100 for empty results', () => {
    expect(calculatePostureScore([])).toBe(100);
  });

  it('should weight severity correctly', () => {
    // One high failed, one low passed
    const results = [
      { ...mockReport.results[0], severity: 'high' as const, passed: false },
      { ...mockReport.results[2], severity: 'low' as const, passed: true },
    ];
    const score = calculatePostureScore(results);
    // high weight = 20, low weight = 5, total = 25, failed = 20
    // score = ((25-20)/25)*100 = 20
    expect(score).toBe(20);
  });

  it('should generate timeline SVG for multiple reports', () => {
    const report2: ScanReport = {
      ...mockReport,
      timestamp: '2024-02-15T10:30:00.000Z',
      summary: { ...mockReport.summary, passed: 2, failed: 1 },
    };
    const output = generateDashboard([mockReport, report2]);
    expect(output).toContain('Vulnerability Timeline');
    expect(output).toContain('<svg');
    expect(output).toContain('viewBox');
  });

  it('should not render timeline for single report', () => {
    const output = generateDashboard([mockReport]);
    expect(output).not.toContain('Vulnerability Timeline');
  });
});

describe('generateReport with dashboard', () => {
  it('should route to dashboard formatter', () => {
    const output = generateReport(mockReport, 'dashboard');
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('Security Dashboard');
  });
});
