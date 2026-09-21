import { describe, it, expect } from 'vitest';
import Doctor from '../commands/doctor/index.js';
import { CANONICAL_FORMAT_FLAG } from '../lib/format-compat.js';

describe('Doctor command flags', () => {
  it('declares canonical format flag', () => {
    expect(Doctor.flags.format).toBe(CANONICAL_FORMAT_FLAG);
  });

  it('declares scope flag with valid diagnostic scopes', () => {
    const scopeFlag = Doctor.flags.scope;
    expect(scopeFlag).toBeDefined();
    expect(scopeFlag.options).toEqual(['install', 'runtime', 'ai', 'metadata', 'agent']);
  });

  it('declares default dir flag', () => {
    expect(Doctor.flags.dir.default).toBe('.');
  });

  it('declares report and report_extended flags', () => {
    expect(Doctor.flags.report).toBeDefined();
    expect(Doctor.flags.report_extended).toBeDefined();
  });
});
