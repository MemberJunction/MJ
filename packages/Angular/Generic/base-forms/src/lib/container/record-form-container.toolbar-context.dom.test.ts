import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { MjRecordFormContainerComponent } from './record-form-container.component';
import {
  BaseFormToolbarAction,
  FormToolbarActionLifecycleContext,
  RegisterFormToolbarAction,
} from '../toolbar/base-form-toolbar-action';
import { FormChromeCoordinator } from '../chrome/form-chrome-coordinator.service';

/** Child stubs, copied from record-form-container.component.dom.test.ts: every input the template binds. */
@Component({ standalone: true, selector: 'mj-form-toolbar', template: '' })
class ToolbarStub {
  @Input() Record: unknown; @Input() EditMode = false; @Input() UserCanEdit = false; @Input() UserCanDelete = false;
  @Input() IsFavorite = false; @Input() FavoriteInitDone = false; @Input() IsDirty = false; @Input() DirtyFieldNames: unknown;
  @Input() ListCount = 0; @Input() TagCount = 0; @Input() LinksOpen = false; @Input() LinkCount = 0; @Input() CommentsOpen = false; @Input() CommentCount = 0; @Input() ConflictCount = 0; @Input() AttachmentCount = 0; @Input() AttachmentsAvailable = false; @Input() IsAttachmentsPanelOpen = false; @Input() VersionCount = 0; @Input() EntityInfo: unknown; @Input() Config: unknown;
  @Input() IsSaving = false; @Input() IsRefreshing = false; @Input() VisibleSectionCount = 0; @Input() TotalSectionCount = 0; @Input() ExpandedSectionCount = 0;
  @Input() SearchFilter = ''; @Input() ShowEmptyFields = false; @Input() WidthMode = ''; @Input() HasCustomSectionOrder = false;
  @Input() Variants: unknown; @Input() CurrentVariantID: unknown; @Input() FormModeSwitch: unknown;
  @Input() RegisteredItems: unknown; @Input() ItemOverrides: unknown; @Input() FormComponent: unknown;
  @Input() ChromeLayout = 'accordion';
  @Output() Navigate = new EventEmitter<unknown>();
  @Output() EditModeChange = new EventEmitter<boolean>();
  @Output() BeforeSave = new EventEmitter<unknown>();
  @Output() SaveRequested = new EventEmitter<void>();
  @Output() BeforeRefresh = new EventEmitter<unknown>();
  @Output() RefreshRequested = new EventEmitter<void>();
  @Output() CancelRequested = new EventEmitter<void>();
  @Output() DeleteRequested = new EventEmitter<void>();
  @Output() ToolbarItemClick = new EventEmitter<unknown>();
}
@Component({ standalone: true, selector: 'mj-section-manager', template: '' })
class SectionManagerStub {
  @Input() Sections: unknown;
  @Input() SectionOrder: unknown;
  @Input() MoreSectionKeys: unknown;
  @Input() LockedMoreKeys: unknown;
  @Input() Visible = false;
}
@Component({ standalone: true, selector: 'mj-panel-manager', template: '' })
class PanelManagerStub {
  @Input() Visible = false;
  @Input() Entity: unknown;
  @Input() Compiled: unknown;
  @Input() StockGrids: unknown;
  @Input() FullCustomForm = false;
  @Input() TitleByKey: unknown;
  @Input() Related: unknown;
  @Input() Provider: unknown;
  @Input() Variants: unknown;
  @Input() CurrentFormID: unknown;
  @Input() RecordKey: unknown;
  @Output() FormChosen = new EventEmitter<string | null>();
}
@Component({ standalone: true, selector: 'mj-form-panel-slot', template: '' })
class PanelSlotStub { @Input() Entity: unknown; @Input() Record: unknown; @Input() FormComponent: unknown; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub { @Input() Message = ''; }
@Component({ standalone: true, selector: 'mj-isa-related-panel', template: '' })
class IsaPanelStub { @Input() Record: unknown; @Input() EditMode = false; @Input() Collapsed = false; }
@Component({ standalone: true, selector: 'mj-record-changes', template: '' })
class RecordChangesStub { @Input() record: unknown; @Input() AllowRestore = false; @Input() PreviewedChangeID: unknown = null; }
@Component({ standalone: true, selector: 'mj-record-tags', template: '' })
class RecordTagsStub { @Input() Record: unknown; @Input() WidthPx = 0; }
@Component({ standalone: true, selector: 'mj-record-links', template: '' })
class RecordLinksStub { @Input() Provider: unknown; @Input() Record: unknown; @Input() Mode = 'drawer'; @Input() IsOpen = false; }
@Component({ standalone: true, selector: 'mj-record-comments', template: '' })
class RecordCommentsStub { @Input() Provider: unknown; @Input() Record: unknown; @Input() Mode = 'drawer'; @Input() IsOpen = false; @Input() Coordinator: unknown; @Input() WidthPx = 0; }
@Component({ standalone: true, selector: 'mj-record-attachments', template: '' })
class RecordAttachmentsStub { @Input() Record: unknown; @Input() Visible = false; }
@Component({ standalone: true, selector: 'mj-list-management-dialog', template: '' })
class ListMgmtStub { @Input() visible = false; @Input() config: unknown; }
@Component({ standalone: true, selector: 'mj-form-contributions', template: '' })
class FormContributionsStub { @Input() Record: unknown; @Input() FormComponent: unknown; @Input() FormContext: unknown; @Input() BakedSectionKeys: unknown; @Input() ShowRelatedEntities = true; }

@Component({ standalone: true, selector: 'mj-bottom-sheet', template: '@if (Visible) { <ng-content></ng-content> }' })
class BottomSheetStub { @Input() Visible = false; @Input() Title = ''; @Output() VisibleChange = new EventEmitter<boolean>(); @Output() Closed = new EventEmitter<void>(); }

const CHILD_STUBS = [BottomSheetStub, ToolbarStub, SectionManagerStub, PanelManagerStub, PanelSlotStub, EmptyStateStub, IsaPanelStub, RecordChangesStub, RecordTagsStub, RecordLinksStub, RecordCommentsStub, RecordAttachmentsStub, ListMgmtStub, FormContributionsStub];

const PROBE_ENTITY = 'Toolbar Injector Probe';
const seen: FormToolbarActionLifecycleContext[] = [];

@RegisterFormToolbarAction({ Key: 'toolbar-injector-probe', EntityScope: PROBE_ENTITY })
class InjectorProbeToolbarAction extends BaseFormToolbarAction {
  public override IsApplicable(ctx: FormToolbarActionLifecycleContext): boolean {
    seen.push(ctx);
    return true;
  }
  public override OnExecute(): void {}
}
void InjectorProbeToolbarAction;

describe('MjRecordFormContainerComponent — toolbar action context', () => {
  it('passes the container injector to toolbar actions', () => {
    const record = { EntityInfo: { Name: PROBE_ENTITY }, IsSaved: true } as unknown as BaseEntity;
    const f = renderComponentFixture(MjRecordFormContainerComponent, {
      imports: CHILD_STUBS,
      declarations: [MjRecordFormContainerComponent],
      inputs: { Record: record, EntityInfo: { Name: PROBE_ENTITY } },
    });
    seen.length = 0;
    void f.componentInstance.EffectiveRegisteredToolbarItems;

    expect(seen.length).toBeGreaterThan(0);
    const injector = seen[0].Injector;
    expect(injector).toBeDefined();
    expect(injector?.get(FormChromeCoordinator)).toBe(f.debugElement.injector.get(FormChromeCoordinator));
  });
});
