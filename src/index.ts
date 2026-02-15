export { runScan } from './scanner/index.js';
export { createShield } from './shield/index.js';
export { createDepthLimitRule } from './shield/depth-limiter.js';
export { createComplexityRule } from './shield/complexity-analyzer.js';
export { createAliasLimitRule } from './shield/alias-limiter.js';
export { createIntrospectionControlRule } from './shield/introspection-control.js';
export { createRateLimiter } from './shield/rate-limiter.js';
export { createFieldAuthRule } from './shield/field-auth.js';
export { useSentinelShield } from './plugins/yoga.js';
export { sentinelApolloPlugin } from './plugins/apollo.js';
export { sentinelMiddleware } from './plugins/express.js';
export { generateReport } from './reporter/index.js';
export { generateSarifReport } from './reporter/sarif.js';
export { generateDashboard, calculatePostureScore } from './reporter/dashboard.js';
export { createProxyServer, startProxy } from './proxy/server.js';
export { authBypassCheck } from './scanner/checks/auth-bypass.js';
export type {
  ScanReport,
  ScanResult,
  ScannerConfig,
  ShieldConfig,
  Severity,
  FieldAuthConfig,
  FieldAuthRule,
} from './types/index.js';
export type { ProxyConfig } from './proxy/server.js';
