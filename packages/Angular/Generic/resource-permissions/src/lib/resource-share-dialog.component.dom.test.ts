import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture } from '@angular/core/testing';
import { BaseEntity } from '@memberjunction/core';
import { MJUserEntity } from '@memberjunction/core-entities';
import { MJWindowComponent, MJWindowTitlebarComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture, useFakeGlobalProvider } from '@memberjunction/ng-test-utils';
import { GenericShareDialogComponent } from './resource-share-dialog.component';
import { ResourceSharePermissionModel, ResourceShareContext, ResourceShareAdapter } from './resource-share-adapter';

/**
 * DOM-level spec for <mj-resource-share-dialog>. The dialog is presentational over a
 * three-tier permission model: it gates the whole window on [Visible], renders one row
 * per active share with a View/Edit/Owner level selector, tracks new / modified / removed
 * state via conditional classes, and computes HasChanges to gate the Save button.
 *
 * No backend is touched: ngOnChanges only loads when Visible && Context && Adapter are all
 * set, so we render with Context/Adapter null and seed UserShares directly (zoneless §5:
 * all internal state is set in `setup`, before the single detectChanges()).
 */

// Minimal MJUserEntity stub — the template reads only .ID / .Name / .Email.
function user(id: string, name: string, email?: string): MJUserEntity {
  return { ID: id, Name: name, Email: email ?? '' } as unknown as MJUserEntity;
}

// The PermissionEntity is only touched on save/delete, never during rendering.
const stubEntity = {} as BaseEntity;

function shareRow(
  u: MJUserEntity,
  level: ResourceSharePermissionModel['Level'],
  opts: Partial<Pick<ResourceSharePermissionModel, 'IsNew' | 'MarkedForRemoval' | '_InitialLevel'>> = {},
): ResourceSharePermissionModel {
  return {
    PermissionEntity: stubEntity,
    UserID: u.ID,
    User: u,
    Level: level,
    IsNew: opts.IsNew ?? false,
    MarkedForRemoval: opts.MarkedForRemoval ?? false,
    _InitialLevel: opts._InitialLevel ?? level,
  };
}

const CONTEXT: ResourceShareContext = {
  ResourceID: 'r1',
  ResourceName: 'Q3 Dashboard',
  OwnerUserID: 'owner',
  OwnerDisplayName: 'Olive Owner',
};

function render(setup: (c: GenericShareDialogComponent) => void): ComponentFixture<GenericShareDialogComponent> {
  return renderComponentFixture(GenericShareDialogComponent, {
    imports: [CommonModule, FormsModule, MJWindowComponent, MJWindowTitlebarComponent],
    declarations: [GenericShareDialogComponent],
    inputs: { Visible: true },
    setup,
  });
}

