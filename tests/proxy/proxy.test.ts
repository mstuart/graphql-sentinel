import { once } from 'node:events';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createProxyServer } from '../../src/proxy/server.js';
import { startServer, stopServer } from '../scanner/mock-server.js';
import type http from 'node:http';

describe('Proxy Server', () => {
  let upstreamServer: http.Server;
  let upstreamUrl: string;
  let proxyServer: http.Server;
  let proxyUrl: string;

  beforeAll(async () => {
    // Start upstream mock server
    const result = await startServer({
      batchEnabled: true,
      getQueriesEnabled: true,
      introspectionEnabled: true,
    });
    upstreamServer = result.server;
    upstreamUrl = result.url;

    // Start proxy server
    proxyServer = createProxyServer({
      port: 0,
      shield: {
        disableIntrospection: true,
        maxAliases: 10,
        maxDepth: 5,
      },
      target: upstreamUrl,
    });

    proxyServer.listen(0);
    await once(proxyServer, 'listening');

    const addr = proxyServer.address();
    if (addr && typeof addr === 'object') {
      proxyUrl = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    const closed = once(proxyServer, 'close');
    proxyServer.close();
    await closed;
    await stopServer(upstreamServer);
  });

  it('should forward valid queries to upstream', async () => {
    const response = await fetch(proxyUrl, {
      body: JSON.stringify({ query: '{ __typename }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toBeDefined();
    expect(body.data.__typename).toBe('Query');
  });

  it('should block introspection queries', async () => {
    const response = await fetch(proxyUrl, {
      body: JSON.stringify({ query: '{ __schema { types { name } } }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors).toBeDefined();
    expect(body.errors[0].extensions.code).toBe('GRAPHQL_SENTINEL_BLOCKED');
    expect(body.errors[0].message).toContain('__schema');
  });

  it('should block queries exceeding alias limit', async () => {
    const aliases = Array.from({ length: 20 }, (_, index) => `a${index}: __typename`).join(' ');
    const response = await fetch(proxyUrl, {
      body: JSON.stringify({ query: `{ ${aliases} }` }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
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
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.errors[0].message).toContain('Invalid JSON');
  });

  it('should reject requests without query field', async () => {
    const response = await fetch(proxyUrl, {
      body: JSON.stringify({ variables: {} }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
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
      body: JSON.stringify({ query: '{ __typename }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
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
      port: 0,
      shield: {
        rateLimit: { max: 2, window: 10_000 },
      },
      target: upstreamUrl,
    });

    proxyServer.listen(0);
    await once(proxyServer, 'listening');

    const addr = proxyServer.address();
    if (addr && typeof addr === 'object') {
      proxyUrl = `http://localhost:${addr.port}/graphql`;
    }
  });

  afterAll(async () => {
    const closed = once(proxyServer, 'close');
    proxyServer.close();
    await closed;
    await stopServer(upstreamServer);
  });

  it('should enforce rate limiting', async () => {
    // First two requests should succeed
    const r1 = await fetch(proxyUrl, {
      body: JSON.stringify({ query: '{ __typename }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(r1.status).toBe(200);

    const r2 = await fetch(proxyUrl, {
      body: JSON.stringify({ query: '{ __typename }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(r2.status).toBe(200);

    // Third request should be rate limited
    const r3 = await fetch(proxyUrl, {
      body: JSON.stringify({ query: '{ __typename }' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.errors[0].message).toContain('Rate limit');
  });
});
