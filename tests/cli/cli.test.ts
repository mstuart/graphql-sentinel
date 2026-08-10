import { describe, it, expect } from 'vitest';
import { createScanCommand } from '../../src/cli/scan.js';

describe('CLI Scan Command', () => {
  it('should create a valid scan command', () => {
    const command = createScanCommand();
    expect(command.name()).toBe('scan');
    expect(command.description()).toContain('Scan');
  });

  it('should accept format option', () => {
    const command = createScanCommand();
    const formatOption = command.options.find((o) => o.long === '--format');
    expect(formatOption).toBeDefined();
  });

  it('should accept output option', () => {
    const command = createScanCommand();
    const outputOption = command.options.find((o) => o.long === '--output');
    expect(outputOption).toBeDefined();
  });

  it('should accept header option', () => {
    const command = createScanCommand();
    const headerOption = command.options.find((o) => o.long === '--header');
    expect(headerOption).toBeDefined();
  });

  it('should accept checks option', () => {
    const command = createScanCommand();
    const checksOption = command.options.find((o) => o.long === '--checks');
    expect(checksOption).toBeDefined();
  });

  it('should accept timeout option', () => {
    const command = createScanCommand();
    const timeoutOption = command.options.find((o) => o.long === '--timeout');
    expect(timeoutOption).toBeDefined();
  });
});
