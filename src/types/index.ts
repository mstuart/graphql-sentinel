export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ScanResult {
  check: string;
  severity: Severity;
  passed: boolean;
  title: string;
  description: string;
  remediation: string;
  details?: Record<string, unknown>;
}

export interface ScanReport {
  target: string;
  timestamp: string;
  duration: number;
  results: ScanResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    bySeverity: Record<Severity, number>;
  };
}

export interface ScannerConfig {
  endpoint: string;
  headers?: Record<string, string>;
  checks?: string[];
  timeout?: number;
}

export interface ShieldConfig {
  maxDepth?: number;
  maxComplexity?: number;
  maxAliases?: number;
  maxDirectives?: number;
  disableIntrospection?: boolean;
  costLimit?: number;
  rateLimit?: { window: number; max: number };
}

export interface SecurityCheck {
  name: string;
  severity: Severity;
  run(endpoint: string, headers?: Record<string, string>): Promise<ScanResult>;
}
