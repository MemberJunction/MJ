/**
 * Tests for explorer-modules package:
 * - Module bundle export verification
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  NgModule: () => (target: Function) => target,
}));

vi.mock('@memberjunction/ng-explorer-core', () => ({
  ExplorerCoreModule: class {},
  ShellModule: class {},
}));

vi.mock('@memberjunction/ng-core-entity-forms', () => ({
  CoreGeneratedFormsModule: class {},
}));

vi.mock('@memberjunction/ng-workspace-initializer', () => ({
  WorkspaceInitializerModule: class {},
}));

vi.mock('@memberjunction/ng-link-directives', () => ({
  LinkDirectivesModule: class {},
}));

vi.mock('@memberjunction/ng-container-directives', () => ({
  ContainerDirectivesModule: class {},
}));

vi.mock('@memberjunction/ng-explorer-settings', () => ({
  ExplorerSettingsModule: class {},
}));

vi.mock('@memberjunction/ng-kendo-modules', () => ({
  MJKendoModule: class {},
}));

describe('MJExplorerModulesBundle', () => {
  it('should export the bundle module', async () => {
    const mod = await import('../lib/explorer-modules.module');
    expect(mod.MJExplorerModulesBundle).toBeDefined();
  });
});
