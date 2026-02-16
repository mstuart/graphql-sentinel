# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-15

### Added
- Security scanner with 7 automated checks (introspection, depth-limit, batch-attack, field-suggestion, alias-overloading, csrf, auth-bypass)
- Runtime shield with depth limiting, complexity analysis, alias limiting, and introspection control
- Sliding window rate limiter with per-client cost tracking
- Field-level authorization via GraphQL validation rules
- Plugins for GraphQL Yoga, Apollo Server, and Express
- Standalone reverse proxy with security enforcement
- Report generation: terminal, JSON, HTML, SARIF, and interactive dashboard
- Reusable GitHub Action for CI/CD security scanning
- CLI commands: `scan` and `proxy`
- Dual ESM/CJS output with full TypeScript declarations
