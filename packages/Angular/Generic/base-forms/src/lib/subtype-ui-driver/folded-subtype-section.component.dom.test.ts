import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { RegisterClass, ValidationErrorInfo } from '@memberjunction/global';
import {
    BaseEntity,
    CompositeKey,
    EntityFieldInfo,
    EntityFieldTSType,
    EntityFieldValueListType,
    EntityInfo,
    IEntitySubtypeSelectorConfig,
    ValidationResult,
} from '@memberjunction/core';
import { MJAlertComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjFoldedSubtypeSectionComponent } from './folded-subtype-section.component';
import { EntitySubtypeUIDriverBase } from './entity-subtype-ui-driver';
import { BaseFormComponent } from '../base-form-component';
import { FormFieldEditCoordinator } from '../form-field-edit.coordinator';
import { FormStateService } from '../form-state.service';
import { MjIsaRelatedPanelComponent } from '../isa-related-panel/isa-related-panel.component';
import type { FormContext } from '../types/form-types';
import type { FormNavigationEvent, EntityHierarchyNavigationEvent } from '../types/navigation-events';
import type { IsaRelatedItem } from '../isa-related-panel/isa-hierarchy-utils';

@Component({
    standalone: true,
    selector: 'mj-collapsible-panel',
    template: `
        <section class="stub-panel" [attr.data-section-key]="SectionKey" [attr.data-section-title]="SectionName">
            <ng-content></ng-content>
        </section>
    `,
})
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Form: unknown;
    @Input() FormContext?: FormContext;
    @Input() Order: number | null = null;
    @Input() DefaultExpanded?: boolean;
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();
}

@Component({
    standalone: true,
    selector: 'mj-form-field',
    template: `<div class="stub-field" [attr.data-field]="FieldName" [attr.data-edit]="EditMode"></div>`,
})
class FormFieldStub {
    @Input() Provider: unknown;
    @Input() Record!: BaseEntity;
    @Input() FieldName = '';
    @Input() Type = 'textbox';
    @Input() LinkType = 'None';
    @Input() ShowLabel = true;
    @Input() EditMode = false;
    @Input() FormContext?: FormContext;
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();
}

@Component({ standalone: true, selector: 'mj-isa-related-card', template: '' })
class IsaCardStub {
    @Input() EntityName = '';
    @Input() PrimaryKey: CompositeKey | null = null;
    @Input() CurrentRecordName = '';
    @Input() Relationship = '';
    @Input() Depth = 0;
    @Input() Children: IsaRelatedItem[] = [];
    @Output() Navigate = new EventEmitter<EntityHierarchyNavigationEvent>();
}

const TEST_UI_DRIVER_KEY = 'ZZZ_TestFoldedSubtypeUIDriver';

@RegisterClass(EntitySubtypeUIDriverBase, TEST_UI_DRIVER_KEY)
@Component({
    standalone: true,
    selector: 'test-folded-ui-driver',
    template: `<div class="custom-ui-driver-marker">Custom Driver Mounted</div>`,
})
class TestCustomSubtypeUIDriverComponent extends EntitySubtypeUIDriverBase {
    public FailValidation = false;

    public override Validate(): ValidationResult {
        const res = new ValidationResult();
        if (this.FailValidation) {
            res.Success = false;
            res.Errors.push(new ValidationErrorInfo('CustomDriver', 'Custom UI driver failed', null, 'Failure'));
        } else {
            res.Success = true;
        }
        return res;
    }

    public override LastKnownValidation(): ValidationResult {
        return this.Validate() as ValidationResult;
    }
}

