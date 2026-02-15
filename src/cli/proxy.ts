import { Command } from 'commander';
import { startProxy } from '../proxy/server.js';
import type { ShieldConfig } from '../types/index.js';

export function createProxyCommand(): Command {
  return new Command('proxy')
    .description('Start a security proxy in front of a GraphQL endpoint')
    .argument('<target>', 'Upstream GraphQL endpoint URL')
    .option('-p, --port <port>', 'Proxy listening port', '4000')
    .option('--max-depth <depth>', 'Maximum query depth')
    .option('--max-complexity <complexity>', 'Maximum query complexity')
    .option('--max-aliases <aliases>', 'Maximum number of aliases')
    .option('--disable-introspection', 'Block introspection queries')
    .option('--rate-limit-window <ms>', 'Rate limit window in milliseconds')
    .option('--rate-limit-max <max>', 'Maximum requests per window')
    .option(
      '-H, --header <header...>',
      'Headers to forward to upstream (format: "Key: Value")',
    )
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
          shieldConfig.maxDepth = parseInt(options.maxDepth, 10);
        }
        if (options.maxComplexity) {
          shieldConfig.maxComplexity = parseInt(options.maxComplexity, 10);
        }
        if (options.maxAliases) {
          shieldConfig.maxAliases = parseInt(options.maxAliases, 10);
        }
        if (options.disableIntrospection) {
          shieldConfig.disableIntrospection = true;
        }
        if (options.rateLimitWindow && options.rateLimitMax) {
          shieldConfig.rateLimit = {
            window: parseInt(options.rateLimitWindow, 10),
            max: parseInt(options.rateLimitMax, 10),
          };
        }

        const headers: Record<string, string> = {};
        if (options.header) {
          for (const h of options.header) {
            const colonIdx = h.indexOf(':');
            if (colonIdx > 0) {
              const key = h.substring(0, colonIdx).trim();
              const value = h.substring(colonIdx + 1).trim();
              headers[key] = value;
            }
          }
        }

        try {
          await startProxy({
            target,
            port: parseInt(options.port, 10),
            shield: shieldConfig,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            cors: options.cors,
          });
        } catch (error) {
          console.error(
            `Failed to start proxy: ${error instanceof Error ? error.message : String(error)}`,
          );
          process.exit(1);
        }
      },
    );
}