describe('GenericShareDialogComponent (DOM)', () => {
  it('does not render the window when Visible is false', () => {
    const f = renderComponentFixture(GenericShareDialogComponent, {
      imports: [CommonModule, FormsModule, MJWindowComponent, MJWindowTitlebarComponent],
      declarations: [GenericShareDialogComponent],
      inputs: { Visible: false },
    });
    expect(query(f, '.share-dialog-body')).toBeNull();
  });

  it('renders the resource name in the title when visible', () => {
    const f = render((c) => {
      c.Context = CONTEXT;
    });
    expect(text(f, '.share-dialog-header')).toContain('Q3 Dashboard');
  });

  it('shows the owner row from Context.OwnerDisplayName', () => {
    const f = render((c) => {
      c.Context = CONTEXT;
    });
    expect(text(f, '.share-owner .share-person-name')).toBe('Olive Owner');
  });

  it('shows the empty state when there are no active shares', () => {
    const f = render(() => {
      /* no shares */
    });
    expect(query(f, '.share-empty')).not.toBeNull();
    expect(queryAll(f, '.share-person:not(.share-owner)').length).toBe(0);
  });

  it('renders one row per active share with name and email', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada Lovelace', 'ada@x.com'), 'View'), shareRow(user('u2', 'Alan Turing', 'alan@x.com'), 'Edit')];
    });
    const rows = queryAll(f, '.share-person:not(.share-owner)');
    expect(rows.length).toBe(2);
    expect(text(f, '.share-person:not(.share-owner) .share-person-name')).toContain('Ada Lovelace');
    expect(text(f, '.share-person:not(.share-owner) .share-person-email')).toBe('ada@x.com');
  });

  it('marks the active level button for each share row', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'Edit')];
    });
    const buttons = queryAll(f, '.share-level-btn');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['View', 'Edit', 'Owner']);
    const active = buttons.filter((b) => b.classList.contains('active'));
    expect(active.length).toBe(1);
    expect(active[0].textContent?.trim()).toBe('Edit');
  });

  it('applies the share-person-new class to newly added rows', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'View', { IsNew: true })];
    });
    expect(hasClass(f, '.share-person:not(.share-owner)', 'share-person-new')).toBe(true);
    expect(query(f, '.share-badge-new')).not.toBeNull();
  });

  it('marks a row modified when its level differs from the loaded level', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'Edit', { _InitialLevel: 'View' })];
    });
    expect(hasClass(f, '.share-person:not(.share-owner)', 'share-person-modified')).toBe(true);
  });

  it('changes a share level and emits the active class when a level button is clicked', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'View')];
    });
    // click the Owner button (3rd)
    const ownerBtn = queryAll(f, '.share-level-btn')[2] as HTMLButtonElement;
    ownerBtn.click();
    f.detectChanges();

    expect(f.componentInstance.UserShares[0].Level).toBe('Owner');
    const active = queryAll(f, '.share-level-btn').filter((b) => b.classList.contains('active'));
    expect(active[0].textContent?.trim()).toBe('Owner');
  });

  it('moves a non-new row to the removed section when its remove button is clicked', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'View')];
    });
    click(f, '.share-remove-btn');
    f.detectChanges();

    expect(queryAll(f, '.share-person:not(.share-owner)').length).toBe(0);
    expect(query(f, '.share-removed-section')).not.toBeNull();
    expect(text(f, '.share-removed-name')).toBe('Ada');
  });

  it('restores a removed row via undo', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'View', { MarkedForRemoval: true })];
    });
    expect(query(f, '.share-removed-section')).not.toBeNull();
    click(f, '.share-undo-btn');
    f.detectChanges();

    expect(query(f, '.share-removed-section')).toBeNull();
    expect(queryAll(f, '.share-person:not(.share-owner)').length).toBe(1);
  });

  it('shows the unsaved-changes hint and enables Save only when there are changes', () => {
    const f = render((c) => {
      c.UserShares = [shareRow(user('u1', 'Ada'), 'View')]; // unchanged
    });
    expect(query(f, '.share-changes-hint')).toBeNull();
    expect((query(f, '.share-btn-primary') as HTMLButtonElement).disabled).toBe(true);

    // introduce a change
    (queryAll(f, '.share-level-btn')[1] as HTMLButtonElement).click(); // Edit
    f.detectChanges();

    expect(query(f, '.share-changes-hint')).not.toBeNull();
    expect((query(f, '.share-btn-primary') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits a cancel result when Cancel is clicked', () => {
    const f = render(() => {});
    const results = capture(f.componentInstance.Result);
    click(f, '.share-btn-secondary');
    expect(results).toEqual([{ Action: 'cancel' }]);
  });

  it('emits a cancel result (no-op) when Save is clicked with no changes', async () => {
    // onSave first guards on Adapter && Context being present, THEN short-circuits to
    // onCancel() when HasChanges is false. Provide both so we reach the no-op→cancel path.
    const noopAdapter = {
      LoadShares: async () => [],
      CreateShare: async () => shareRow(user('x', 'X'), 'View'),
      SyncLevelToEntity: () => {},
    };
    // Render with Visible=false so ngOnChanges does NOT kick off loadData (no backend here);
    // we set Context/Adapter in setup and drive onSave() directly.
    const f = renderComponentFixture(GenericShareDialogComponent, {
      imports: [CommonModule, FormsModule, MJWindowComponent, MJWindowTitlebarComponent],
      declarations: [GenericShareDialogComponent],
      inputs: { Visible: false },
      setup: (c) => {
        c.Context = CONTEXT;
        c.Adapter = noopAdapter;
        c.UserShares = [shareRow(user('u1', 'Ada'), 'View')]; // unchanged → HasChanges false
      },
    });
    const results = capture(f.componentInstance.Result);
    // Save is disabled in the DOM, so call the handler directly to assert the no-op→cancel path
    await f.componentInstance.onSave();
    expect(results).toEqual([{ Action: 'cancel' }]);
  });

  it('renders the error banner when Error is set', () => {
    const f = render((c) => {
      c.Error = 'Failed to load sharing data.';
    });
    expect(query(f, '.share-alert-error')).not.toBeNull();
    expect(text(f, '.share-alert-error')).toContain('Failed to load sharing data.');
  });

  // Drives the REAL load: opening the dialog (Visible + Context + Adapter) calls loadData() ->
  // a bare `new RunView()` on the global provider for active users -> updateAvailableUsers().
  // useFakeGlobalProvider feeds the user rows; the Adapter is an injectable @Input, so we stub
  // its LoadShares directly. Tests the load + available-users computation end-to-end. (Guide §6.)
  describe('data path (loaded via the global provider)', () => {
    const installProvider = useFakeGlobalProvider();

    const USERS = [user('u1', 'Ada Lovelace', 'ada@example.com'), user('u2', 'Alan Turing', 'alan@example.com')];
    // The Adapter is touched fully only on save/delete; the load path needs just LoadShares.
    // Partial stub via the same justified test-double seam used for the user() stubs above.
    const adapter = { LoadShares: async () => [] as ResourceSharePermissionModel[] } as unknown as ResourceShareAdapter;

    async function renderLoaded(ownerUserID: string | null = null) {
      installProvider({ runViewResults: USERS });
      const context = { ResourceName: 'My Doc', OwnerUserID: ownerUserID } as ResourceShareContext;
      const f = renderComponentFixture(GenericShareDialogComponent, {
        imports: [CommonModule, FormsModule, MJWindowComponent, MJWindowTitlebarComponent],
        declarations: [GenericShareDialogComponent],
        inputs: { Context: context, Adapter: adapter, Visible: true },
      });
      await new Promise((r) => setTimeout(r, 0)); // let loadData's RunView settle
      f.detectChanges();
      return f;
    }

    it('renders an available-user option per loaded active user', async () => {
      const f = await renderLoaded();
      expect(queryAll(f, '.share-user-option').length).toBe(2);
      expect(queryAll(f, '.share-user-name').map((e) => e.textContent?.trim())).toEqual(['Ada Lovelace', 'Alan Turing']);
    });

    it('excludes the resource owner from the available users', async () => {
      const f = await renderLoaded('u1'); // u1 is the owner
      expect(queryAll(f, '.share-user-name').map((e) => e.textContent?.trim())).toEqual(['Alan Turing']);
    });
  });
});
