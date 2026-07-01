import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { ComponentFixture } from '@angular/core/testing';
import { AgGridModule } from 'ag-grid-angular';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { capture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { renderTemplate } from '@memberjunction/ng-test-utils';
import { Metadata, IMetadataProvider } from '@memberjunction/core';
import { FindRecordDialogComponent } from './dialog.component';
import { FindRecordComponent } from './find-record.component';

/**
 * DOM-level spec for <mj-find-record-dialog>. Its template gates the whole <mj-dialog>
 * (which renders inline — a backdrop <div>, NOT a CDK overlay portal) on the DialogVisible
 * @Input, and projects the OK / Cancel buttons into <mj-dialog-actions>. It also projects
 * an <mj-find-record> child, whose ngOnInit returns early when EntityName is empty, so no
 * backend is needed here.
 *
 * renderTemplate drives CD automatically; we read the dialog component instance out of the
 * fixture (via By.directive) to capture its @Outputs.
 */
const IMPORTS = [CommonModule, FormsModule, AgGridModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent];
const DECLARATIONS = [FindRecordDialogComponent, FindRecordComponent];

function dialogInstance(fixture: ComponentFixture<unknown>): FindRecordDialogComponent {
  return fixture.debugElement.query(By.directive(FindRecordDialogComponent)).componentInstance as FindRecordDialogComponent;
}

describe('FindRecordDialogComponent (DOM)', () => {
  // The dialog projects an <mj-find-record> child, whose ngOnInit reads
  // this.ProviderToUse.EntityByName(...). The dialog template doesn't forward [Provider],
  // so the child falls back to the global Metadata.Provider. renderTemplate gives no host
  // context to bind an input through, so we install a fake global provider for the spec's
  // duration — its EntityByName returns undefined, driving the child's early-return guard
  // (no backend needed) — and restore the prior provider afterward.
  let priorProvider: IMetadataProvider | undefined;
  beforeEach(() => {
    try {
      priorProvider = Metadata.Provider;
    } catch {
      priorProvider = undefined;
    }
    Metadata.Provider = createFakeProvider();
  });
  afterEach(() => {
    if (priorProvider) {
      Metadata.Provider = priorProvider;
    }
  });

  it('renders nothing when DialogVisible is false', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="false"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    expect(query(fixture, 'mj-dialog .mj-dialog-backdrop')).toBeNull();
  });

  it('renders the dialog, its title, and the OK / Cancel actions when DialogVisible is true', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="true" DialogTitle="Pick One"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    expect(query(fixture, '.mj-dialog-backdrop')).not.toBeNull();
    expect(query(fixture, '.mj-dialog-title')?.textContent?.trim()).toBe('Pick One');

    const buttons = queryAll(fixture, 'mj-dialog-actions button').map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['OK', 'Cancel']);
  });

  it('projects the <mj-find-record> child into the dialog body', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="true"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    expect(query(fixture, 'mj-find-record input.find-textbox')).not.toBeNull();
  });

  it('emits DialogClosed(true) and hides the dialog when OK is clicked', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="true"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    const closed = capture(dialogInstance(fixture).DialogClosed);

    const ok = queryAll(fixture, 'mj-dialog-actions button').find((b) => b.textContent?.trim() === 'OK') as HTMLButtonElement;
    ok.click();
    await fixture.whenStable();

    expect(closed).toEqual([true]);
    expect(query(fixture, '.mj-dialog-backdrop')).toBeNull();
  });

  it('emits DialogClosed(false) and hides the dialog when Cancel is clicked', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="true"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    const closed = capture(dialogInstance(fixture).DialogClosed);

    const cancel = queryAll(fixture, 'mj-dialog-actions button').find((b) => b.textContent?.trim() === 'Cancel') as HTMLButtonElement;
    cancel.click();
    await fixture.whenStable();

    expect(closed).toEqual([false]);
    expect(query(fixture, '.mj-dialog-backdrop')).toBeNull();
  });

  it('bubbles a selected record up through OnRecordSelected and stores it on SelectedRecord', async () => {
    const fixture = await renderTemplate(`<mj-find-record-dialog [DialogVisible]="true"></mj-find-record-dialog>`, {
      imports: IMPORTS,
      declarations: DECLARATIONS,
    });
    const instance = dialogInstance(fixture);
    const bubbled = capture(instance.OnRecordSelected);

    const record = { ID: 'abc' };
    instance.BubbleOnRecordSelected(record);

    expect(bubbled).toEqual([record]);
    expect(instance.SelectedRecord).toBe(record);
  });
});
