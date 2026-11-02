import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { IMetadataProvider } from '@memberjunction/core';
import type { UserInfo } from '@memberjunction/core';
import type { MJProjectEntity } from '@memberjunction/core-entities';
import type { MJDialogRef } from '@memberjunction/ng-ui-components';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ProjectFormModalComponent } from './project-form-modal.component';

/**
 * DOM spec for <mj-project-form-modal>'s save failure reporting.
 *
 * BaseEntity.Save() returns false and records WHY in LatestResult — a server
 * refusal, an FK violation, a failed stored procedure. The modal must show that
 * reason; a generic "Failed to save project" leaves the user with nothing to act on.
 */
@Component({ standalone: false, selector: 'mj-dialog', template: '<ng-content></ng-content>' })
class StubDialogComponent {
  @Input() Title = '';
  @Input() Width = 0;
  @Input() MinWidth = 0;
  @Input() Visible = false;
}

@Component({ standalone: false, selector: 'mj-dialog-actions', template: '<ng-content></ng-content>' })
class StubDialogActionsComponent {}

const currentUser = { ID: 'u1', Name: 'Tester' } as unknown as UserInfo;

/** A project entity whose Save fails the way a server refusal does: false + a reason. */
const failingProject = (reason: string) =>
  ({
    ID: '',
    Name: '',
    Description: null,
    Color: null,
    Icon: null,
    EnvironmentID: '',
    ParentID: null,
    IsArchived: false,
    Save: vi.fn().mockResolvedValue(false),
    LatestResult: { Success: false, Message: reason, CompleteMessage: reason, Errors: [] }
  } as unknown as MJProjectEntity);

const render = (project: MJProjectEntity) => {
  const close = vi.fn();
  const provider = {
    GetEntityObject: vi.fn().mockResolvedValue(project)
  } as unknown as IMetadataProvider;

  const f = renderComponentFixture(ProjectFormModalComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ProjectFormModalComponent, StubDialogComponent, StubDialogActionsComponent],
    inputs: {
      environmentId: 'env1',
      currentUser,
      dialogRef: { Close: close } as unknown as MJDialogRef,
      Provider: provider
    },
  });
  f.componentInstance.formData.name = 'Budget';
  return { f, close };
};

describe('ProjectFormModalComponent (DOM) — save failure reporting', () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('shows the reason the save was refused, not a generic message', async () => {
    const { f } = render(failingProject('User Tester does NOT have permission to Create MJ: Projects records.'));

    await f.componentInstance.onSave();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(String(alertSpy.mock.calls[0][0])).toContain('does NOT have permission to Create');
  });

  it('keeps the dialog open and emits nothing when the save fails', async () => {
    const { f, close } = render(failingProject('FK constraint violated'));
    const saved = vi.fn();
    f.componentInstance.projectSaved.subscribe(saved);

    await f.componentInstance.onSave();

    expect(saved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('still reports something when the entity carries no reason at all', async () => {
    const project = failingProject('');
    (project as unknown as { LatestResult: unknown }).LatestResult = null;
    const { f } = render(project);

    await f.componentInstance.onSave();

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(String(alertSpy.mock.calls[0][0]).length).toBeGreaterThan(0);
  });
});

describe('ProjectFormModalComponent (DOM) — visibility hint on a new folder', () => {
  const SHARING_IS_ONE_WAY = "Once shared, a folder can't be made private again.";

  /** Renders a new-folder dialog with the visibility already chosen, before the first paint. */
  const renderWithVisibility = (isPersonal: boolean): string => {
    const f = renderComponentFixture(ProjectFormModalComponent, {
      imports: [CommonModule, FormsModule],
      declarations: [ProjectFormModalComponent, StubDialogComponent, StubDialogActionsComponent],
      inputs: { environmentId: 'env1', currentUser, dialogRef: { Close: vi.fn() } as unknown as MJDialogRef },
      setup: (instance) => {
        instance.formData.isPersonal = isPersonal;
      },
    });
    return (f.nativeElement as HTMLElement).querySelector('#projectVisibilityHint')?.textContent ?? '';
  };

  it('warns that sharing cannot be undone when Everyone is selected', () => {
    expect(renderWithVisibility(false)).toContain(SHARING_IS_ONE_WAY);
  });

  it('does not show the warning when Only me is selected', () => {
    const hint = renderWithVisibility(true);
    expect(hint).toContain('Only you can see this folder.');
    expect(hint).not.toContain(SHARING_IS_ONE_WAY);
  });
});
