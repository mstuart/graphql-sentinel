import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startServer, stopServer } from './mock-server.js';
import { introspectionCheck } from '../../src/scanner/checks/introspection.js';
import { depthLimitCheck } from '../../src/scanner/checks/depth-limit.js';
import { batchAttackCheck } from '../../src/scanner/checks/batch-attack.js';
import { fieldSuggestionCheck } from '../../src/scanner/checks/field-suggestion.js';
import { aliasOverloadingCheck } from '../../src/scanner/checks/alias-overloading.js';
import { csrfCheck } from '../../src/scanner/checks/csrf.js';

describe('Scanner Checks - Vulnerable Server', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    const result = await startServer({
      introspectionEnabled: true,
      depthLimitEnabled: false,
      batchEnabled: true,
      fieldSuggestionsEnabled: true,
      aliasLimitEnabled: false,
      getQueriesEnabled: true,
    });
    server = result.server;
    url = result.url;
  });

  afterAll(async () => {
    await stopServer(server);
  });

  it('should detect introspection enabled', async () => {
    const result = await introspectionCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('introspection');
    expect(result.severity).toBe('medium');
    expect(result.title).toBe('Introspection Enabled');
  });

  it('should detect no depth limit', async () => {
    const result = await depthLimitCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('depth-limit');
    expect(result.severity).toBe('high');
  });

  it('should detect batch queries allowed', async () => {
    const result = await batchAttackCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('batch-attack');
    expect(result.severity).toBe('medium');
  });

  it('should detect field suggestions exposed', async () => {
    const result = await fieldSuggestionCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('field-suggestion');
    expect(result.severity).toBe('low');
  });

  it('should detect alias overloading possible', async () => {
    const result = await aliasOverloadingCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('alias-overloading');
    expect(result.severity).toBe('medium');
  });

  it('should detect CSRF via GET queries', async () => {
    const result = await csrfCheck.run(url);
    expect(result.passed).toBe(false);
    expect(result.check).toBe('csrf');
    expect(result.severity).toBe('high');
  });
});

describe('Scanner Checks - Secured Server', () => {
  let server: http.Server;
  let url: string;

  beforeAll(async () => {
    const result = await startServer({
      introspectionEnabled: false,
      depthLimitEnabled: true,
      batchEnabled: false,
      fieldSuggestionsEnabled: false,
      aliasLimitEnabled: true,
      getQueriesEnabled: false,
    });
    server = result.server;
    url = result.url;
  });

  afterAll(async () => {
    await stopServer(server);
  });

  it('should pass when introspection is disabled', async () => {
    const result = await introspectionCheck.run(url);
    expect(result.passed).toBe(true);
  });

  it('should pass when depth limit is enforced', async () => {
    const result = await depthLimitCheck.run(url);
    expect(result.passed).toBe(true);
  });

  it('should pass when batch queries are disabled', async () => {
    const result = await batchAttackCheck.run(url);
    expect(result.passed).toBe(true);
  });

  it('should pass when field suggestions are hidden', async () => {
    const result = await fieldSuggestionCheck.run(url);
    expect(result.passed).toBe(true);
  });

  it('should pass when alias limit is enforced', async () => {
    const result = await aliasOverloadingCheck.run(url);
    expect(result.passed).toBe(true);
  });

  it('should pass when GET queries are disabled', async () => {
    const result = await csrfCheck.run(url);
    expect(result.passed).toBe(true);
  });
});
