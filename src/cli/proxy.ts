import { Command } from 'commander';
import { startProxy } from '../proxy/server.js';
import type { ShieldConfig } from '../types/index.js';

export const createProxyCommand = (): Command => {
  const command = new Command('proxy');

  return command
    .description('Start a security proxy in front of a GraphQL endpoint')
    .argument('<target>', 'Upstream GraphQL endpoint URL')
    .option('-p, --port <port>', 'Proxy listening port', '4000')
    .option('--max-depth <depth>', 'Maximum query depth')
    .option('--max-complexity <complexity>', 'Maximum query complexity')
    .option('--max-aliases <aliases>', 'Maximum number of aliases')
    .option('--disable-introspection', 'Block introspection queries')
    .option('--rate-limit-window <ms>', 'Rate limit window in milliseconds')
    .option('--rate-limit-max <max>', 'Maximum requests per window')
    .option('-H, --header <header...>', 'Headers to forward to upstream (format: "Key: Value")')
    .option('--no-cors', 'Disable CORS headers')
    .action(
      async (
        target: string,
        options: {
          port: string;
          maxDepth?: string;
          maxComplexity?: string;
          maxAliases?: string;
          disableIntrospection?: boolean;
          rateLimitWindow?: string;
          rateLimitMax?: string;
          header?: string[];
          cors?: boolean;
        },
      ) => {
        const shieldConfig: ShieldConfig = {};

        if (options.maxDepth) {
          shieldConfig.maxDepth = Number(options.maxDepth);
        }
        if (options.maxComplexity) {
          shieldConfig.maxComplexity = Number(options.maxComplexity);
        }
        if (options.maxAliases) {
          shieldConfig.maxAliases = Number(options.maxAliases);
        }
        if (options.disableIntrospection) {
          shieldConfig.disableIntrospection = true;
        }
        if (options.rateLimitWindow && options.rateLimitMax) {
          shieldConfig.rateLimit = {
            max: Number(options.rateLimitMax),
            window: Number(options.rateLimitWindow),
          };
        }

        const headers: Record<string, string> = {};
        if (options.header) {
          for (const h of options.header) {
            const colonIndex = h.indexOf(':');
            if (colonIndex > 0) {
              const key = h.slice(0, Math.max(0, colonIndex)).trim();
              const value = h.slice(Math.max(0, colonIndex + 1)).trim();
              headers[key] = value;
            }
          }
        }

        // The catch converts startup failures into the CLI's documented exit code.
        // eslint-disable-next-line unicorn/try-complexity
        try {
          await startProxy({
            cors: options.cors,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            port: Number(options.port),
            shield: shieldConfig,
            target,
          });
        } catch (error) {
          console.error(`Failed to start proxy: ${String(error)}`);
          process.exit(1);
        }
      },
    );
};