function makeChildEntityInfo(name: string, codeName: string, fieldNames: string[]): EntityInfo {
    const mkField = (overrides: Record<string, string | number | boolean | null>): EntityFieldInfo => {
        const proto: EntityFieldInfo = Object.create(EntityFieldInfo.prototype) as EntityFieldInfo;
        const descriptors: PropertyDescriptorMap = {};
        for (const [k, v] of Object.entries(overrides)) {
            descriptors[k] = { value: v, configurable: true, enumerable: true, writable: true };
        }
        return Object.defineProperties(proto, descriptors);
    };
    const fields: EntityFieldInfo[] = [
        mkField({
            Name: 'ID',
            DisplayNameOrName: 'ID',
            Sequence: 1,
            IsPrimaryKey: true,
            IncludeInGeneratedForm: true,
            Status: 'Active',
            IsVirtual: false,
            RelatedEntityNameFieldMap: '',
            IsBinaryFieldType: false,
            ReadOnly: true,
            ValueListTypeEnum: EntityFieldValueListType.None,
            TSType: EntityFieldTSType.String,
            Length: 36,
            MaxLength: 36,
            ExtendedType: null,
            RelatedEntity: null,
        }),
        ...fieldNames.map((fn, idx) =>
            mkField({
                Name: fn,
                DisplayNameOrName: fn,
                Sequence: idx + 2,
                IsPrimaryKey: false,
                IncludeInGeneratedForm: true,
                Status: 'Active',
                IsVirtual: false,
                RelatedEntityNameFieldMap: '',
                IsBinaryFieldType: false,
                ReadOnly: false,
                ValueListTypeEnum: EntityFieldValueListType.None,
                TSType: EntityFieldTSType.String,
                Length: 200,
                MaxLength: 200,
                ExtendedType: null,
                RelatedEntity: null,
            }),
        ),
    ];

    const entityProto: EntityInfo = Object.create(EntityInfo.prototype) as EntityInfo;
    return Object.defineProperties(entityProto, {
        Name: { value: name, configurable: true, enumerable: true },
        CodeName: { value: codeName, configurable: true, enumerable: true },
        DisplayNameOrName: { value: name, configurable: true, enumerable: true },
        Icon: { value: 'fa-brands fa-github', configurable: true, enumerable: true },
        Fields: { value: fields, configurable: true, enumerable: true },
        ParentEntityFieldNames: { value: new Set(['ID', 'Name', 'TypeID']), configurable: true, enumerable: true },
        IsFieldReadableByUser: { value: () => true, configurable: true, enumerable: true },
        SubtypeSelectorConfig: { value: null, configurable: true, enumerable: true },
    });
}

interface MockSubtypeParentOptions {
    selectorConfig: IEntitySubtypeSelectorConfig | null;
    initialTypeId?: string | null;
    isSaved?: boolean;
    savedChild?: BaseEntity | null;
    resolveEntityByType: (typeId: string | null) => BaseEntity | null;
    resolveEntityNameByType: (typeId: string | null) => string | null;
    resolveUIDriverByType?: (typeId: string | null) => string | null;
}

function makeMockParentRecord(opts: MockSubtypeParentOptions): BaseEntity & { SetTypeID(val: string | null): void } {
    let currentTypeId = opts.initialTypeId ?? null;
    let currentChild: BaseEntity | null = opts.savedChild ?? null;
    const isSaved = opts.isSaved ?? false;

    const typeField = {
        Name: 'TypeID',
        get Value(): string | null {
            return currentTypeId;
        },
        Dirty: false,
        EntityFieldInfo: { IsPrimaryKey: false },
    };

    const record = {
        IsSaved: isSaved,
        Dirty: !isSaved,
        Fields: [typeField],
        EntityInfo: {
            Name: 'MJ_BizApps_Tasks: Tasks',
            Fields: [{ Name: 'ID' }, { Name: 'TypeID' }],
            SubtypeSelectorConfig: opts.selectorConfig,
        },
        get ISAChild(): BaseEntity | null {
            return currentChild;
        },
        GetFieldByName(name: string) {
            return name === 'TypeID' ? typeField : null;
        },
        RegisterEventHandler: () => new Subscription(),
        ReconcileISAChild: vi.fn(async () => {
            if (currentChild?.IsSaved) {
                return currentChild;
            }
            currentChild = opts.resolveEntityByType(currentTypeId);
            return currentChild;
        }),
        ResolveSubtypeEntityName: vi.fn(async () => opts.resolveEntityNameByType(currentTypeId)),
        ResolveSubtypeUIDriverName: vi.fn(async () => opts.resolveUIDriverByType?.(currentTypeId) ?? null),
        Validate: vi.fn(() => {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }),
        Revert: vi.fn(() => true),
        SetTypeID(val: string | null) {
            currentTypeId = val;
            typeField.Dirty = true;
        },
    };

    return record as unknown as BaseEntity & { SetTypeID(val: string | null): void };
}

