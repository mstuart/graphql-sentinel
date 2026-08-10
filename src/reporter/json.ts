import type { ScanReport } from '../types/index.js';

export const generateJsonReport = (report: ScanReport): string => JSON.stringify(report, null, 2);
