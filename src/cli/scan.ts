import fs from 'node:fs';
import { Command } from 'commander';
import { runScan } from '../scanner/runner.js';
import { generateReport } from '../reporter/index.js';
import type { ReportFormat } from '../reporter/index.js';

export const createScanCommand = (): Command => {
  const command = new Command('scan');

  return command
    .description('Scan a GraphQL endpoint for security vulnerabilities')
    .argument('<url>', 'GraphQL endpoint URL to scan')
    .option('-f, --format <format>', 'Output format (terminal, json, html)', 'terminal')
    .option('-o, --output <file>', 'Write report to file instead of stdout')
    .option('-H, --header <header...>', 'Custom headers (format: "Key: Value")')
    .option('-c, --checks <checks>', 'Comma-separated list of checks to run')
    .option('-t, --timeout <ms>', 'Timeout per check in milliseconds', '10000')
    .action(
      async (
        url: string,
        options: {
          format: string;
          output?: string;
          header?: string[];
          checks?: string;
          timeout: string;
        },
      ) => {
        const headers: Record<string, string> = {};
        if (options.header) {
          for (const h of options.header) {
            const colonIndex = h.indexOf(':');
            if (colonIndex > 0) {
              const key = h.slice(0, Math.max(0, colonIndex)).trim();
              const value = h.slice(Math.max(0, colonIndex + 1)).trim();
              headers[key] = value;
            }
          }
        }

        const checks = options.checks ? options.checks.split(',').map((c) => c.trim()) : undefined;
        const format = options.format as ReportFormat;

        if (!['terminal', 'json', 'html', 'sarif', 'dashboard'].includes(format)) {
          console.error(`Invalid format "${format}". Use: terminal, json, html, sarif, dashboard`);
          process.exit(1);
        }

        if (format === 'terminal') {
          console.log(`\nScanning ${url}...\n`);
        }

        // The catch converts scan failures into the CLI's documented exit code.
        // eslint-disable-next-line unicorn/try-complexity
        try {
          const report = await runScan({
            checks,
            endpoint: url,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            timeout: Number(options.timeout),
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
          console.error(`Scan failed: ${String(error)}`);
          process.exit(2);
        }
      },
    );
};
