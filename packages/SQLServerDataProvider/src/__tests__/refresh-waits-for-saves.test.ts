import { describe, it, expect, vi, afterEach } from 'vitest';
import { EntityInfo, EntitySaveOptions } from '@memberjunction/core';
import { GenericDatabaseProvider } from '@memberjunction/generic-database-provider';
import { SQLServerDataProvider } from '../SQLServerDataProvider';
import { TEST_USER, TestEntity } from './helpers/entity-fixtures';

/**
 * An explicit Refresh() must reload metadata even when a save is in flight. Saves suspend refresh
 * for the length of their SQL; Refresh() used to return true WITHOUT reloading in that window, so a
 * caller (CodeGen, right after a fire-and-forget AI Prompt Run save) kept a stale metadata snapshot.
 */

/**
 * The real provider with its reload stubbed out: Config() and the view-column rescan only count,
 * and the save suspend/resume hooks a save brackets its SQL with are exposed for the tests to drive.
 */
class RefreshTestProvider extends SQLServerDataProvider {
  public ConfigCalls = 0;
  public RescanCalls = 0;
  public override async Config(): Promise<boolean> {
    this.ConfigCalls++;
    return true;
  }
  protected override async LoadViewColumnOrderCache(): Promise<void> {
    this.RescanCalls++;
  }
  /** What a save does before its SQL runs. */
  public BeginSave(): void {
    this.OnSuspendRefresh();
  }
  /** What a save does after its SQL finished. */
  public EndSave(): void {
    this.OnResumeRefresh();
  }
  /** Whether the provider currently allows a metadata refresh (the protected flag under test). */
  public get RefreshAllowed(): boolean {
    return this.AllowRefresh;
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SQLServerDataProvider.Refresh while a save is in flight', () => {
  it('reloads immediately when no save is in flight', async () => {
    const provider = new RefreshTestProvider();
    expect(await provider.Refresh()).toBe(true);
    expect(provider.ConfigCalls).toBe(1);
  });

  it('waits for the in-flight save to finish, then really reloads', async () => {
    const provider = new RefreshTestProvider();
    provider.BeginSave();
    const pending = provider.Refresh();
    await flush();
    expect(provider.ConfigCalls).toBe(0);
    provider.EndSave();
    expect(await pending).toBe(true);
    expect(provider.ConfigCalls).toBe(1);
  });

  it('counts overlapping saves: refresh stays suspended until the last one resumes', async () => {
    const provider = new RefreshTestProvider();
    provider.BeginSave();
    provider.BeginSave();
    expect(provider.RefreshAllowed).toBe(false);
    const pending = provider.Refresh();
    provider.EndSave();
    await flush();
    expect(provider.RefreshAllowed).toBe(false);
    expect(provider.ConfigCalls).toBe(0);
    provider.EndSave();
    expect(await pending).toBe(true);
    expect(provider.RefreshAllowed).toBe(true);
  });

  it('gives up with false (not a fake true) when a save never finishes', async () => {
    vi.useFakeTimers();
    const provider = new RefreshTestProvider();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    provider.BeginSave();
    const pending = provider.Refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toBe(false);
    expect(provider.ConfigCalls).toBe(0);
    expect(logged.mock.calls.flat().map(String).join(' ')).toMatch(/SQLServerDataProvider\.Refresh: 1 save\(s\) still in flight/);
  });

  it('a save that fails before suspending does not release another in-flight save', async () => {
    const provider = new RefreshTestProvider();
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // the rejected save is logged
    provider.BeginSave(); // another save is running
    const externalEntity = new TestEntity(new EntityInfo({
      ID: 'A3000000-0000-0000-0000-000000000003',
      Name: 'External Thing',
      Status: 'Active',
      SchemaName: 'ext',
      BaseTable: 'Thing',
      BaseView: 'vwThings',
      ExternalDataSourceID: 'ext-1',
      EntityFields: [],
      EntityPermissions: [],
    }));
    await expect(provider.Save(externalEntity, TEST_USER, new EntitySaveOptions())).rejects.toThrow(/external data source/);
    expect(provider.RefreshAllowed).toBe(false);
    provider.EndSave();
    expect(provider.RefreshAllowed).toBe(true);
  });
});

/**
 * The in-transaction reload (MJ#4836) runs its own reload pass rather than Config(), so it must do
 * Refresh()'s extra SQL Server work itself: wait for in-flight saves and rescan the view column order.
 */
describe('SQLServerDataProvider.RefreshWithinTransaction', () => {
  function makeInTransactionProvider() {
    const provider = new RefreshTestProvider();
    const passSpy = vi.spyOn(GenericDatabaseProvider.prototype, 'RefreshWithinTransaction').mockResolvedValue(true);
    return { provider, passSpy };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs the base in-transaction pass (not Config) and rescans the view column order', async () => {
    const { provider, passSpy } = makeInTransactionProvider();
    expect(await provider.RefreshWithinTransaction()).toBe(true);
    expect(passSpy).toHaveBeenCalledTimes(1);
    expect(provider.RescanCalls).toBe(1);
    expect(provider.ConfigCalls).toBe(0);
  });

  it('waits for an in-flight save before the pass', async () => {
    const { provider, passSpy } = makeInTransactionProvider();
    provider.BeginSave();
    const pending = provider.RefreshWithinTransaction();
    await flush();
    expect(passSpy).not.toHaveBeenCalled();
    provider.EndSave();
    expect(await pending).toBe(true);
    expect(passSpy).toHaveBeenCalledTimes(1);
  });

  it('gives up with false, without a pass or a rescan, when a save never finishes', async () => {
    vi.useFakeTimers();
    const { provider, passSpy } = makeInTransactionProvider();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    provider.BeginSave();
    const pending = provider.RefreshWithinTransaction();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await pending).toBe(false);
    expect(passSpy).not.toHaveBeenCalled();
    expect(provider.RescanCalls).toBe(0);
    expect(logged.mock.calls.flat().map(String).join(' ')).toMatch(/SQLServerDataProvider\.RefreshWithinTransaction: 1 save\(s\) still in flight/);
  });
});
