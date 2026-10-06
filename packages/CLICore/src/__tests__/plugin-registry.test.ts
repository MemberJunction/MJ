import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { MJGlobal } from '@memberjunction/global';
import { BaseCLIPlugin } from '../base-cli-plugin';
import { CLIPluginRegistry } from '../plugin-registry';
import { SerializeResult } from '../serialize';
import type { MJCLIResult, PluginUsage } from '../types';

class FakePushPlugin extends BaseCLIPlugin {
  static override Usage: PluginUsage = {
    domain: 'sync',
    command: 'sync:push',
    summary: 'Push local metadata files to the database.',
    runtime: { class: 'variable', typicalSeconds: 20, note: 'scales with records' },
  };
  protected async Execute(): Promise<MJCLIResult> {
    return { success: true, command: 'sync:push', durationSeconds: 0 };
  }
}

class FakePullPlugin extends BaseCLIPlugin {
  static override Usage: PluginUsage = {
    domain: 'sync',
    command: 'sync:pull',
    summary: 'Pull records into local files.',
    runtime: { class: 'variable', typicalSeconds: 15 },
  };
  protected async Execute(): Promise<MJCLIResult> {
    return { success: true, command: 'sync:pull', durationSeconds: 0 };
  }
}

class FakeCodeGenPlugin extends BaseCLIPlugin {
  static override Usage: PluginUsage = {
    domain: 'codegen',
    command: 'codegen',
    summary: 'Regenerate code from schema.',
    runtime: { class: 'slow', typicalSeconds: 45 },
  };
  protected async Execute(): Promise<MJCLIResult> {
    return { success: true, command: 'codegen', durationSeconds: 0 };
  }
}

describe('CLIPluginRegistry usage composition', () => {
  // Register once (idempotent) — not per-test — so we don't accumulate duplicate
  // registrations in the global ClassFactory or leak growth into sibling tests.
  beforeAll(() => {
    const cf = MJGlobal.Instance.ClassFactory;
    cf.Register(BaseCLIPlugin, FakePushPlugin, 'sync:push');
    cf.Register(BaseCLIPlugin, FakePullPlugin, 'sync:pull');
    cf.Register(BaseCLIPlugin, FakeCodeGenPlugin, 'codegen');
  });

  it('GetAllUsage returns one entry per registered command', () => {
    const usages = CLIPluginRegistry.GetAllUsage();
    const commands = usages.map((u) => u.command).sort();
    expect(commands).toEqual(expect.arrayContaining(['codegen', 'sync:pull', 'sync:push']));
  });

  it('BuildDomainMap groups by domain and reports the loosest runtime class', () => {
    const map = CLIPluginRegistry.BuildDomainMap();
    expect(map.guidance).toContain('Do NOT guess');
    const sync = map.domains.find((d) => d.domain === 'sync');
    const codegen = map.domains.find((d) => d.domain === 'codegen');
    expect(sync?.runtime).toBe('variable');
    expect(codegen?.runtime).toBe('slow');
    // domains are sorted alphabetically
    expect(map.domains.map((d) => d.domain)).toEqual([...map.domains.map((d) => d.domain)].sort());
  });

  it('BuildDomainDetail returns every command for a domain (case-insensitive)', () => {
    const detail = CLIPluginRegistry.BuildDomainDetail('SYNC');
    expect(detail.domain).toBe('SYNC');
    expect(detail.commands.map((c) => c.command).sort()).toEqual(['sync:pull', 'sync:push']);
    expect(detail.commands[0].runtime).toBeDefined();
  });

  it('BuildDomainDetail returns an empty list for an unknown domain', () => {
    const detail = CLIPluginRegistry.BuildDomainDetail('does-not-exist');
    expect(detail.commands).toEqual([]);
  });

  it('AsResult wraps a payload in the universal result shape', () => {
    const r = CLIPluginRegistry.AsResult('usage', { foo: 1 });
    expect(r).toMatchObject({ success: true, command: 'usage', durationSeconds: 0, data: { foo: 1 } });
  });
});

