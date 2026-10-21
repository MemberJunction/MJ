import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ReadmeSteps } from '../steps';
import { TruthSuite } from '../../registry/load';

describe('ReadmeSteps.Extract', () => {
  it('returns the readme-step blocks in order and skips other fences', () => {
    const md = ['# T', '```bash readme-step', 'echo one', '```', '```bash', 'echo sample', '```', '```bash readme-step', 'echo two', 'echo three', '```'].join('\n');
    expect(ReadmeSteps.Extract(md)).toEqual([
      { Index: 1, Line: 2, Script: 'echo one' },
      { Index: 2, Line: 8, Script: 'echo two\necho three' },
    ]);
  });
  it('refuses a placeholder', () => {
    expect(() => ReadmeSteps.Extract('```bash readme-step\nsqlcmd -d <your-db>\n```')).toThrow(/placeholder <your-db>/);
  });
  it('refuses an unclosed block', () => {
    expect(() => ReadmeSteps.Extract('```bash readme-step\necho x')).toThrow(/not closed/);
  });
  it('the committed README starts by creating the database and ends with a pr run', () => {
    const steps = ReadmeSteps.Extract(readFileSync(path.join(TruthSuite.Root(), 'README.md'), 'utf8'));
    expect(steps[0]?.Script).toMatch(/CREATE DATABASE \[\$DB_DATABASE\]/);
    expect(steps[steps.length - 1]?.Script).toMatch(/truth:run -- --mode pr/);
  });
});
