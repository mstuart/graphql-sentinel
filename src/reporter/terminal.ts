import type { ScanReport, ScanResult, Severity } from '../types/index.js';

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

function severityColor(severity: Severity): string {
  switch (severity) {
    case 'critical':
      return COLORS.bgRed + COLORS.white;
    case 'high':
      return COLORS.red;
    case 'medium':
      return COLORS.yellow;
    case 'low':
      return COLORS.blue;
    case 'info':
      return COLORS.dim;
  }
}

function severityBadge(severity: Severity): string {
  const color = severityColor(severity);
  return `${color}[${severity.toUpperCase()}]${COLORS.reset}`;
}

function statusIcon(passed: boolean): string {
  return passed ? `${COLORS.green}PASS${COLORS.reset}` : `${COLORS.red}FAIL${COLORS.reset}`;
}

function formatResult(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(
    `  ${statusIcon(result.passed)} ${severityBadge(result.severity)} ${COLORS.bold}${result.title}${COLORS.reset}`,
  );
  lines.push(`       ${COLORS.dim}${result.description}${COLORS.reset}`);
  if (!result.passed) {
    lines.push(`       ${COLORS.cyan}Remediation: ${result.remediation}${COLORS.reset}`);
  }
  return lines.join('\n');
}

export function generateTerminalReport(report: ScanReport): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(
    `${COLORS.bold}${COLORS.magenta}=== GraphQL Sentinel Security Scan ===${COLORS.reset}`,
  );
  lines.push(`${COLORS.dim}Target:    ${report.target}${COLORS.reset}`);
  lines.push(`${COLORS.dim}Timestamp: ${report.timestamp}${COLORS.reset}`);
  lines.push(`${COLORS.dim}Duration:  ${report.duration}ms${COLORS.reset}`);
  lines.push('');

  // Results
  lines.push(`${COLORS.bold}Results:${COLORS.reset}`);
  lines.push('');

  for (const result of report.results) {
    lines.push(formatResult(result));
    lines.push('');
  }

  // Summary
  lines.push(`${COLORS.bold}${COLORS.magenta}--- Summary ---${COLORS.reset}`);
  lines.push(`  Total checks: ${report.summary.total}`);
  lines.push(`  ${COLORS.green}Passed: ${report.summary.passed}${COLORS.reset}`);
  lines.push(`  ${COLORS.red}Failed: ${report.summary.failed}${COLORS.reset}`);

  if (report.summary.failed > 0) {
    lines.push('');
    lines.push(`  ${COLORS.bold}Failures by severity:${COLORS.reset}`);
    for (const [severity, count] of Object.entries(report.summary.bySeverity)) {
      if (count > 0) {
        lines.push(`    ${severityBadge(severity as Severity)} ${count}`);
      }
    }
  }

  lines.push('');

  return lines.join('\n');
}
