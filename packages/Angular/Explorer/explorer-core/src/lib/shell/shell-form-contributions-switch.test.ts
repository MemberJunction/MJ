// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartupManager } from '@memberjunction/core';
import { InstanceConfigEngine, InteractiveFormsEngine } from '@memberjunction/core-entities';
import { ShellComponent } from './shell.component';

/**
 * The shell is where Explorer reaches the metadata form-contribution kill switch: the browser has
 * no process environment, so the `Forms.MetadataContributions.Enabled` instance configuration is
 * applied during startup, before workspace initialization opens any form.
 */

const STOP = 'stop after the workspace starts';

/** A shell with only the members `InitializeShell` touches up to workspace initialization. */
function createShell(onWorkspaceInitialize: () => void): ShellComponent {
  const shell = Object.create(ShellComponent.prototype) as ShellComponent;
  const open = shell as unknown as Record<string, unknown>;
  open['startLoadingAnimation'] = vi.fn();
  open['resolveRecordOpenStyle'] = vi.fn();
  open['appManager'] = { Initialize: vi.fn() };
  open['router'] = { url: '/' };
  open['workspaceManager'] = {
    Initialize: vi.fn(async () => {
      onWorkspaceInitialize();
      throw new Error(STOP);
    }),
  };
  Object.defineProperty(shell, 'ProviderToUse', { value: { CurrentUser: { ID: 'user-1' } } });
  return shell;
}

function stubInstanceConfig(values: Record<string, boolean>): void {
  vi.spyOn(InstanceConfigEngine.Instance, 'Config').mockResolvedValue(undefined);
  vi.spyOn(InstanceConfigEngine.Instance, 'GetBoolean').mockImplementation(
    (key: string, defaultValue: boolean = true) => values[key] ?? defaultValue,
  );
}

describe('ShellComponent.InitializeShell — metadata form contributions switch', () => {
  beforeEach(() => {
    InteractiveFormsEngine.MetadataContributionsEnabled = true;
    vi.spyOn(StartupManager.Instance, 'Startup').mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    InteractiveFormsEngine.MetadataContributionsEnabled = true;
  });

  it('turns contributions off before the workspace opens when Instance Config says false', async () => {
    stubInstanceConfig({ [InteractiveFormsEngine.MetadataContributionsConfigKey]: false });
    let enabledWhenWorkspaceStarts: boolean | undefined;
    const shell = createShell(() => { enabledWhenWorkspaceStarts = InteractiveFormsEngine.MetadataContributionsEnabled; });

    await expect(shell.InitializeShell()).rejects.toThrow(STOP);

    expect(enabledWhenWorkspaceStarts).toBe(false);
  });

  it('leaves contributions on when the key is absent', async () => {
    stubInstanceConfig({});
    let enabledWhenWorkspaceStarts: boolean | undefined;
    const shell = createShell(() => { enabledWhenWorkspaceStarts = InteractiveFormsEngine.MetadataContributionsEnabled; });

    await expect(shell.InitializeShell()).rejects.toThrow(STOP);

    expect(enabledWhenWorkspaceStarts).toBe(true);
  });
});
