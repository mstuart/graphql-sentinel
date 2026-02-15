# graphql-sentinel

[![CI](https://github.com/mstuart/graphql-sentinel/actions/workflows/ci.yml/badge.svg)](https://github.com/mstuart/graphql-sentinel/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/graphql-sentinel.svg)](https://www.npmjs.com/package/graphql-sentinel)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Comprehensive GraphQL security scanner and runtime shield. Detect vulnerabilities in your GraphQL API and protect it at runtime with validation rules and rate limiting.

## Quick Start

Scan any GraphQL endpoint for security vulnerabilities:

```bash
npx graphql-sentinel scan https://api.example.com/graphql
```

## Installation

```bash
npm install graphql-sentinel graphql
```

## CLI Usage

### Scan an endpoint

```bash
# Basic scan with terminal output
graphql-sentinel scan https://api.example.com/graphql

# JSON output
graphql-sentinel scan https://api.example.com/graphql --format json

# HTML report saved to file
graphql-sentinel scan https://api.example.com/graphql --format html --output report.html

# SARIF report for GitHub Security tab
graphql-sentinel scan https://api.example.com/graphql --format sarif --output report.sarif.json

# Security dashboard
graphql-sentinel scan https://api.example.com/graphql --format dashboard --output dashboard.html

# With custom headers
graphql-sentinel scan https://api.example.com/graphql -H "Authorization: Bearer token123"

# Run specific checks only
graphql-sentinel scan https://api.example.com/graphql --checks introspection,csrf,depth-limit,auth-bypass

# Custom timeout per check (in ms)
graphql-sentinel scan https://api.example.com/graphql --timeout 15000
```

The CLI exits with code `1` if any critical or high severity issues are found, making it suitable for CI/CD pipelines.

### Start a security proxy

```bash
# Basic proxy with depth limiting
graphql-sentinel proxy https://upstream-api.example.com/graphql --max-depth 10

# Full shield configuration
graphql-sentinel proxy https://upstream-api.example.com/graphql \
  --port 4000 \
  --max-depth 10 \
  --max-complexity 1000 \
  --max-aliases 15 \
  --disable-introspection \
  --rate-limit-window 60000 \
  --rate-limit-max 100

# Forward auth headers to upstream
graphql-sentinel proxy https://upstream-api.example.com/graphql \
  -H "X-API-Key: secret"
```

## Security Checks

| Check | Severity | Description |
|-------|----------|-------------|
| `introspection` | Medium | Detects if introspection is enabled, exposing the full schema |
| `depth-limit` | High | Tests for absence of query depth limits (DoS vector) |
| `batch-attack` | Medium | Checks if batch queries are accepted (amplification attacks) |
| `field-suggestion` | Low | Detects field suggestions in error messages (schema enumeration) |
| `alias-overloading` | Medium | Tests if unlimited aliases are accepted (DoS vector) |
| `csrf` | High | Checks if queries are accepted via GET requests (CSRF risk) |
| `auth-bypass` | High | Tests for authorization bypass by sending unauthenticated requests |

### Authorization Bypass Detection

The `auth-bypass` check tests your endpoint for missing or improperly configured authorization:

1. Sends a request without any auth headers
2. Sends a request with an empty Authorization header
3. Sends a request with an invalid Bearer token
4. If auth headers are provided, compares authenticated vs unauthenticated responses

If any unauthenticated request returns data, it flags a potential bypass. Public APIs (no auth configured) are reported as `info` severity rather than failures.

## Shield Middleware

Protect your GraphQL server at runtime with validation rules.

### GraphQL Yoga

```typescript
import { createYoga, createSchema } from 'graphql-yoga';
import { useSentinelShield } from 'graphql-sentinel';

const yoga = createYoga({
  schema: createSchema({ /* ... */ }),
  plugins: [
    useSentinelShield({
      maxDepth: 10,
      maxComplexity: 1000,
      maxAliases: 15,
      disableIntrospection: true,
      rateLimit: { window: 60000, max: 100 },
    }),
  ],
});
```

### Apollo Server

```typescript
import { ApolloServer } from '@apollo/server';
import { sentinelApolloPlugin } from 'graphql-sentinel';

const server = new ApolloServer({
  typeDefs,
  resolvers,
  plugins: [
    sentinelApolloPlugin({
      maxDepth: 10,
      maxComplexity: 1000,
      disableIntrospection: true,
    }),
  ],
});
```

### Express Middleware

```typescript
import express from 'express';
import { GraphQLSchema } from 'graphql';
import { sentinelMiddleware } from 'graphql-sentinel';

const app = express();
app.use(express.json());

// Apply before your GraphQL middleware
app.use('/graphql', sentinelMiddleware(schema, {
  maxDepth: 10,
  maxAliases: 15,
  disableIntrospection: true,
}));
```

### Field-Level Authorization

Enforce fine-grained authorization at the field level using GraphQL validation rules:

```typescript
import { createShield, createFieldAuthRule } from 'graphql-sentinel';

const shield = createShield({
  maxDepth: 10,
  fieldAuth: {
    rules: {
      'Query.users': { requireAuth: true, roles: ['admin'] },
      'Query.user': { requireAuth: true, permissions: ['read:users'] },
      'Mutation.deleteUser': { requireAuth: true, roles: ['admin'] },
      'User.email': { requireAuth: true },
    },
    extractContext: (context) => {
      // Extract user info from your GraphQL context
      const user = (context as any)?.user;
      if (!user) return null;
      return {
        authenticated: true,
        roles: user.roles || [],
        permissions: user.permissions || [],
      };
    },
  },
});

// Use with graphql's validate()
const errors = validate(schema, parse(query), shield.validationRules);
```

The `createFieldAuthRule` can also be used standalone:

```typescript
import { createFieldAuthRule } from 'graphql-sentinel';

const rule = createFieldAuthRule({
  rules: {
    'Query.sensitiveData': { requireAuth: true, roles: ['admin'] },
  },
  extractContext: (ctx) => /* ... */,
});

// Add to your validation rules array
const errors = validate(schema, document, [rule]);
```

## Proxy Mode

Run graphql-sentinel as a standalone reverse proxy that enforces security rules before forwarding requests to your upstream GraphQL server:

```typescript
import { createProxyServer, startProxy } from 'graphql-sentinel';

// Quick start
await startProxy({
  target: 'https://upstream-api.example.com/graphql',
  port: 4000,
  shield: {
    maxDepth: 10,
    maxComplexity: 1000,
    maxAliases: 15,
    disableIntrospection: true,
    rateLimit: { window: 60000, max: 100 },
  },
  headers: { 'X-API-Key': 'upstream-key' },
});

// Or get the raw http.Server for custom configuration
const server = createProxyServer({
  target: 'https://upstream-api.example.com/graphql',
  port: 4000,
  shield: { maxDepth: 10 },
});
server.listen(4000);
```

The proxy:
- Parses and validates all incoming GraphQL queries against shield rules
- Blocks queries that exceed depth, complexity, or alias limits
- Blocks introspection queries when configured
- Enforces rate limiting per client IP
- Forwards valid queries to the upstream server
- Handles CORS headers automatically
- Returns `400` for blocked queries with detailed error messages
- Returns `429` for rate-limited requests

## Report Formats

### Terminal

ANSI-colored output for terminal/CLI usage.

### JSON

Machine-readable JSON output of the full scan report.

### HTML

Self-contained HTML report with styled results.

### SARIF (Static Analysis Results Interchange Format)

SARIF 2.1.0 compliant output for integration with GitHub's Security tab:

```bash
graphql-sentinel scan https://api.example.com/graphql --format sarif --output results.sarif
```

Upload to GitHub Security tab:

```yaml
- uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

### Dashboard

A rich, interactive security dashboard with:

- **Security posture score** (0-100) weighted by severity
- **Executive summary** suitable for management reporting
- **Category breakdown** (Authorization, DoS, Information Disclosure)
- **Expandable check details** with remediation guidance
- **Vulnerability timeline** tracking when multiple reports are provided
- **localStorage persistence** for building history across browser sessions
- Dark theme with professional styling, fully self-contained (no external dependencies)

```bash
graphql-sentinel scan https://api.example.com/graphql --format dashboard --output dashboard.html
```

Programmatic usage with multiple reports for timeline tracking:

```typescript
import { generateDashboard, runScan } from 'graphql-sentinel';

const reports = [previousReport, currentReport];
const html = generateDashboard(reports, { title: 'My API Security Dashboard' });
```

## GitHub Action

Use graphql-sentinel as a reusable GitHub Action in your CI/CD pipelines:

```yaml
jobs:
  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: mstuart/graphql-sentinel/.github/actions/scan@main
        with:
          endpoint: 'https://api.example.com/graphql'
          format: 'sarif'
          fail-on-severity: 'high'
          headers: |
            Authorization: Bearer ${{ secrets.API_TOKEN }}
```

### Action Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `endpoint` | Yes | - | GraphQL endpoint URL to scan |
| `format` | No | `terminal` | Output format (terminal, json, html, sarif) |
| `checks` | No | all | Comma-separated list of checks to run |
| `fail-on-severity` | No | `high` | Minimum severity to fail the build |
| `headers` | No | - | Headers, one per line ("Key: Value") |
| `timeout` | No | `10000` | Timeout per check in milliseconds |

### Action Outputs

| Output | Description |
|--------|-------------|
| `report` | Path to the generated report file |
| `passed` | Whether the scan passed (`true`/`false`) |

The action automatically uploads the report as a build artifact named `sentinel-security-report`.

## Programmatic API

### Scanner

```typescript
import { runScan } from 'graphql-sentinel';

const report = await runScan({
  endpoint: 'https://api.example.com/graphql',
  headers: { Authorization: 'Bearer token' },
  checks: ['introspection', 'depth-limit', 'csrf', 'auth-bypass'],
  timeout: 10000,
});

console.log(`Found ${report.summary.failed} issues`);
```

### Shield (Standalone)

```typescript
import { createShield } from 'graphql-sentinel';
import { validate, parse } from 'graphql';

const shield = createShield({
  maxDepth: 10,
  maxComplexity: 1000,
  maxAliases: 15,
  disableIntrospection: true,
  rateLimit: { window: 60000, max: 100 },
});

// Use validation rules with graphql's validate()
const errors = validate(schema, parse(query), shield.validationRules);

// Use rate limiter
if (shield.rateLimiter) {
  const { allowed, remaining } = shield.rateLimiter.check(clientIp, queryCost);
  if (!allowed) {
    throw new Error('Rate limit exceeded');
  }
}
```

### Report Generation

```typescript
import { runScan, generateReport, generateDashboard, generateSarifReport } from 'graphql-sentinel';

const report = await runScan({ endpoint: 'https://api.example.com/graphql' });

// Terminal output with ANSI colors
console.log(generateReport(report, 'terminal'));

// JSON
const json = generateReport(report, 'json');

// Self-contained HTML
const html = generateReport(report, 'html');

// SARIF for GitHub Security tab
const sarif = generateReport(report, 'sarif');

// Dashboard with timeline tracking
const dashboard = generateDashboard([report], { title: 'Security Dashboard' });
```

## Configuration Reference

### ScannerConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | required | GraphQL endpoint URL |
| `headers` | `Record<string, string>` | `undefined` | Custom HTTP headers |
| `checks` | `string[]` | all checks | List of check names to run |
| `timeout` | `number` | `10000` | Timeout per check in milliseconds |

### ShieldConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxDepth` | `number` | `undefined` | Maximum query nesting depth |
| `maxComplexity` | `number` | `undefined` | Maximum query complexity score |
| `maxAliases` | `number` | `undefined` | Maximum number of aliases per query |
| `disableIntrospection` | `boolean` | `false` | Block introspection queries |
| `costLimit` | `number` | `undefined` | Maximum query cost |
| `rateLimit.window` | `number` | `undefined` | Rate limit window in milliseconds |
| `rateLimit.max` | `number` | `undefined` | Maximum cost per window |
| `fieldAuth` | `FieldAuthConfig` | `undefined` | Field-level authorization rules |

### ProxyConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `string` | required | Upstream GraphQL endpoint URL |
| `port` | `number` | `4000` | Proxy listening port |
| `shield` | `ShieldConfig` | required | Shield configuration |
| `headers` | `Record<string, string>` | `undefined` | Headers to forward to upstream |
| `cors` | `boolean` | `true` | Enable CORS headers |

### FieldAuthConfig

| Option | Type | Description |
|--------|------|-------------|
| `rules` | `Record<string, FieldAuthRule>` | Map of `TypeName.fieldName` to auth rules |
| `extractContext` | `(context) => UserContext \| null` | Function to extract user context |

### FieldAuthRule

| Option | Type | Description |
|--------|------|-------------|
| `requireAuth` | `boolean` | Whether authentication is required |
| `roles` | `string[]` | Required roles (any match grants access) |
| `permissions` | `string[]` | Required permissions (any match grants access) |

## API Reference

### Scanner

- `runScan(config: ScannerConfig): Promise<ScanReport>` - Run security checks against an endpoint

### Shield

- `createShield(config: ShieldConfig): Shield` - Create shield with validation rules and rate limiter
- `createDepthLimitRule(maxDepth?: number)` - Create depth limit validation rule
- `createComplexityRule(config?: ComplexityConfig)` - Create complexity validation rule
- `createAliasLimitRule(maxAliases?: number)` - Create alias limit validation rule
- `createIntrospectionControlRule()` - Create introspection blocking rule
- `createRateLimiter(config: RateLimitConfig)` - Create sliding window rate limiter
- `createFieldAuthRule(config: FieldAuthConfig)` - Create field-level authorization rule

### Proxy

- `createProxyServer(config: ProxyConfig): http.Server` - Create proxy server instance
- `startProxy(config: ProxyConfig): Promise<http.Server>` - Create and start proxy server

### Plugins

- `useSentinelShield(config?: ShieldConfig)` - GraphQL Yoga plugin
- `sentinelApolloPlugin(config?: ShieldConfig)` - Apollo Server plugin
- `sentinelMiddleware(schema, config?: ShieldConfig)` - Express middleware

### Reporter

- `generateReport(report: ScanReport, format: 'json' | 'terminal' | 'html' | 'sarif' | 'dashboard'): string` - Generate formatted report
- `generateSarifReport(report: ScanReport): string` - Generate SARIF 2.1.0 report
- `generateDashboard(reports: ScanReport[], config?): string` - Generate security dashboard
- `calculatePostureScore(results: ScanResult[]): number` - Calculate security posture score (0-100)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -am 'feat: add my feature'`)
5. Push to the branch (`git push origin feature/my-feature`)
6. Open a Pull Request

## License

[MIT](LICENSE)
