import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { startServer, stopServer } from '../scanner/mock-server.js';
import { createScanCommand } from '../../src/cli/scan.js';

describe('CLI Scan Command', () => {
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

  it('should create a valid scan command', () => {
    const cmd = createScanCommand();
    expect(cmd.name()).toBe('scan');
    expect(cmd.description()).toContain('Scan');
  });

  it('should accept format option', () => {
    const cmd = createScanCommand();
    const formatOption = cmd.options.find((o) => o.long === '--format');
    expect(formatOption).toBeDefined();
  });

  it('should accept output option', () => {
    const cmd = createScanCommand();
    const outputOption = cmd.options.find((o) => o.long === '--output');
    expect(outputOption).toBeDefined();
  });

  it('should accept header option', () => {
    const cmd = createScanCommand();
    const headerOption = cmd.options.find((o) => o.long === '--header');
    expect(headerOption).toBeDefined();
  });

  it('should accept checks option', () => {
    const cmd = createScanCommand();
    const checksOption = cmd.options.find((o) => o.long === '--checks');
    expect(checksOption).toBeDefined();
  });

  it('should accept timeout option', () => {
    const cmd = createScanCommand();
    const timeoutOption = cmd.options.find((o) => o.long === '--timeout');
    expect(timeoutOption).toBeDefined();
  });
});
