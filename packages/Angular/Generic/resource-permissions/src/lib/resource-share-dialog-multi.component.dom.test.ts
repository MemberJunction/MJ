import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { BaseEntity } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { MJWindowComponent, MJWindowTitlebarComponent, MJEmptyStateComponent, MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { GenericShareDialogComponent } from './resource-share-dialog.component';
import { ResourceSharePermissionModel, ResourceShareContext, ResourceShareAdapter } from './resource-share-adapter';

/**
 * DOM spec for sharing SEVERAL resources at once through the same dialog.
 * Every action applies across the whole set: adding a person grants on all of
 * them, a level change moves all of them, and a removal withdraws everywhere.
 * People who hold access on only some — or at differing levels — are labelled
 * rather than silently flattened.
 */
function user(id: string, name: string, email?: string): MJUserEntity {
  return { ID: id, Name: name, Email: email ?? '' } as unknown as MJUserEntity;
}

const AMY = user('u-amy', 'Amy Adams', 'amy@example.com');
const BOB = user('u-bob', 'Bob Brown', 'bob@example.com');

const context = (id: string, name: string): ResourceShareContext => ({
  ResourceID: id,
  ResourceName: name,
  OwnerUserID: 'owner',
  OwnerDisplayName: 'Olive Owner',
  CurrentUserID: 'owner'
});

const CONTEXTS = [context('r1', 'First'), context('r2', 'Second'), context('r3', 'Third')];

/** Records every save/delete so a test can assert what the dialog persisted. */
function makeAdapter(existing: Record<string, Array<{ user: MJUserEntity; level: ResourceSharePermissionModel['Level'] }>> = {}) {
  const saves: Array<{ resourceId: string; userId: string; level: string }> = [];
  const deletes: Array<{ resourceId: string; userId: string }> = [];

  const makeRow = (resourceId: string, u: MJUserEntity, level: ResourceSharePermissionModel['Level'], isNew: boolean) => {
    const row: ResourceSharePermissionModel = {
      PermissionEntity: {
        Save: vi.fn(async () => { saves.push({ resourceId, userId: u.ID, level: row.Level }); return true; }),
        Delete: vi.fn(async () => { deletes.push({ resourceId, userId: u.ID }); return true; }),
        LatestResult: null
      } as unknown as BaseEntity,
      UserID: u.ID,
      User: u,
      Level: level,
      IsNew: isNew,
      MarkedForRemoval: false,
      _InitialLevel: level
    };
    return row;
  };

  const adapter: ResourceShareAdapter = {
    LoadShares: vi.fn(async (ctx: ResourceShareContext) =>
      (existing[ctx.ResourceID] ?? []).map(e => makeRow(ctx.ResourceID, e.user, e.level, false))),
    CreateShare: vi.fn(async (ctx: ResourceShareContext, u: MJUserEntity) => makeRow(ctx.ResourceID, u, 'View', true)),
    SyncLevelToEntity: vi.fn()
  };
  return { adapter, saves, deletes };
}

function render(
  inputs: Record<string, unknown>,
  setup?: (c: GenericShareDialogComponent) => void
): ComponentFixture<GenericShareDialogComponent> {
  return renderComponentFixture(GenericShareDialogComponent, {
    imports: [CommonModule, FormsModule, MJWindowComponent, MJWindowTitlebarComponent, MJEmptyStateComponent, MJAlertComponent],
    declarations: [GenericShareDialogComponent],
    inputs: { Visible: true, ...inputs },
    setup: (c) => {
      (c as unknown as { allUsers: MJUserEntity[] }).allUsers = [AMY, BOB];
      (c as unknown as { loadUsers: () => Promise<void> }).loadUsers = async () => {};
      setup?.(c);
    },
  });
}

/** Opens the dialog over the given contexts and lets ngOnChanges' async load settle. */
async function open(
  contexts: ResourceShareContext[],
  adapter: ResourceShareAdapter,
  extraInputs: Record<string, unknown> = {}
) {
  const f = render({ Contexts: contexts, Adapter: adapter, ...extraInputs });
  await flush();
  f.detectChanges();
  return f;
}

/** Drains the microtask chain the load runs through. */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe('GenericShareDialogComponent (DOM) — several resources at once', () => {
  it('titles itself with the count and the caller\'s label', async () => {
    const { adapter } = makeAdapter();
    const f = await open(CONTEXTS, adapter, { ResourceLabel: 'conversation' });
    expect(text(f, '.share-dialog-header')).toContain('Share 3 conversations');
  });

  it('keeps the single-resource title when given one context', async () => {
    const { adapter } = makeAdapter();
    const f = await open([context('r1', 'Q3 Dashboard')], adapter, { ResourceLabel: 'dashboard' });
    expect(text(f, '.share-dialog-header')).toContain('Q3 Dashboard');
  });

  it('shows a caller-supplied notice', async () => {
    const { adapter } = makeAdapter();
    const f = await open(CONTEXTS, adapter, { Notice: '2 of 5 left out — you can only share what you own.' });
    expect(text(f, '.share-notice')).toContain('2 of 5 left out');
  });

  it('lists a person once even when they hold access on several resources', async () => {
    const { adapter } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'View' }],
      r3: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    const rows = queryAll(f, '.share-person:not(.share-owner)');
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Amy Adams');
  });

  it('marks the shared level when everyone holds the same one', async () => {
    const { adapter } = makeAdapter({
      r1: [{ user: AMY, level: 'Edit' }],
      r2: [{ user: AMY, level: 'Edit' }],
      r3: [{ user: AMY, level: 'Edit' }]
    });
    const f = await open(CONTEXTS, adapter);
    const active = queryAll(f, '.share-person:not(.share-owner) .share-level-btn.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('Edit');
  });

  it('marks no level and says Mixed when the levels differ', async () => {
    const { adapter } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'Edit' }],
      r3: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    expect(queryAll(f, '.share-person:not(.share-owner) .share-level-btn.active').length).toBe(0);
    expect(text(f, '.share-person-scope')).toContain('Mixed');
  });

  it('says how many resources a partial grant covers', async () => {
    const { adapter } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    expect(text(f, '.share-person-scope')).toContain('2 of 3');
  });

  it('grants a newly added person on every resource', async () => {
    const { adapter, saves } = makeAdapter();
    const f = await open(CONTEXTS, adapter);
    await f.componentInstance.addUserShare(BOB);
    f.detectChanges();
    await f.componentInstance.onSave();
    await flush();
    expect(saves.map(s => s.resourceId).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(saves.every(s => s.userId === 'u-bob' && s.level === 'View')).toBe(true);
  });

  it('applies a level change to every resource, filling in the ones without a grant', async () => {
    const { adapter, saves } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    const editButton = queryAll(f, '.share-person:not(.share-owner) .share-level-btn')
      .find(b => b.textContent?.trim() === 'Edit')!;
    editButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();
    await f.componentInstance.onSave();
    await flush();
    expect(saves.map(s => s.resourceId).sort()).toEqual(['r1', 'r2', 'r3']);
    expect(saves.every(s => s.level === 'Edit')).toBe(true);
  });

  it('withdraws access from every resource when a person is removed', async () => {
    const { adapter, deletes } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'View' }],
      r3: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    (query(f, '.share-person:not(.share-owner) .share-remove-btn') as Element)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    f.detectChanges();
    await f.componentInstance.onSave();
    await flush();
    expect(deletes.map(d => d.resourceId).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it('does not offer a person who already has access everywhere', async () => {
    const { adapter } = makeAdapter({
      r1: [{ user: AMY, level: 'View' }],
      r2: [{ user: AMY, level: 'View' }],
      r3: [{ user: AMY, level: 'View' }]
    });
    const f = await open(CONTEXTS, adapter);
    expect(f.componentInstance.AvailableUsers.map(u => u.ID)).toEqual(['u-bob']);
  });

  it('loads the shares of every resource', async () => {
    const { adapter } = makeAdapter();
    await open(CONTEXTS, adapter);
    expect((adapter.LoadShares as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(3);
  });
});

describe('GenericShareDialogComponent (DOM) — the owners are never offered', () => {
  const OLIVE = user('owner', 'Olive Owner', 'olive@example.com');

  const openWithOwnerListed = async (contexts: ResourceShareContext[]) => {
    const { adapter } = makeAdapter();
    const f = render({ Contexts: contexts, Adapter: adapter }, (c) => {
      (c as unknown as { allUsers: MJUserEntity[] }).allUsers = [OLIVE, AMY, BOB];
    });
    await flush();
    f.detectChanges();
    return f;
  };

  it('leaves the owner out of "Add people" when sharing several resources', async () => {
    const f = await openWithOwnerListed(CONTEXTS);
    expect(f.componentInstance.AvailableUsers.map(u => u.ID)).toEqual(['u-amy', 'u-bob']);
  });

  it('leaves out every owner when the resources belong to different people', async () => {
    const bobs = { ...context('r4', 'Fourth'), OwnerUserID: 'u-bob', OwnerDisplayName: 'Bob Brown' };
    const f = await openWithOwnerListed([...CONTEXTS, bobs]);
    expect(f.componentInstance.AvailableUsers.map(u => u.ID)).toEqual(['u-amy']);
  });
});

describe('GenericShareDialogComponent (DOM) — a retry after a partly failed save', () => {
  /** Adapter whose `failOn` row fails its first save or delete, then succeeds. */
  function makeFlakyAdapter(
    existing: Record<string, MJUserEntity[]>,
    failOn: { resourceId: string; op: 'save' | 'delete' }
  ) {
    const calls: Array<{ resourceId: string; op: 'save' | 'delete'; ok: boolean }> = [];
    let failed = false;
    const attempt = (resourceId: string, op: 'save' | 'delete') => {
      const ok = failed || resourceId !== failOn.resourceId || op !== failOn.op;
      if (!ok) failed = true;
      calls.push({ resourceId, op, ok });
      return ok;
    };
    const makeRow = (resourceId: string, u: MJUserEntity, isNew: boolean): ResourceSharePermissionModel => ({
      PermissionEntity: {
        Save: vi.fn(async () => attempt(resourceId, 'save')),
        Delete: vi.fn(async () => attempt(resourceId, 'delete')),
        LatestResult: { CompleteMessage: 'refused' }
      } as unknown as BaseEntity,
      UserID: u.ID,
      User: u,
      Level: 'View',
      IsNew: isNew,
      MarkedForRemoval: false,
      _InitialLevel: 'View'
    });
    const adapter: ResourceShareAdapter = {
      LoadShares: vi.fn(async (ctx: ResourceShareContext) =>
        (existing[ctx.ResourceID] ?? []).map(u => makeRow(ctx.ResourceID, u, false))),
      CreateShare: vi.fn(async (ctx: ResourceShareContext, u: MJUserEntity) => makeRow(ctx.ResourceID, u, true)),
      SyncLevelToEntity: vi.fn()
    };
    return { adapter, calls };
  }

  const succeeded = (calls: Array<{ resourceId: string; op: string; ok: boolean }>, op: string) =>
    calls.filter(c => c.op === op && c.ok).map(c => c.resourceId).sort();

  it('deletes only the rows still left, and finishes the removal', async () => {
    const { adapter, calls } = makeFlakyAdapter({ r1: [AMY], r2: [AMY], r3: [AMY] }, { resourceId: 'r2', op: 'delete' });
    const f = await open(CONTEXTS, adapter);
    const result = vi.fn();
    f.componentInstance.Result.subscribe(result);
    (query(f, '.share-person:not(.share-owner) .share-remove-btn') as Element)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await f.componentInstance.onSave();
    expect(f.componentInstance.Error).toContain('Amy Adams');
    await f.componentInstance.onSave();

    expect(calls.filter(c => c.resourceId === 'r1' && c.op === 'delete')).toHaveLength(1);
    expect(succeeded(calls, 'delete')).toEqual(['r1', 'r2', 'r3']);
    expect(result).toHaveBeenCalledWith({ Action: 'save' });
  });

  it('saves the rows a failed add left unsaved', async () => {
    const { adapter, calls } = makeFlakyAdapter({}, { resourceId: 'r2', op: 'save' });
    const f = await open(CONTEXTS, adapter);
    await f.componentInstance.addUserShare(BOB);

    await f.componentInstance.onSave();
    expect(f.componentInstance.Error).toContain('Bob Brown');
    await f.componentInstance.onSave();

    expect(succeeded(calls, 'save')).toEqual(['r1', 'r2', 'r3']);
    expect(calls.filter(c => c.resourceId === 'r1' && c.op === 'save')).toHaveLength(1);
  });
});