function makeMockChildRecord(entityInfo: EntityInfo, isSaved = false, dirtyFieldName?: string): BaseEntity {
    const fields = entityInfo.Fields.map((fi) => ({
        Name: fi.Name,
        Dirty: fi.Name === dirtyFieldName,
        EntityFieldInfo: fi,
        RevertToOldValue: vi.fn(),
    }));
    return {
        IsSaved: isSaved,
        Dirty: !isSaved || Boolean(dirtyFieldName),
        Fields: fields,
        EntityInfo: entityInfo,
        ISAChild: null,
        Validate: vi.fn(() => {
            const r = new ValidationResult();
            r.Success = true;
            return r;
        }),
        Revert: vi.fn(() => {
            for (const f of fields) f.Dirty = false;
            return true;
        }),
    } as unknown as BaseEntity;
}

@Component({ standalone: true, selector: 'test-host-form', template: '' })
class TestFormHostComponent extends BaseFormComponent {
    public override record!: BaseEntity;
}

async function settleFixture(f: { changeDetectorRef: { markForCheck(): void }; detectChanges(): void }): Promise<void> {
    f.changeDetectorRef.markForCheck();
    f.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    f.changeDetectorRef.markForCheck();
    f.detectChanges();
}

describe('MjFoldedSubtypeSectionComponent (DOM)', () => {
    it('keeps TestCustomSubtypeUIDriverComponent registered (tree-shake guard)', () => {
        expect(TestCustomSubtypeUIDriverComponent).toBeDefined();
    });

    it('renders nothing when FoldIntoForm is false or absent', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number', 'HtmlURL']);
        const parent = makeMockParentRecord({
            selectorConfig: { Path: 'TypeID.ExtensionEntity', FoldIntoForm: false },
            initialTypeId: 'type-issue',
            resolveEntityByType: () => makeMockChildRecord(issueInfo),
            resolveEntityNameByType: () => 'GitHub Issue Tasks',
        });

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            inputs: { Record: parent, EditMode: true },
        });
        await settleFixture(f);

        expect(query(f, '.stub-panel')).toBeNull();
    });

    it('shows generated child fields immediately on a new unsaved record and switches live as TypeID changes', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number', 'HtmlURL', 'Milestone']);
        const prInfo = makeChildEntityInfo('GitHub PR Tasks', 'GitHubPRTasks', ['HeadBranch', 'BaseBranch']);

        const parent = makeMockParentRecord({
            selectorConfig: { Path: 'TypeID.ExtensionEntity', AutoEnsureOnSave: true, FoldIntoForm: true },
            initialTypeId: null,
            isSaved: false,
            resolveEntityByType: (t) => {
                if (t === 'type-issue') return makeMockChildRecord(issueInfo);
                if (t === 'type-pr') return makeMockChildRecord(prInfo);
                return null;
            },
            resolveEntityNameByType: (t) => {
                if (t === 'type-issue') return 'GitHub Issue Tasks';
                if (t === 'type-pr') return 'GitHub PR Tasks';
                return null;
            },
        });

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            inputs: { Record: parent, EditMode: true },
        });
        await settleFixture(f);

        // Initially no type selected -> hidden
        expect(query(f, '.stub-panel')).toBeNull();

        // Pick GitHub Issue type before first save -> renders 3 fields immediately
        parent.SetTypeID('type-issue');
        await settleFixture(f);

        expect(query(f, '.stub-panel')?.getAttribute('data-section-title')).toBe('GitHub Issue Tasks');
        expect(queryAll(f, '.stub-field').map((el) => el.getAttribute('data-field'))).toEqual([
            'Number',
            'HtmlURL',
            'Milestone',
        ]);

        // Switch to GitHub PR type -> swaps section to PR fields
        parent.SetTypeID('type-pr');
        await settleFixture(f);

        expect(query(f, '.stub-panel')?.getAttribute('data-section-title')).toBe('GitHub PR Tasks');
        expect(queryAll(f, '.stub-field').map((el) => el.getAttribute('data-field'))).toEqual([
            'HeadBranch',
            'BaseBranch',
        ]);

        // Switch back to plain task with no extension -> hides section cleanly
        parent.SetTypeID('type-plain');
        await settleFixture(f);

        expect(query(f, '.stub-panel')).toBeNull();
    });

    it('mounts a registered UIDriver component in place of generated fields and runs its validator', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number']);
        const childRec = makeMockChildRecord(issueInfo);
        const parent = makeMockParentRecord({
            selectorConfig: {
                Path: 'TypeID.ExtensionEntity',
                FoldIntoForm: true,
                UIDriver: { Path: 'TypeID.UIDriverClass' },
            },
            initialTypeId: 'type-custom-ui',
            resolveEntityByType: () => childRec,
            resolveEntityNameByType: () => 'GitHub Issue Tasks',
            resolveUIDriverByType: () => TEST_UI_DRIVER_KEY,
        });

        const registeredValidators: Array<{
            Validate(): ValidationResult | Promise<ValidationResult>;
            LastKnownValidation(): ValidationResult;
        }> = [];
        const stubForm = {
            EditMode: true,
            EditModeChanged: new EventEmitter<boolean>(),
            Navigate: new EventEmitter<FormNavigationEvent>(),
            RegisterSubtypeValidator: vi.fn((v) => registeredValidators.push(v)),
            UnregisterSubtypeValidator: vi.fn(),
        } as unknown as BaseFormComponent;

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent, TestCustomSubtypeUIDriverComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            inputs: { Record: parent, FormComponent: stubForm, EditMode: true },
        });
        await settleFixture(f);

        expect(query(f, '.custom-ui-driver-marker')?.textContent).toContain('Custom Driver Mounted');
        expect(queryAll(f, '.stub-field').length).toBe(0);

        const driverDebug = f.debugElement.query(By.directive(TestCustomSubtypeUIDriverComponent));
        const driverInst = driverDebug.componentInstance as TestCustomSubtypeUIDriverComponent;
        expect(driverInst.Record).toBe(parent);
        expect(driverInst.ChildRecord).toBe(childRec);
        expect(driverInst.EditMode).toBe(true);
        expect(driverInst.Surface).toBe('form-section');
        expect(registeredValidators.length).toBe(1);

        // Custom UIDriver validation integrates into registered validator contract
        driverInst.FailValidation = true;
        const syncVal = registeredValidators[0].LastKnownValidation();
        expect(syncVal.Success).toBe(false);
        expect(syncVal.Errors.some((e) => e.Message === 'Custom UI driver failed')).toBe(true);

        const asyncVal = await registeredValidators[0].Validate();
        expect(asyncVal.Success).toBe(false);
    });

    it('displays a refusal warning and locks child fields when a saved record with OnSubtypeChange="Refuse" picks a conflicting type', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number']);
        const savedIssueChild = makeMockChildRecord(issueInfo, true);

        const parent = makeMockParentRecord({
            selectorConfig: {
                Path: 'TypeID.ExtensionEntity',
                OnSubtypeChange: 'Refuse',
                FoldIntoForm: true,
            },
            initialTypeId: 'type-issue',
            isSaved: true,
            savedChild: savedIssueChild,
            resolveEntityByType: () => savedIssueChild,
            resolveEntityNameByType: (t) => (t === 'type-issue' ? 'GitHub Issue Tasks' : 'GitHub PR Tasks'),
        });

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            inputs: { Record: parent, EditMode: true },
        });
        await settleFixture(f);

        expect(query(f, '.mj-folded-subtype-warning')).toBeNull();
        expect(query(f, '.stub-field')?.getAttribute('data-edit')).toBe('true');

        // User picks a conflicting type on a saved record
        parent.SetTypeID('type-pr');
        await settleFixture(f);

        expect(query(f, '.mj-folded-subtype-warning')?.textContent).toContain('will be refused on save');
        expect(query(f, '.stub-field')?.getAttribute('data-edit')).toBe('false');
    });

    it('reconciles immediately when FormFieldEditCoordinator notifies on the selector field', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number']);
        const coordinator = new FormFieldEditCoordinator();

        const parent = makeMockParentRecord({
            selectorConfig: { Path: 'TypeID.ExtensionEntity', FoldIntoForm: true },
            initialTypeId: null,
            resolveEntityByType: (t) => (t === 'type-issue' ? makeMockChildRecord(issueInfo) : null),
            resolveEntityNameByType: (t) => (t === 'type-issue' ? 'GitHub Issue Tasks' : null),
        });

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            providers: [{ provide: FormFieldEditCoordinator, useValue: coordinator }],
            inputs: { Record: parent, EditMode: true },
        });
        await settleFixture(f);
        expect(query(f, '.stub-panel')).toBeNull();

        // Unrelated field notification does not reconcile
        (parent.ReconcileISAChild as ReturnType<typeof vi.fn>).mockClear();
        coordinator.Notify({ FieldName: 'Description' });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(parent.ReconcileISAChild).not.toHaveBeenCalled();

        // Selector first-hop field notification triggers reconciliation immediately
        parent.SetTypeID('type-issue');
        coordinator.Notify({ FieldName: 'TypeID' });
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        f.detectChanges();

        expect(parent.ReconcileISAChild).toHaveBeenCalled();
        expect(query(f, '.stub-panel')?.getAttribute('data-section-title')).toBe('GitHub Issue Tasks');
    });

    it('surfaces folded child dirty state, validation, and revert through BaseFormComponent', () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number', 'Milestone']);
        const dirtyChild = makeMockChildRecord(issueInfo, true, 'Milestone');
        (dirtyChild.Validate as ReturnType<typeof vi.fn>).mockReturnValue({
            Success: false,
            Errors: [new ValidationErrorInfo('Milestone', 'Milestone invalid', null, 'Failure')],
        });

        const parent = makeMockParentRecord({
            selectorConfig: { Path: 'TypeID.ExtensionEntity', FoldIntoForm: true },
            initialTypeId: 'type-issue',
            isSaved: true,
            savedChild: dirtyChild,
            resolveEntityByType: () => dirtyChild,
            resolveEntityNameByType: () => 'GitHub Issue Tasks',
        });
        expect(parent.Dirty).toBe(false); // Parent's own fields are clean; only folded child's Milestone is dirty

        const hostForm = renderComponentFixture(TestFormHostComponent, {
            imports: [TestFormHostComponent],
            providers: [{ provide: FormStateService, useValue: { setEditMode: vi.fn() } }],
        }).componentInstance;
        hostForm.record = parent;
        hostForm.EditMode = true;

        expect(hostForm.IsFoldedSubtypeDirty).toBe(true);
        expect(hostForm.FoldedSubtypeDirtyFieldNames).toEqual(['Milestone']);
        expect(hostForm.HasUnsavedChangesBeyondRecord).toBe(true);

        const valResult = hostForm.Validate();
        expect(valResult.Success).toBe(false);
        expect(valResult.Errors[0].Source).toBe('Milestone');

        hostForm.CancelEdit();
        expect(dirtyChild.Revert).toHaveBeenCalledTimes(1);
        expect(parent.ReconcileISAChild).toHaveBeenCalled();
    });

    it('primes lastWatchSignature on Record assignment without duplicate ngDoCheck reconciles and reads saved record.ISAChild', async () => {
        const issueInfo = makeChildEntityInfo('GitHub Issue Tasks', 'GitHubIssueTasks', ['Number', 'HtmlURL']);
        const savedChild = makeMockChildRecord(issueInfo, true);
        const parent = makeMockParentRecord({
            selectorConfig: { Path: 'TypeID.ExtensionEntity', FoldIntoForm: true },
            initialTypeId: 'type-issue',
            isSaved: true,
            savedChild,
            resolveEntityByType: () => savedChild,
            resolveEntityNameByType: () => 'GitHub Issue Tasks',
        });

        const f = renderComponentFixture(MjFoldedSubtypeSectionComponent, {
            imports: [CollapsiblePanelStub, FormFieldStub, MJAlertComponent],
            declarations: [MjFoldedSubtypeSectionComponent],
            inputs: { Record: parent, EditMode: false },
        });
        await settleFixture(f);

        // Saved parent with pre-populated ISAChild renders child fields and does NOT re-reconcile on subsequent ngDoCheck ticks
        expect(f.componentInstance.ActiveChildRecord).toBe(savedChild);
        const callsAfterMount = (parent.ReconcileISAChild as ReturnType<typeof vi.fn>).mock.calls.length;
        f.componentInstance.ngDoCheck();
        f.componentInstance.ngDoCheck();
        await settleFixture(f);
        expect((parent.ReconcileISAChild as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterMount);
    });
});

