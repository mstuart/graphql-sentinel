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

# With custom headers
graphql-sentinel scan https://api.example.com/graphql -H "Authorization: Bearer token123"

# Run specific checks only
graphql-sentinel scan https://api.example.com/graphql --checks introspection,csrf,depth-limit

# Custom timeout per check (in ms)
graphql-sentinel scan https://api.example.com/graphql --timeout 15000
```

The CLI exits with code `1` if any critical or high severity issues are found, making it suitable for CI/CD pipelines.

## Security Checks

| Check | Severity | Description |
|-------|----------|-------------|
| `introspection` | Medium | Detects if introspection is enabled, exposing the full schema |
| `depth-limit` | High | Tests for absence of query depth limits (DoS vector) |
| `batch-attack` | Medium | Checks if batch queries are accepted (amplification attacks) |
| `field-suggestion` | Low | Detects field suggestions in error messages (schema enumeration) |
| `alias-overloading` | Medium | Tests if unlimited aliases are accepted (DoS vector) |
| `csrf` | High | Checks if queries are accepted via GET requests (CSRF risk) |

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

## Programmatic API

### Scanner

```typescript
import { runScan } from 'graphql-sentinel';

const report = await runScan({
  endpoint: 'https://api.example.com/graphql',
  headers: { Authorization: 'Bearer token' },
  checks: ['introspection', 'depth-limit', 'csrf'],
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
import { runScan, generateReport } from 'graphql-sentinel';

const report = await runScan({ endpoint: 'https://api.example.com/graphql' });

// Terminal output with ANSI colors
console.log(generateReport(report, 'terminal'));

// JSON
const json = generateReport(report, 'json');

// Self-contained HTML
const html = generateReport(report, 'html');
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

### Plugins

- `useSentinelShield(config?: ShieldConfig)` - GraphQL Yoga plugin
- `sentinelApolloPlugin(config?: ShieldConfig)` - Apollo Server plugin
- `sentinelMiddleware(schema, config?: ShieldConfig)` - Express middleware

### Reporter

- `generateReport(report: ScanReport, format: 'json' | 'terminal' | 'html'): string` - Generate formatted report

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -am 'feat: add my feature'`)
5. Push to the branch (`git push origin feature/my-feature`)
6. Open a Pull Request

## License

[MIT](LICENSE)
