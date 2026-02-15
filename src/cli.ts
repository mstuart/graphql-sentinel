#!/usr/bin/env node
import { Command } from 'commander';
import { createScanCommand } from './cli/scan.js';
import { createProxyCommand } from './cli/proxy.js';

const program = new Command()
  .name('graphql-sentinel')
  .description('GraphQL security scanner and runtime shield')
  .version('0.1.0');

program.addCommand(createScanCommand());
program.addCommand(createProxyCommand());

program.parse();
