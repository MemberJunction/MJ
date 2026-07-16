import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query, queryAll, capture } from '@memberjunction/ng-test-utils';
import type { BaseEntity } from '@memberjunction/core';
import { EntityFormDialogComponent } from './entity-form-dialog.component';
import { EntityFormDialogModule } from '../module';

/**
 * DOM coverage for <mj-entity-form-dialog> — a modal shell that hosts a dynamically-created entity
 * form. The dynamic form (created via ViewContainerRef against the ClassFactory registry) needs a
 * registered form + real Record and is out of unit scope; these specs cover the shell the component
 * OWNS: the `@if (Visible)` gating, the dialog title, the Save/Cancel button gating, and the
 * DialogClosed emission.
 *
 * Setting `Visible = true` schedules `ShowForm()` on a microtask; with a minimal Record stub (no
 * form registered for its entity) `ShowForm()` finds no registration and simply renders the empty
 * dialog — so the shell is testable without standing up a real form. Explicit `detectChanges(false)`
 * renders the dialog container before that microtask runs.
 */

// Minimal Record: ShowForm reads `.EntityInfo.Name` to look up a (non-existent) form registration;
// CloseWindow('Cancel') calls `.Revert()` when AutoRevertOnCancel is on.
const makeRecord = () => ({ EntityInfo: { Name: 'Users' }, Revert: vi.fn(), Save: vi.fn().mockResolvedValue(true) }) as unknown as BaseEntity;

interface RenderOpts {
  Visible?: boolean;
  ShowSaveButton?: boolean;
  ShowCancelButton?: boolean;
  Title?: string;
}

async function render(opts: RenderOpts = {}): Promise<ComponentFixture<EntityFormDialogComponent>> {
  TestBed.configureTestingModule({ imports: [EntityFormDialogModule] });
  const fixture = TestBed.createComponent(EntityFormDialogComponent);
  const ref = fixture.componentRef;
  ref.setInput('Record', makeRecord());
  ref.setInput('Title', opts.Title ?? 'Edit User');
  if (opts.ShowSaveButton !== undefined) ref.setInput('ShowSaveButton', opts.ShowSaveButton);
  if (opts.ShowCancelButton !== undefined) ref.setInput('ShowCancelButton', opts.ShowCancelButton);
  ref.setInput('Visible', opts.Visible ?? false);
  fixture.detectChanges(false); // render the dialog container before the scheduled ShowForm() runs
  await new Promise((r) => setTimeout(r, 0)); // let the Visible-setter microtask (ShowForm) settle
  fixture.componentRef.changeDetectorRef.markForCheck();
  fixture.detectChanges(false);
  return fixture;
}

describe('EntityFormDialogComponent (DOM)', () => {
  it('renders nothing when Visible is false', async () => {
    expect(query(await render({ Visible: false }), 'mj-dialog')).toBeNull();
  });

  it('renders the dialog with its title when Visible is true', async () => {
    const fixture = await render({ Visible: true, Title: 'Edit User' });
    const dialog = query(fixture, 'mj-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Edit User');
  });

  it('shows both Save and Cancel buttons by default', async () => {
    const labels = queryAll(await render({ Visible: true }), 'button').map((b) => b.textContent?.trim());
    expect(labels).toContain('Save');
    expect(labels).toContain('Cancel');
  });

  it('hides the Save button when ShowSaveButton is false', async () => {
    const labels = queryAll(await render({ Visible: true, ShowSaveButton: false }), 'button').map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Save');
    expect(labels).toContain('Cancel');
  });

  it('hides the Cancel button when ShowCancelButton is false', async () => {
    const labels = queryAll(await render({ Visible: true, ShowCancelButton: false }), 'button').map((b) => b.textContent?.trim());
    expect(labels).not.toContain('Cancel');
    expect(labels).toContain('Save');
  });

  it('emits DialogClosed("Cancel") when the Cancel button is clicked', async () => {
    const fixture = await render({ Visible: true });
    const closed = capture(fixture.componentInstance.DialogClosed);
    const cancel = queryAll(fixture, 'button').find((b) => b.textContent?.includes('Cancel')) as HTMLElement;
    cancel.click();
    await fixture.whenStable();
    expect(closed).toEqual(['Cancel']);
  });
});
