import { Command } from 'commander';
import { runScan } from '../scanner/runner.js';
import { generateReport, type ReportFormat } from '../reporter/index.js';
import fs from 'node:fs';

export function createScanCommand(): Command {
  return new Command('scan')
    .description('Scan a GraphQL endpoint for security vulnerabilities')
    .argument('<url>', 'GraphQL endpoint URL to scan')
    .option('-f, --format <format>', 'Output format (terminal, json, html)', 'terminal')
    .option('-o, --output <file>', 'Write report to file instead of stdout')
    .option(
      '-H, --header <header...>',
      'Custom headers (format: "Key: Value")',
    )
    .option('-c, --checks <checks>', 'Comma-separated list of checks to run')
    .option('-t, --timeout <ms>', 'Timeout per check in milliseconds', '10000')
    .action(async (url: string, options: {
      format: string;
      output?: string;
      header?: string[];
      checks?: string;
      timeout: string;
    }) => {
      const headers: Record<string, string> = {};
      if (options.header) {
        for (const h of options.header) {
          const colonIdx = h.indexOf(':');
          if (colonIdx > 0) {
            const key = h.substring(0, colonIdx).trim();
            const value = h.substring(colonIdx + 1).trim();
            headers[key] = value;
          }
        }
      }

      const checks = options.checks ? options.checks.split(',').map((c) => c.trim()) : undefined;
      const format = options.format as ReportFormat;

      if (!['terminal', 'json', 'html', 'sarif'].includes(format)) {
        console.error(`Invalid format "${format}". Use: terminal, json, html, sarif`);
        process.exit(1);
      }

      if (format === 'terminal') {
        console.log(`\nScanning ${url}...\n`);
      }

      try {
        const report = await runScan({
          endpoint: url,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          checks,
          timeout: parseInt(options.timeout, 10),
        });

        const output = generateReport(report, format);

        if (options.output) {
          fs.writeFileSync(options.output, output, 'utf-8');
          console.log(`Report written to ${options.output}`);
        } else {
          console.log(output);
        }

        // Exit with code 1 if any critical or high severity failures
        const hasCriticalFailures = report.results.some(
          (r) => !r.passed && (r.severity === 'critical' || r.severity === 'high'),
        );

        if (hasCriticalFailures) {
          process.exit(1);
        }
      } catch (error) {
        console.error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(2);
      }
    });
}