describe('CLIPluginRegistry.RegisterUsage (non-plugin commands)', () => {
  const standalone: PluginUsage = {
    domain: 'fixture-domain',
    command: 'fixture-domain:thing',
    summary: 'A command that is a plain oclif Command, not a plugin.',
    runtime: { class: 'fast', typicalSeconds: 1 },
  };

  it('surfaces a directly-registered command in both usage tiers', () => {
    CLIPluginRegistry.RegisterUsage(standalone);

    expect(CLIPluginRegistry.GetAllUsage().map((u) => u.command)).toContain('fixture-domain:thing');
    const detail = CLIPluginRegistry.BuildDomainDetail('fixture-domain');
    expect(detail.commands).toHaveLength(1);
    expect(detail.commands[0].summary).toBe(standalone.summary);
    const mapped = CLIPluginRegistry.BuildDomainMap().domains.find((d) => d.domain === 'fixture-domain');
    expect(mapped?.runtime).toBe('fast');
  });

  it('is idempotent — registering the same command twice keeps one entry', () => {
    CLIPluginRegistry.RegisterUsage(standalone);
    CLIPluginRegistry.RegisterUsage({ ...standalone, summary: 'a later, ignored declaration' });
    const detail = CLIPluginRegistry.BuildDomainDetail('fixture-domain');
    expect(detail.commands).toHaveLength(1);
    expect(detail.commands[0].summary).toBe(standalone.summary);
  });

  it('never shadows a plugin that owns the same command key', () => {
    // FakePushPlugin (above) already owns 'sync:push' through the ClassFactory.
    CLIPluginRegistry.RegisterUsage({
      domain: 'sync',
      command: 'sync:push',
      summary: 'standalone declaration that must not win',
      runtime: { class: 'fast' },
    });
    const detail = CLIPluginRegistry.BuildDomainDetail('sync');
    const push = detail.commands.find((c) => c.command === 'sync:push');
    expect(push?.summary).toBe('Push local metadata files to the database.');
  });

  it('rejects a declaration missing its domain or command', () => {
    expect(() => CLIPluginRegistry.RegisterUsage({ domain: '', command: 'x', summary: 's', runtime: { class: 'fast' } })).toThrow(
      /domain and command/
    );
    expect(() => CLIPluginRegistry.RegisterUsage({ domain: 'd', command: '', summary: 's', runtime: { class: 'fast' } })).toThrow(
      /domain and command/
    );
  });
});

describe('CLIPluginRegistry.LoadPluginsFromConfig', () => {
  it('reports loaded and failed specifiers (no silent swallow)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjcli-load-'));
    writeFileSync(join(dir, 'ok-plugin.mjs'), 'export const ok = true;\n');
    writeFileSync(join(dir, 'mj-cli-plugins.json'), JSON.stringify({ plugins: ['./ok-plugin.mjs', '@definitely/not-installed-xyz'] }));

    const res = await CLIPluginRegistry.LoadPluginsFromConfig(dir);
    expect(res.loaded).toContain('./ok-plugin.mjs');
    expect(res.failed.map((f) => f.specifier)).toContain('@definitely/not-installed-xyz');
    expect(res.failed[0].error).toBeTruthy();
  });

  it('returns empty (no throw) when no config is found walking up', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mjcli-empty-'));
    const res = await CLIPluginRegistry.LoadPluginsFromConfig(dir);
    expect(res.loaded).toEqual([]);
    expect(res.failed).toEqual([]);
  });
});

describe('SerializeResult', () => {
  const r: MJCLIResult = { success: true, command: 'x', durationSeconds: 0, data: { a: 1 } };
  it('json → parseable JSON', () => {
    expect(JSON.parse(SerializeResult(r, 'json')).command).toBe('x');
  });
  it('md → fenced json block', () => {
    const s = SerializeResult(r, 'md');
    expect(s.startsWith('```json')).toBe(true);
    expect(s.endsWith('```')).toBe(true);
  });
  it('text → empty (plugin renders human output)', () => {
    expect(SerializeResult(r, 'text')).toBe('');
  });
});
