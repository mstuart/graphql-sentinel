import type { ScanReport, ScanResult, Severity } from '../types/index.js';

const COLORS = {
  bgRed: '\u{1B}[41m',
  blue: '\u{1B}[34m',
  bold: '\u{1B}[1m',
  cyan: '\u{1B}[36m',
  dim: '\u{1B}[2m',
  green: '\u{1B}[32m',
  magenta: '\u{1B}[35m',
  red: '\u{1B}[31m',
  reset: '\u{1B}[0m',
  white: '\u{1B}[37m',
  yellow: '\u{1B}[33m',
};

const severityColor = (severity: Severity): string => {
  switch (severity) {
    case 'critical': {
      return COLORS.bgRed + COLORS.white;
    }
    case 'high': {
      return COLORS.red;
    }
    case 'medium': {
      return COLORS.yellow;
    }
    case 'low': {
      return COLORS.blue;
    }
    case 'info': {
      return COLORS.dim;
    }
    default: {
      return COLORS.reset;
    }
  }
};

const severityBadge = (severity: Severity): string => {
  const color = severityColor(severity);
  return `${color}[${severity.toUpperCase()}]${COLORS.reset}`;
};

const statusIcon = (isPassed: boolean): string =>
  isPassed ? `${COLORS.green}PASS${COLORS.reset}` : `${COLORS.red}FAIL${COLORS.reset}`;

const formatResult = (result: ScanResult): string => {
  const lines: string[] = [
    `  ${statusIcon(result.passed)} ${severityBadge(result.severity)} ${COLORS.bold}${result.title}${COLORS.reset}`,
    `       ${COLORS.dim}${result.description}${COLORS.reset}`,
  ];
  if (!result.passed) {
    lines.push(`       ${COLORS.cyan}Remediation: ${result.remediation}${COLORS.reset}`);
  }
  return lines.join('\n');
};

export const generateTerminalReport = (report: ScanReport): string => {
  const lines: string[] = [
    '',
    `${COLORS.bold}${COLORS.magenta}=== GraphQL Sentinel Security Scan ===${COLORS.reset}`,
    `${COLORS.dim}Target:    ${report.target}${COLORS.reset}`,
    '',
    `${COLORS.dim}Timestamp: ${report.timestamp}${COLORS.reset}`,
    `${COLORS.dim}Duration:  ${report.duration}ms${COLORS.reset}`,
    '',
    `${COLORS.bold}Results:${COLORS.reset}`,
    '',
  ];

  // Header

  // Results

  for (const result of report.results) {
    lines.push(formatResult(result), '');
  }

  // Summary
  lines.push(
    `${COLORS.bold}${COLORS.magenta}--- Summary ---${COLORS.reset}`,
    `  Total checks: ${report.summary.total}`,
    `  ${COLORS.green}Passed: ${report.summary.passed}${COLORS.reset}`,
    `  ${COLORS.red}Failed: ${report.summary.failed}${COLORS.reset}`,
  );

  if (report.summary.failed > 0) {
    lines.push('', `  ${COLORS.bold}Failures by severity:${COLORS.reset}`);
    for (const [severity, count] of Object.entries(report.summary.bySeverity)) {
      if (count > 0) {
        lines.push(`    ${severityBadge(severity as Severity)} ${count}`);
      }
    }
  }

  lines.push('');

  return lines.join('\n');
};
