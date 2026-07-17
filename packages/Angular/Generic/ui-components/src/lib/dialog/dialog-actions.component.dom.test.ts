import { describe, it, expect } from 'vitest';
import { renderTemplate, query, queryAll } from '@memberjunction/ng-test-utils';
import { MJDialogActionsComponent } from './dialog.component';

/**
 * DOM coverage for <mj-dialog-actions> — the dialog footer slot (used ~52×). A pure projection
 * wrapper (`.mj-dialog-actions` > ng-content); the contract is that it renders its projected
 * action buttons inside the wrapper.
 */

describe('MJDialogActionsComponent (DOM)', () => {
  it('wraps and projects its action buttons', async () => {
    const f = await renderTemplate(
      `<mj-dialog-actions><button class="save">Save</button><button class="cancel">Cancel</button></mj-dialog-actions>`,
      { imports: [MJDialogActionsComponent] },
    );
    const wrap = query(f, '.mj-dialog-actions');
    expect(wrap).not.toBeNull();
    const btns = queryAll(f, '.mj-dialog-actions button');
    expect(btns.map((b) => b.textContent?.trim())).toEqual(['Save', 'Cancel']);
  });
});
