import { describe, it, expect, beforeEach } from 'vitest';
import { CLIPluginRegistry } from '@memberjunction/cli-core';
import { deriveUsage, domainOf, registerDerivedUsage, type OclifCommandShape } from '../lib/derived-usage';
import { DOMAIN_PROFILES, DEFAULT_DOMAIN_PROFILE, getDomainProfile } from '../lib/domain-profiles';

/**
 * The contract under test: `mj usage` tells an agent to trust the domain map, so the
 * map has to cover every visible command. These tests pin the derivation that makes
 * that true without hand-writing 80 usage literals.
 */

const testRun: OclifCommandShape = {
  id: 'test:run',
  description: 'Execute a single test by ID or name.\n\nSecond paragraph that the summary should not swallow.',
  flags: {
    name: { type: 'option', description: 'Test name to execute', char: 'n' },
    format: { type: 'option', description: 'Output format', options: ['text', 'json', 'md'] },
    'dry-run': { type: 'boolean', description: 'Validate without executing' },
  },
  examples: ['<%= config.bin %> test run <id>', { command: 'mj test run --name=x', description: 'By name' }],
};

describe('domainOf', () => {
  it('takes the first segment of either id spelling', () => {
    expect(domainOf('test:run')).toBe('test');
    expect(domainOf('dev workspace status')).toBe('dev');
    expect(domainOf('codegen')).toBe('codegen');
  });
});

describe('deriveUsage', () => {
  it('normalizes space-separated oclif ids to the colon command key', () => {
    expect(deriveUsage({ id: 'dev workspace status' }).command).toBe('dev:workspace:status');
  });

  it('takes the first sentence as the summary, not the whole description', () => {
    const usage = deriveUsage(testRun);
    expect(usage.summary).toBe('Execute a single test by ID or name.');
    expect(usage.description).toContain('Second paragraph');
  });

  it('prefers an explicit oclif summary when the command declares one', () => {
    expect(deriveUsage({ id: 'x:y', summary: 'Short one.', description: 'Long one.' }).summary).toBe('Short one.');
  });

  it('falls back to the invocation itself when a command documents nothing', () => {
    expect(deriveUsage({ id: 'app:list' }).summary).toBe('mj app list');
  });

  it('carries the domain runtime hint so an agent can budget a timeout', () => {
    expect(deriveUsage(testRun).runtime).toEqual(DOMAIN_PROFILES.test.runtime);
  });

  it('falls back to a variable runtime for an unprofiled domain rather than implying speed', () => {
    const usage = deriveUsage({ id: 'brandnew:thing' });
    expect(usage.runtime).toEqual(DEFAULT_DOMAIN_PROFILE.runtime);
    expect(usage.runtime.class).toBe('variable');
  });

  it('renders flags with their option lists so an agent need not guess valid values', () => {
    const flags = deriveUsage(testRun).flags ?? [];
    const format = flags.find((f) => f.name === '--format');
    expect(format?.type).toBe('text|json|md');
  });

  it('surfaces a flag’s short char and required-ness in its description', () => {
    const flags = deriveUsage({
      id: 'x:y',
      flags: { name: { type: 'option', description: 'A name', char: 'n', required: true } },
    }).flags ?? [];
    expect(flags[0].description).toContain('(-n)');
    expect(flags[0].description).toContain('(required)');
  });

  it('normalizes both oclif example spellings into plain strings', () => {
    expect(deriveUsage(testRun).examples).toEqual(['<%= config.bin %> test run <id>', 'mj test run --name=x']);
  });

  it('omits empty flag and example collections instead of emitting empty arrays', () => {
    const usage = deriveUsage({ id: 'x:y', flags: {}, examples: [] });
    expect(usage.flags).toBeUndefined();
    expect(usage.examples).toBeUndefined();
  });
});

describe('registerDerivedUsage', () => {
  beforeEach(() => {
    // The registry is static and first-wins; give each test a distinct namespace so
    // ordering between tests cannot make an assertion pass for the wrong reason.
    CLIPluginRegistry.RegisterUsage({
      domain: 'seeded',
      command: 'seeded:already',
      summary: 'Curated summary that must survive derivation.',
      runtime: { class: 'fast' },
    });
  });

  it('registers every visible command', () => {
    const registered = registerDerivedUsage([{ id: 'alpha:one' }, { id: 'alpha:two' }]);
    expect(registered).toEqual(['alpha:one', 'alpha:two']);
    const detail = CLIPluginRegistry.BuildDomainDetail('alpha');
    expect(detail.commands.map((c) => c.command)).toEqual(['alpha:one', 'alpha:two']);
  });

  it('skips hidden commands — hidden from humans should mean hidden from agents', () => {
    registerDerivedUsage([{ id: 'beta:shown' }, { id: 'beta:secret', hidden: true }]);
    const commands = CLIPluginRegistry.BuildDomainDetail('beta').commands.map((c) => c.command);
    expect(commands).toEqual(['beta:shown']);
  });

  it('never overwrites a curated entry a plugin already declared', () => {
    registerDerivedUsage([{ id: 'seeded:already', description: 'Derived summary that must lose.' }]);
    const [command] = CLIPluginRegistry.BuildDomainDetail('seeded').commands;
    expect(command.summary).toBe('Curated summary that must survive derivation.');
  });

  it('ignores entries with no id rather than registering a nameless command', () => {
    const registered = registerDerivedUsage([{ id: '' }, { id: 'gamma:ok' }]);
    expect(registered).toEqual(['gamma:ok']);
  });

  it('is idempotent, so composing usage twice cannot duplicate a domain’s commands', () => {
    registerDerivedUsage([{ id: 'delta:one' }]);
    registerDerivedUsage([{ id: 'delta:one' }]);
    expect(CLIPluginRegistry.BuildDomainDetail('delta').commands).toHaveLength(1);
  });
});

describe('domain profiles', () => {
  it('gives every profiled domain a summary and a runtime class', () => {
    for (const [domain, profile] of Object.entries(DOMAIN_PROFILES)) {
      expect(profile.summary, `${domain} summary`).toBeTruthy();
      expect(['fast', 'moderate', 'slow', 'variable']).toContain(profile.runtime.class);
    }
  });

  it('falls back rather than throwing for a domain nobody profiled', () => {
    expect(getDomainProfile('does-not-exist')).toBe(DEFAULT_DOMAIN_PROFILE);
  });

  it('states a note whenever it claims a variable runtime, so the hint is actionable', () => {
    for (const [domain, profile] of Object.entries(DOMAIN_PROFILES)) {
      if (profile.runtime.class === 'variable') {
        expect(profile.runtime.note, `${domain} needs a note`).toBeTruthy();
      }
    }
  });
});
