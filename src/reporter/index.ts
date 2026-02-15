import type { ScanReport } from '../types/index.js';
import { generateJsonReport } from './json.js';
import { generateTerminalReport } from './terminal.js';
import { generateHtmlReport } from './html.js';
import { generateSarifReport } from './sarif.js';

export type ReportFormat = 'json' | 'terminal' | 'html' | 'sarif';

export function generateReport(report: ScanReport, format: ReportFormat): string {
  switch (format) {
    case 'json':
      return generateJsonReport(report);
    case 'terminal':
      return generateTerminalReport(report);
    case 'html':
      return generateHtmlReport(report);
    case 'sarif':
      return generateSarifReport(report);
    default:
      throw new Error(`Unknown report format: ${format}`);
  }
}

export { generateJsonReport } from './json.js';
export { generateTerminalReport } from './terminal.js';
export { generateHtmlReport } from './html.js';
export { generateSarifReport } from './sarif.js';
