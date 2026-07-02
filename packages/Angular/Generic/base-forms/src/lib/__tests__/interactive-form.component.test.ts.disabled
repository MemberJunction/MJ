/**
 * Tests for InteractiveFormComponent — the Angular wrapper that hosts a
 * React form-role component against a BaseEntity record.
 *
 * Focus is on event-handler behavior, not Angular lifecycle:
 *  - OnReactComponentEvent dispatches by event.type
 *  - handleBeforeSave applies the dirty-field diff and saves
 *  - Save failure surfaces record.LatestResult.CompleteMessage
 *  - handleBeforeDelete calls Delete() and surfaces failure
 *  - Cancelable events honor `cancel: true`
 *  - StartEditMode / EndEditMode propagate to FormHostProps.mode
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ----- Module mocks -------------------------------------------------------

class StubReactBridgeService {
    async getReactContext(): Promise<unknown> {
        return {};
    }
}

vi.mock(import('@angular/core'), async (importOriginal) => {
    const actual = await importOriginal();
    const fakeChangeDetector = { markForCheck: vi.fn(), detectChanges: vi.fn() };
    const fakeReactBridge = new StubReactBridgeService();
    return {
        ...actual,
        Component: () => (target: Function) => target,
        ChangeDetectorRef: class { markForCheck() {} detectChanges() {} } as unknown as typeof actual.ChangeDetectorRef,
        inject: ((token: unknown) => {
            const name = (token as { name?: string } | null)?.name ?? '';
            if (name.includes('ReactBridge')) return fakeReactBridge;
            return fakeChangeDetector;
        }) as unknown as typeof actual.inject,
    };
});

// Stub BaseFormComponent: just enough surface for the wrapper to extend.
// Provides the abstract `record` slot, edit-mode toggles, and permission getters
// the wrapper reads in rebuildFormHostProps.
class StubBaseFormComponent {
    public record!: any;
    public EditMode: boolean = false;
    public UserCanEdit: boolean = true;
    public UserCanDelete: boolean = true;
    public UserCanCreate: boolean = true;
    public ProviderToUse: any = { CurrentUser: { ID: 'u1' } };

    public StartEditMode(): void { this.EditMode = true; }
    public EndEditMode(): void { this.EditMode = false; }
    public async ngOnInit(): Promise<void> {}
    public ngOnDestroy(): void {}
}

vi.mock('../base-form-component', () => ({ BaseFormComponent: StubBaseFormComponent }));

vi.mock(import('@memberjunction/core'), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        LogError: vi.fn(),
        RunView: class {
            static FromMetadataProvider() {
                return { RunView: async () => ({ Success: true, Results: [] }) };
            }
        } as unknown as typeof actual.RunView,
        CompositeKey: class {
            public KeyValuePairs: Array<{ FieldName: string; Value: unknown }> = [];
            public HasValue = false;
        } as unknown as typeof actual.CompositeKey,
        BaseEntity: class {} as unknown as typeof actual.BaseEntity,
    };
});

vi.mock('@memberjunction/interactive-component-types', () => ({
    SimpleEntityFieldInfo: class {
        static FromEntityFieldInfo(info: any) { return { Name: info.Name }; }
    },
}));

vi.mock('@memberjunction/interactive-component-types/forms', () => ({
    FormEventNames: {
        BeforeSave: 'BeforeSave',
        AfterSave: 'AfterSave',
        BeforeDelete: 'BeforeDelete',
        AfterDelete: 'AfterDelete',
        EditModeChangeRequested: 'EditModeChangeRequested',
        FieldChanged: 'FieldChanged',
        DirtyStateChanged: 'DirtyStateChanged',
        ValidationChanged: 'ValidationChanged',
    },
}));

vi.mock('@memberjunction/ng-react', () => ({
    ReactBridgeService: StubReactBridgeService,
    MJReactComponent: class {},
}));

// ----- Test helpers -------------------------------------------------------

const makeField = (name: string) => ({
    Name: name,
    EntityFieldInfo: { Name: name },
});

const makeRecord = (overrides: Partial<{
    Fields: Array<{ Name: string; EntityFieldInfo: { Name: string } }>;
    GetAll: () => Record<string, unknown>;
    PrimaryKey: any;
    EntityInfo: any;
    Set: (name: string, value: unknown) => void;
    Save: () => Promise<boolean>;
    Delete: () => Promise<boolean>;
    LatestResult: { CompleteMessage: string } | undefined;
}> = {}) => ({
    Fields: [makeField('Name'), makeField('Description'), makeField('Icon')],
    GetAll: () => ({ Name: 'Acme', Description: 'old', Icon: 'fa-cube' }),
    PrimaryKey: { HasValue: true, KeyValuePairs: [{ FieldName: 'ID', Value: 'abc' }] },
    EntityInfo: { Name: 'Customer', DisplayName: 'Customer', NameField: { Name: 'Name' } },
    Set: vi.fn(),
    Save: vi.fn(async () => true),
    Delete: vi.fn(async () => true),
    LatestResult: undefined,
    ...overrides,
});

let InteractiveFormComponent: any;

beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../interactive-form/interactive-form.component');
    InteractiveFormComponent = mod.InteractiveFormComponent;
});

const makeWrapper = (record: any) => {
    const w = new InteractiveFormComponent();
    w.record = record;
    return w;
};

// ----- Tests --------------------------------------------------------------

describe('InteractiveFormComponent — event dispatch', () => {

    it('routes BeforeSave to the save handler', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeSave',
            payload: { cancel: false, dirtyFields: { Description: 'new' }, timestamp: new Date() },
        });

        expect(record.Set).toHaveBeenCalledWith('Description', 'new');
        expect(record.Save).toHaveBeenCalledTimes(1);
    });

    it('routes BeforeDelete to the delete handler', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeDelete',
            payload: { cancel: false, timestamp: new Date() },
        });

        expect(record.Delete).toHaveBeenCalledTimes(1);
    });

    it('routes EditModeChangeRequested through the mode handler', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'EditModeChangeRequested',
            payload: { cancel: false, requestedMode: 'edit', timestamp: new Date() },
        });

        expect(wrapper.EditMode).toBe(true);
        expect(wrapper.formHostProps?.mode).toBe('edit');
    });

    it('ignores unknown event types silently', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'TotallyMadeUpEvent',
            payload: {},
        });

        expect(record.Save).not.toHaveBeenCalled();
        expect(record.Delete).not.toHaveBeenCalled();
    });
});

describe('InteractiveFormComponent — handleBeforeSave', () => {

    it('applies the dirty-field diff before calling Save', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeSave',
            payload: {
                cancel: false,
                dirtyFields: { Description: 'new', Icon: 'fa-rocket' },
                timestamp: new Date(),
            },
        });

        // Both dirty fields must be Set on the entity before Save.
        expect(record.Set).toHaveBeenCalledWith('Description', 'new');
        expect(record.Set).toHaveBeenCalledWith('Icon', 'fa-rocket');
        const setCallOrder = vi.mocked(record.Set).mock.invocationCallOrder[0];
        const saveCallOrder = vi.mocked(record.Save).mock.invocationCallOrder[0];
        expect(setCallOrder).toBeLessThan(saveCallOrder);
    });

    it('skips fields not declared on the entity (typo guard)', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeSave',
            payload: {
                cancel: false,
                dirtyFields: { Description: 'new', NotARealField: 'whatever' },
                timestamp: new Date(),
            },
        });

        expect(record.Set).toHaveBeenCalledWith('Description', 'new');
        expect(record.Set).not.toHaveBeenCalledWith('NotARealField', expect.anything());
    });

    it('respects cancel=true and does not call Save', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeSave',
            payload: { cancel: true, dirtyFields: { Description: 'new' }, timestamp: new Date() },
        });

        expect(record.Set).not.toHaveBeenCalled();
        expect(record.Save).not.toHaveBeenCalled();
    });

    it('surfaces CompleteMessage via LogError when Save returns false', async () => {
        const { LogError } = await import('@memberjunction/core');
        const record = makeRecord({
            Save: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'permission denied on EntityFormOverride' },
        });
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeSave',
            payload: { cancel: false, dirtyFields: { Description: 'new' }, timestamp: new Date() },
        });

        expect(LogError).toHaveBeenCalled();
        const msg = (LogError as any).mock.calls[0][0] as string;
        expect(msg).toContain('permission denied on EntityFormOverride');
    });
});

describe('InteractiveFormComponent — handleBeforeDelete', () => {

    it('calls record.Delete() when not cancelled', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeDelete',
            payload: { cancel: false, timestamp: new Date() },
        });

        expect(record.Delete).toHaveBeenCalledTimes(1);
    });

    it('does not call Delete() when cancel=true', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeDelete',
            payload: { cancel: true, timestamp: new Date() },
        });

        expect(record.Delete).not.toHaveBeenCalled();
    });

    it('logs CompleteMessage when Delete returns false', async () => {
        const { LogError } = await import('@memberjunction/core');
        const record = makeRecord({
            Delete: vi.fn(async () => false),
            LatestResult: { CompleteMessage: 'FK constraint blocks delete' },
        });
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'BeforeDelete',
            payload: { cancel: false, timestamp: new Date() },
        });

        expect(LogError).toHaveBeenCalled();
        const msg = (LogError as any).mock.calls[0][0] as string;
        expect(msg).toContain('FK constraint blocks delete');
    });
});

describe('InteractiveFormComponent — mode transitions', () => {

    it('view -> edit on EditModeChangeRequested(edit)', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();
        expect(wrapper.formHostProps?.mode).toBe('view');

        await wrapper.OnReactComponentEvent({
            type: 'EditModeChangeRequested',
            payload: { cancel: false, requestedMode: 'edit', timestamp: new Date() },
        });

        expect(wrapper.EditMode).toBe(true);
        expect(wrapper.formHostProps?.mode).toBe('edit');
    });

    it('edit -> view on EditModeChangeRequested(view)', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();
        wrapper.StartEditMode();
        expect(wrapper.formHostProps?.mode).toBe('edit');

        await wrapper.OnReactComponentEvent({
            type: 'EditModeChangeRequested',
            payload: { cancel: false, requestedMode: 'view', timestamp: new Date() },
        });

        expect(wrapper.EditMode).toBe(false);
        expect(wrapper.formHostProps?.mode).toBe('view');
    });

    it('honors cancel=true on EditModeChangeRequested', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        await wrapper.OnReactComponentEvent({
            type: 'EditModeChangeRequested',
            payload: { cancel: true, requestedMode: 'edit', timestamp: new Date() },
        });

        expect(wrapper.EditMode).toBe(false);
        expect(wrapper.formHostProps?.mode).toBe('view');
    });

    it('Angular-toolbar-driven StartEditMode propagates to formHostProps.mode', () => {
        // This is the bug-fix path: when the toolbar (not React) flips EditMode,
        // the React component must still see the updated mode.
        const record = makeRecord();
        const wrapper = makeWrapper(record);

        wrapper.StartEditMode();
        expect(wrapper.formHostProps?.mode).toBe('edit');

        wrapper.EndEditMode();
        expect(wrapper.formHostProps?.mode).toBe('view');
    });

    it('mode=create when there is no primary key value', async () => {
        const record = makeRecord({
            PrimaryKey: { HasValue: false, KeyValuePairs: [] },
        });
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        // No PK, not in edit mode either -> create
        expect(wrapper.formHostProps?.mode).toBe('create');
    });
});

describe('InteractiveFormComponent — FormHostProps shape', () => {

    it('builds FormHostProps from record + permissions', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        await wrapper.ngOnInit();

        const props = wrapper.formHostProps!;
        expect(props.entityName).toBe('Customer');
        expect(props.canEdit).toBe(true);
        expect(props.canDelete).toBe(true);
        expect(props.canCreate).toBe(true);
        expect(props.entityMetadata.displayName).toBe('Customer');
        expect(props.entityMetadata.nameField).toBe('Name');
        expect(props.record).toEqual({ Name: 'Acme', Description: 'old', Icon: 'fa-cube' });
    });

    it('reflects permission flags from the base form component', async () => {
        const record = makeRecord();
        const wrapper = makeWrapper(record);
        wrapper.UserCanEdit = false;
        wrapper.UserCanDelete = false;
        wrapper.UserCanCreate = false;
        await wrapper.ngOnInit();

        expect(wrapper.formHostProps?.canEdit).toBe(false);
        expect(wrapper.formHostProps?.canDelete).toBe(false);
        expect(wrapper.formHostProps?.canCreate).toBe(false);
    });
});
