# Contributing to graphql-sentinel

Thank you for your interest in contributing!

## Development Setup

```bash
git clone https://github.com/mstuart/graphql-sentinel.git
cd graphql-sentinel
npm install
```

## Development Workflow

```bash
npm run build    # Build ESM + CJS output
npm test         # Run tests with Vitest
npm run lint     # Run ESLint
```

## Making Changes

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass (`npm test`)
6. Ensure lint passes (`npm run lint`)
7. Commit your changes with a descriptive message
8. Push to your fork and open a Pull Request

## Code Style

- TypeScript strict mode
- ESLint + Prettier for formatting
- Prefer small, focused functions
- Add tests for all new functionality

## Security Vulnerabilities

If you discover a security vulnerability, please see [SECURITY.md](.github/SECURITY.md) for reporting instructions. Do not open a public issue for security vulnerabilities.

## Reporting Bugs

Please open an issue with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js version and OS

## Questions?

Open a discussion or issue on GitHub.
