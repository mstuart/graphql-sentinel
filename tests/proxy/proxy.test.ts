import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { createProxyServer } from '../../src/proxy/server.js';
import { startServer, stopServer } from '../scanner/mock-server.js';

describe('Proxy Server', () => {
  let upstreamServer: http.Server;
  let upstreamUrl: string;
  let proxyServer: http.Server;
  let proxyUrl: string;

  beforeAll(async () => {
    // Start upstream mock server
    const result = await startServer({
      introspectionEnabled: true,
      batchEnabled: true,
      getQueriesEnabled: true,
    });
    upstreamServer = result.server;
    upstreamUrl = result.url;

    // Start proxy server
    proxyServer = createProxyServer({
      target: upstreamUrl,
      port: 0,
      shield: {
        maxDepth: 5,
        maxAliases: 10,
        disableIntrospection: true,
      },
    });

    await new Promise<void>((resolve) => {
      proxyServer.listen(0, () => resolve());
    });

    const addr = proxyServer.address();
    if (addr && typeof addr === 'object') {
      proxyUrl = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      proxyServer.close(() => resolve());
    });
    await stopServer(upstreamServer);
  });

  it('should forward valid queries to upstream', async () => {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.__typename).toBe('Query');
  });

  it('should block introspection queries', async () => {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toBeDefined();
    expect(body.errors[0].extensions.code).toBe('GRAPHQL_SENTINEL_BLOCKED');
    expect(body.errors[0].message).toContain('__schema');
  });

  it('should block queries exceeding alias limit', async () => {
    const aliases = Array.from({ length: 20 }, (_, i) => `a${i}: __typename`).join(' ');
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toBeDefined();
    expect(body.errors[0].message).toContain('aliases');
  });

  it('should reject non-POST requests', async () => {
    const response = await fetch(proxyUrl, {
      method: 'GET',
    });

    expect(response.status).toBe(405);
  });

  it('should reject invalid JSON', async () => {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].message).toContain('Invalid JSON');
  });

  it('should reject requests without query field', async () => {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variables: {} }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].message).toContain('Missing or invalid query');
  });

  it('should handle CORS preflight requests', async () => {
    const response = await fetch(proxyUrl, {
      method: 'OPTIONS',
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('should return CORS headers on POST responses', async () => {
    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});

describe('Proxy Server with Rate Limiting', () => {
  let upstreamServer: http.Server;
  let upstreamUrl: string;
  let proxyServer: http.Server;
  let proxyUrl: string;

  beforeAll(async () => {
    const result = await startServer({ introspectionEnabled: true });
    upstreamServer = result.server;
    upstreamUrl = result.url;

    proxyServer = createProxyServer({
      target: upstreamUrl,
      port: 0,
      shield: {
        rateLimit: { window: 10000, max: 2 },
      },
    });

    await new Promise<void>((resolve) => {
      proxyServer.listen(0, () => resolve());
    });

    const addr = proxyServer.address();
    if (addr && typeof addr === 'object') {
      proxyUrl = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      proxyServer.close(() => resolve());
    });
    await stopServer(upstreamServer);
  });

  it('should enforce rate limiting', async () => {
    // First two requests should succeed
    const r1 = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    expect(r1.status).toBe(200);

    const r2 = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    expect(r2.status).toBe(200);

    // Third request should be rate limited
    const r3 = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ __typename }' }),
    });
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.errors[0].message).toContain('Rate limit');
  });
});
