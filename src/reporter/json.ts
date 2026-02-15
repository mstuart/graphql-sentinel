import type { ScanReport } from '../types/index.js';

export function generateJsonReport(report: ScanReport): string {
  return JSON.stringify(report, null, 2);
}