describe('MjIsaRelatedPanelComponent suppression when FoldIntoForm is enabled', () => {
    it('omits the already-folded direct IS-A child card while promoting deeper non-folded descendants', async () => {
        const grandchild = {
            EntityInfo: { Name: 'Special Issue Tasks', IsParentType: false, IsChildType: true },
            ISAChild: null,
        } as unknown as BaseEntity;
        const foldedChild = {
            EntityInfo: { Name: 'GitHub Issue Tasks', IsParentType: true, IsChildType: true, AllowMultipleSubtypes: false },
            ISAChild: grandchild,
        } as unknown as BaseEntity;
        const parentWithFold = {
            GetRecordName: () => 'Fix Bug #42',
            PrimaryKey: { ToConcatenatedString: () => 'PK-42' } as unknown as CompositeKey,
            ISAChild: foldedChild,
            EntityInfo: {
                Name: 'MJ_BizApps_Tasks: Tasks',
                IsParentType: true,
                IsChildType: false,
                AllowMultipleSubtypes: false,
                SubtypeSelectorConfig: { Path: 'TypeID.ExtensionEntity', FoldIntoForm: true },
            },
        } as unknown as BaseEntity;

        const f = renderComponentFixture(MjIsaRelatedPanelComponent, {
            imports: [IsaCardStub],
            declarations: [MjIsaRelatedPanelComponent],
            setup: (c) => {
                c.Record = parentWithFold;
                c.EditMode = false;
            },
        });
        f.componentInstance.ngOnChanges({
            Record: {
                previousValue: null,
                currentValue: parentWithFold,
                firstChange: false,
                isFirstChange: () => false,
            },
        });
        await new Promise((r) => setTimeout(r, 0));
        f.detectChanges();

        const cards = f.debugElement
            .queryAll(By.directive(IsaCardStub))
            .map((d) => (d.componentInstance as IsaCardStub).EntityName);
        expect(cards).toEqual(['Special Issue Tasks']);
        const navOut = capture(f.componentInstance.Navigate);
        expect(navOut).toEqual([]);
    });
});
