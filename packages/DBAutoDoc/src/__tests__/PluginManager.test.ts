import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { RegisterClass } from '@memberjunction/global';
import { BaseAutoDocPlugin } from '../plugins/BaseAutoDocPlugin';
import { PluginManager, AutoDocPluginRunContext } from '../plugins/PluginManager';
import { BUILT_IN_PLUGINS } from '../plugins/builtins';
import { AutoDocExporter, AutoDocPluginConfigEntry, AutoDocPluginContext } from '../plugins/types';
import { DatabaseDocumentation } from '../types/state';
import { DBAutoDocConfig } from '../types/config';

/** Order in which test plugins' hooks ran, as "<plugin>:<hook>". */
const CALLS: string[] = [];

@RegisterClass(BaseAutoDocPlugin, 'TestFirst')
class TestFirstPlugin extends BaseAutoDocPlugin {
  public override async OnPostRun(context: AutoDocPluginContext): Promise<void> {
    CALLS.push(`TestFirst:${context.Hook}:${String(context.Options['flag'] ?? '')}`);
    this.SetData(context, 'TestFirst', { Seen: true });
  }
}

@RegisterClass(BaseAutoDocPlugin, 'TestFailing')
class TestFailingPlugin extends BaseAutoDocPlugin {
  public override async OnPostRun(_context: AutoDocPluginContext): Promise<void> {
    CALLS.push('TestFailing:PostRun');
    throw new Error('boom');
  }
}

@RegisterClass(BaseAutoDocPlugin, 'TestExporter')
class TestExporterPlugin extends BaseAutoDocPlugin {
  public override GetExporters(): AutoDocExporter[] {
    return [{
      Format: 'test-format',
      Description: 'test',
      Generate: (_state, options) => [{ FileName: 'out.txt', Content: options.Provider }]
    }];
  }
}

// Reference the classes so the decorators are not tree-shaken by the test transform.
void [TestFirstPlugin, TestFailingPlugin, TestExporterPlugin];

function makeState(): DatabaseDocumentation {
  return {
    version: '1.0.0',
    summary: {} as DatabaseDocumentation['summary'],
    database: { name: 'db', server: 'srv', analyzedAt: '' },
    phases: { descriptionGeneration: [] },
    schemas: []
  };
}

/** Framework tests run without built-ins so only the test plugins are loaded. */
const NO_BUILT_INS = BUILT_IN_PLUGINS.map((b) => ({ Name: b.Name, Enabled: false }));
const only = (...entries: AutoDocPluginConfigEntry[]): AutoDocPluginConfigEntry[] => [...entries, ...NO_BUILT_INS];

function makeContext(state: DatabaseDocumentation, logs: string[]): AutoDocPluginRunContext {
  return { State: state, Config: {} as DBAutoDocConfig, RunFolder: '/tmp', Log: (m) => logs.push(m) };
}

describe('PluginManager', () => {
  beforeEach(() => {
    CALLS.length = 0;
  });

  it('runs enabled plugins in priority order and passes their options', async () => {
    const manager = new PluginManager();
    await manager.Load(only(
      { Name: 'TestFailing', Priority: 20 },
      { Name: 'TestFirst', Priority: 10, Options: { flag: 'x' } }
    ));
    await manager.RunHook('PostRun', makeContext(makeState(), []));
    expect(CALLS).toEqual(['TestFirst:PostRun:x', 'TestFailing:PostRun']);
  });

  it('isolates a failing plugin: records the error and keeps running the others', async () => {
    const manager = new PluginManager();
    await manager.Load(only({ Name: 'TestFailing', Priority: 1 }, { Name: 'TestFirst', Priority: 2 }));
    const state = makeState();
    const logs: string[] = [];
    await manager.RunHook('PostRun', makeContext(state, logs));

    expect(CALLS).toContain('TestFirst:PostRun:');
    const failedRun = state.plugins?.['TestFailing'].Runs[0];
    expect(failedRun?.Success).toBe(false);
    expect(failedRun?.ErrorMessage).toBe('boom');
    expect(state.plugins?.['TestFirst'].Runs[0].Success).toBe(true);
    expect(logs.some((l) => l.includes("Plugin 'TestFailing' failed in PostRun"))).toBe(true);
  });

  it('persists plugin data in the plugin\'s own state section', async () => {
    const manager = new PluginManager();
    await manager.Load(only({ Name: 'TestFirst' }));
    const state = makeState();
    await manager.RunHook('PostRun', makeContext(state, []));
    expect(state.plugins?.['TestFirst'].Data).toEqual({ Seen: true });
  });

  it('skips disabled plugins', async () => {
    const manager = new PluginManager();
    await manager.Load(only({ Name: 'TestFirst', Enabled: false }));
    expect(manager.Plugins.map((p) => p.Entry.Name)).not.toContain('TestFirst');
  });

  it('fails loudly for an unregistered plugin name', async () => {
    const manager = new PluginManager();
    await expect(manager.Load(only({ Name: 'NoSuchPlugin' }))).rejects.toThrow(/NoSuchPlugin' is not registered/);
  });

  it('collects exporters from loaded plugins', async () => {
    const manager = new PluginManager();
    await manager.Load(only({ Name: 'TestExporter' }));
    const exporters = manager.GetExporters();
    expect(exporters.map((e) => e.Format)).toEqual(['test-format']);
    expect(exporters[0].Generate(makeState(), { Provider: 'postgresql' })[0].Content).toBe('postgresql');
  });

  it('loads the built-in Index Advisor by default and exposes its export format', async () => {
    const manager = new PluginManager();
    await manager.Load([]);
    expect(manager.Plugins.map((p) => p.Entry.Name)).toContain('IndexAdvisor');
    expect(manager.GetExporters().map((e) => e.Format)).toContain('index-migration');
  });

  it('adds built-ins the config does not mention, and lets the config turn one off', () => {
    const builtIn = BUILT_IN_PLUGINS[0];
    if (!builtIn) {
      return; // no built-ins registered yet
    }
    const merged = PluginManager.MergeWithBuiltIns([]);
    expect(merged.find((e) => e.Name === builtIn.Name)?.Enabled).toBe(builtIn.EnabledByDefault);
    const off = PluginManager.MergeWithBuiltIns([{ Name: builtIn.Name, Enabled: false }]);
    expect(off.filter((e) => e.Name === builtIn.Name)).toEqual([{ Name: builtIn.Name, Enabled: false }]);
  });

  describe('external modules', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodoc-plugin-'));
    const modulePath = path.join(dir, 'external-plugin.mjs');
    fs.writeFileSync(modulePath, 'globalThis.__autodocExternalPluginLoaded = true;\n');

    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('imports a plugin module named by file path', async () => {
      await PluginManager.LoadModules([{ Name: 'Anything', Module: modulePath }]);
      expect((globalThis as { __autodocExternalPluginLoaded?: boolean }).__autodocExternalPluginLoaded).toBe(true);
    });

    it('does not import modules of disabled entries', async () => {
      await expect(
        PluginManager.LoadModules([{ Name: 'Disabled', Module: path.join(dir, 'missing.mjs'), Enabled: false }])
      ).resolves.toBeUndefined();
    });
  });
});
