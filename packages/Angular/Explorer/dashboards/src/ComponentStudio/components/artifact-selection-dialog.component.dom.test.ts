import { describe, it, expect } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJEmptyStateComponent, MJConfirmService } from '@memberjunction/ng-ui-components';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { ArtifactSelectionDialogComponent } from './artifact-selection-dialog.component';

/**
 * DOM coverage for <app-artifact-selection-dialog> — picks/creates an artifact to save a
 * component into. ngOnInit loads artifacts via RunView (fed by a fake provider → empty), so
 * after the async flush the list shows an empty state. Covers: empty-state, the "create new"
 * toggle, Save gating (disabled until a name/selection exists), and Cancel emitting Close.
 * mj-dialog / mj-loading are content-projecting stubs; the list children are real.
 */

@Component({ standalone: true, selector: 'mj-dialog', template: '<ng-content></ng-content>', inputs: ['Visible', 'Title', 'Width', 'MinWidth'] })
class DialogStub {}
@Component({ standalone: true, selector: 'mj-dialog-actions', template: '<ng-content></ng-content>' })
class DialogActionsStub {}
@Component({ standalone: true, selector: 'mj-loading', template: '<div class="stub-loading"></div>' })
class LoadingStub {
  @Input() text = '';
  @Input() size = '';
}

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render() {
  const fixture = renderComponentFixture(ArtifactSelectionDialogComponent, {
    imports: [CommonModule, FormsModule, MJButtonDirective, MJEmptyStateComponent, DialogStub, DialogActionsStub, LoadingStub],
    declarations: [ArtifactSelectionDialogComponent],
    providers: [
      { provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } },
      { provide: MJConfirmService, useValue: { Confirm: async () => true } },
    ],
    // Assign the fake provider BEFORE the first change-detection fires ngOnInit,
    // so the initial RunView resolves against it (not the undefined global provider).
    setup: (instance) => { instance.Provider = createFakeProvider({ runViewResults: [] }); },
  });
  // ngOnInit already fired during render; let its async filterArtifacts/loadArtifacts resolve.
  await flush();
  fixture.componentInstance['cdr'].detectChanges();
  fixture.detectChanges();
  return fixture;
}

describe('ArtifactSelectionDialogComponent (DOM)', () => {
  it('renders the dialog and, after load with no artifacts, shows the empty state', async () => {
    const fixture = await render();
    expect(query(fixture, '.artifact-selection-content')).not.toBeNull();
    expect(fixture.componentInstance.isLoading).toBe(false);
    expect(query(fixture, '.artifacts-list mj-empty-state')).not.toBeNull();
  });

  it('offers a "Create New Artifact" button in the create section', async () => {
    const fixture = await render();
    expect(text(fixture, '.create-section')).toContain('Create New Artifact');
  });

  it('reveals the new-artifact name/description form when Create New is clicked', async () => {
    const fixture = await render();
    expect(query(fixture, '.new-artifact-form')).toBeNull();
    queryAll(fixture, 'button').find((b) => b.textContent?.includes('Create New Artifact'))!.dispatchEvent(new Event('click'));
    fixture.detectChanges();
    expect(query(fixture, '.new-artifact-form')).not.toBeNull();
    expect(fixture.componentInstance.showNewArtifactForm).toBe(true);
  });

  it('disables Save when nothing is selected and no new-artifact name is entered', async () => {
    const fixture = await render();
    const save = queryAll(fixture, 'button').find((b) => b.textContent?.includes('Save as Version')) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(fixture.componentInstance.canSave()).toBe(false);
  });

  it('emits Close(undefined) when Cancel is clicked', async () => {
    const fixture = await render();
    const closed = capture(fixture.componentInstance.Close);
    queryAll(fixture, 'button').find((b) => b.textContent?.trim() === 'Cancel')!.dispatchEvent(new Event('click'));
    expect(closed.length).toBe(1);
    expect(closed[0]).toBeUndefined();
  });
});
