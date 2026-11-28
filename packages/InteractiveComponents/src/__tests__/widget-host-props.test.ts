import { describe, it, expect, vi } from 'vitest';
import {
    DEFAULT_WIDGET_SETTINGS_SAVE_DEBOUNCE_MS,
    IsJsonArray,
    IsJsonObject,
    IsJsonPrimitive,
    IsJsonValue,
    IsWidgetHostContext,
    IsWidgetHostProps,
    IsWidgetRole,
    IsWidgetSettingsSchema,
    IsWidgetSizeClass,
    IsWidgetSurface,
    MAX_WIDGET_SETTINGS_PAYLOAD_BYTES,
    ValidateWidgetHostProps,
    ValidateWidgetSettingsAgainstSchema,
    WIDGET_STANDARD_SIZE_CLASSES,
    WIDGET_SURFACES,
    WidgetActionRequestedArgs,
    WidgetEventNames,
    WidgetHostProps,
    WidgetNotificationRequestedArgs,
    WidgetOpenRecordRequest,
    WidgetRecordOpenRequestedArgs,
    WidgetSettingsSchema,
    WidgetUserSettingsSaveRequestedArgs,
    type JsonObject,
} from '../index';

interface SalesPulseSettings extends JsonObject {
    refreshIntervalSeconds: number;
    showPipelineTrend: boolean;
    regionFilter: string;
    pinnedDealIds: string[];
}

function createValidSchema(): WidgetSettingsSchema {
    return {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'Sales Pulse Settings',
        description: 'Per-placement settings persisted via UserInfoEngine',
        properties: {
            refreshIntervalSeconds: {
                type: 'integer',
                title: 'Refresh Interval (s)',
                default: 60,
                minimum: 15,
                maximum: 3600,
            },
            showPipelineTrend: {
                type: 'boolean',
                default: true,
            },
            regionFilter: {
                type: 'string',
                enum: ['ALL', 'NA', 'EMEA', 'APAC'],
                default: 'ALL',
            },
            pinnedDealIds: {
                type: 'array',
                items: { type: 'string', minLength: 1 },
            },
        },
        required: ['refreshIntervalSeconds', 'regionFilter'],
        additionalProperties: false,
    };
}

function createValidWidgetProps(
    overrides: Partial<WidgetHostProps<SalesPulseSettings>> = {}
): WidgetHostProps<SalesPulseSettings> {
    return {
        componentRole: 'widget',
        surface: 'dashboard',
        placementId: 'dash-exec-sales-pulse-01',
        sizeClass: 'wide',
        hostContext: {
            applicationId: 'app-mj-explorer',
            applicationName: 'MJExplorer',
            dashboardId: 'dash-revenue-ops',
            organizationId: 'org-acme-01',
            userId: 'user-alex-01',
            themeMode: 'dark',
            locale: 'en-US',
            timezone: 'America/Chicago',
            isReadOnly: false,
            isCompact: false,
            metadata: {
                layoutColumns: 12,
                featureFlags: ['widget-actions', 'compact-headers'],
            },
        },
        userSettings: {
            refreshIntervalSeconds: 60,
            showPipelineTrend: true,
            regionFilter: 'NA',
            pinnedDealIds: ['deal-101', 'deal-205'],
        },
        settingsSchema: createValidSchema(),
        onOpenRecord: vi.fn(),
        onInvokeAction: vi.fn(async () => ({
            success: true,
            resultCode: 'SUCCESS',
            message: 'Digest sent',
            output: { sentCount: 1 },
        })),
        onNotify: vi.fn(),
        onSaveUserSettings: vi.fn(async () => undefined),
        ...overrides,
    };
}

describe('json-types runtime guards', () => {
    it('accepts valid JSON primitives, arrays, and nested objects', () => {
        expect(IsJsonPrimitive('hello')).toBe(true);
        expect(IsJsonPrimitive(42)).toBe(true);
        expect(IsJsonPrimitive(false)).toBe(true);
        expect(IsJsonPrimitive(null)).toBe(true);
        expect(IsJsonArray([1, 'two', { three: true }, null])).toBe(true);
        expect(IsJsonObject({ a: 1, b: [true, 'ok'], c: { nested: null } })).toBe(true);
        expect(IsJsonValue({ ok: true })).toBe(true);
    });

    it('rejects non-JSON values including NaN, Infinity, functions, undefined, and circular refs', () => {
        expect(IsJsonPrimitive(NaN)).toBe(false);
        expect(IsJsonPrimitive(Infinity)).toBe(false);
        expect(IsJsonPrimitive(undefined)).toBe(false);
        expect(IsJsonValue(() => undefined)).toBe(false);
        expect(IsJsonObject({ bad: undefined as unknown as string })).toBe(false);

        const circular: Record<string, unknown> = { name: 'loop' };
        circular.self = circular;
        expect(IsJsonObject(circular)).toBe(false);
    });
});

describe('WidgetHostProps contract (P8)', () => {
    it('defines expected WidgetSurface and standard WidgetSizeClass literals', () => {
        expect(WIDGET_SURFACES).toEqual(['home', 'dashboard', 'tray', 'desktop-widget', 'companion']);
        expect(WIDGET_STANDARD_SIZE_CLASSES).toEqual(['sm', 'md', 'lg', 'wide', 'tall']);
        expect(DEFAULT_WIDGET_SETTINGS_SAVE_DEBOUNCE_MS).toBeGreaterThan(0);
        expect(MAX_WIDGET_SETTINGS_PAYLOAD_BYTES).toBeGreaterThan(0);
    });

    it('validates widget role, surface, and open-extensible sizeClass', () => {
        expect(IsWidgetRole({ componentRole: 'widget' })).toBe(true);
        expect(IsWidgetRole({ componentRole: 'form' })).toBe(false);
        expect(IsWidgetRole({ componentRole: undefined })).toBe(false);
        expect(IsWidgetRole(null)).toBe(false);

        for (const surface of WIDGET_SURFACES) {
            expect(IsWidgetSurface(surface)).toBe(true);
        }
        expect(IsWidgetSurface('mobile-modal')).toBe(false);
        expect(IsWidgetSurface(42)).toBe(false);

        for (const sizeClass of WIDGET_STANDARD_SIZE_CLASSES) {
            expect(IsWidgetSizeClass(sizeClass)).toBe(true);
        }
        // Open-extensible custom sizeClass token
        expect(IsWidgetSizeClass('companion-rail-2x')).toBe(true);
        expect(IsWidgetSizeClass('')).toBe(false);
        expect(IsWidgetSizeClass('   ')).toBe(false);
        expect(IsWidgetSizeClass(null)).toBe(false);
    });

    it('validates WidgetHostContext and rejects malformed context payloads', () => {
        const props = createValidWidgetProps();
        expect(IsWidgetHostContext(props.hostContext)).toBe(true);
        expect(IsWidgetHostContext({})).toBe(true);
        expect(IsWidgetHostContext({ themeMode: 'neon' })).toBe(false);
        expect(IsWidgetHostContext({ metadata: { fn: () => undefined } })).toBe(false);
        expect(IsWidgetHostContext(null)).toBe(false);
    });

    it('validates complete WidgetHostProps across all surfaces and generic TSettings round-trip', async () => {
        for (const surface of WIDGET_SURFACES) {
            const props = createValidWidgetProps({ surface, sizeClass: 'custom-slot' });
            expect(IsWidgetHostProps(props)).toBe(true);
            const validation = ValidateWidgetHostProps(props);
            expect(validation.valid).toBe(true);
            expect(validation.errors).toEqual([]);
        }

        const props = createValidWidgetProps();
        const openReq: WidgetOpenRecordRequest = {
            entityName: 'Deals',
            primaryKey: { ID: 'deal-101' },
            openMode: 'drawer',
        };
        await props.onOpenRecord(openReq);
        expect(props.onOpenRecord).toHaveBeenCalledWith(openReq);

        const actionRes = await props.onInvokeAction({
            actionName: 'Send Pipeline Digest',
            params: { region: props.userSettings.regionFilter },
        });
        expect(actionRes.success).toBe(true);

        props.onNotify({ message: 'Settings updated', severity: 'success', hideAfterMs: 3000 });
        expect(props.onNotify).toHaveBeenCalledOnce();

        const updated: SalesPulseSettings = {
            ...props.userSettings,
            refreshIntervalSeconds: 120,
        };
        await props.onSaveUserSettings(updated);
        expect(props.onSaveUserSettings).toHaveBeenCalledWith(updated);
    });

    it('rejects invalid WidgetHostProps with specific diagnostic errors', () => {
        const invalidResult = ValidateWidgetHostProps({
            componentRole: 'dashboard',
            surface: 'unknown-surface',
            placementId: '  ',
            sizeClass: '',
            hostContext: { themeMode: 'invalid' },
            userSettings: { bad: NaN },
            settingsSchema: { type: 'array' },
        });

        expect(invalidResult.valid).toBe(false);
        expect(invalidResult.errors.length).toBeGreaterThanOrEqual(7);
        expect(IsWidgetHostProps(null)).toBe(false);
        expect(IsWidgetHostProps(undefined)).toBe(false);
    });

    it('validates WidgetSettingsSchema descriptors and enforces settings against schema', () => {
        const schema = createValidSchema();
        expect(IsWidgetSettingsSchema(schema)).toBe(true);
        expect(IsWidgetSettingsSchema({ type: 'string', properties: {} })).toBe(false);
        expect(IsWidgetSettingsSchema({ type: 'object', properties: { bad: { type: 'date' } } })).toBe(false);

        const valid = ValidateWidgetSettingsAgainstSchema(
            {
                refreshIntervalSeconds: 30,
                showPipelineTrend: false,
                regionFilter: 'EMEA',
                pinnedDealIds: ['deal-1'],
            },
            schema
        );
        expect(valid.valid).toBe(true);

        const invalid = ValidateWidgetSettingsAgainstSchema(
            {
                refreshIntervalSeconds: 5, // below minimum 15
                regionFilter: 'LATAM', // not in enum
                extraUnexpected: true, // additionalProperties: false
            },
            schema
        );
        expect(invalid.valid).toBe(false);
        expect(invalid.errors.some((e) => e.includes('minimum'))).toBe(true);
        expect(invalid.errors.some((e) => e.includes('enum'))).toBe(true);
        expect(invalid.errors.some((e) => e.includes('additionalProperties'))).toBe(true);
    });

    it('supports upward WidgetEventNames and typed cancelable event payloads', () => {
        expect(WidgetEventNames.RecordOpenRequested).toBe('RecordOpenRequested');
        expect(WidgetEventNames.ActionRequested).toBe('ActionRequested');
        expect(WidgetEventNames.NotificationRequested).toBe('NotificationRequested');
        expect(WidgetEventNames.UserSettingsSaveRequested).toBe('UserSettingsSaveRequested');

        const openArgs: WidgetRecordOpenRequestedArgs = {
            timestamp: new Date(),
            sourceComponentName: 'SalesPulseWidget',
            cancel: false,
            request: {
                entityName: 'MJ: Tasks',
                primaryKey: [{ fieldName: 'ID', value: 'task-1' }],
            },
        };
        openArgs.cancel = true;
        openArgs.cancelReason = 'Unsaved edits in host drawer';
        expect(openArgs.cancel).toBe(true);

        const actionArgs: WidgetActionRequestedArgs = {
            timestamp: new Date(),
            cancel: false,
            request: { actionName: 'Refresh Metrics', params: { force: true } },
            result: { success: true, resultCode: 'OK' },
        };
        expect(actionArgs.result?.success).toBe(true);

        const notifyArgs: WidgetNotificationRequestedArgs = {
            timestamp: new Date(),
            request: { message: 'Refreshed', severity: 'info' },
        };
        expect(notifyArgs.request.severity).toBe('info');

        const saveArgs: WidgetUserSettingsSaveRequestedArgs<SalesPulseSettings> = {
            timestamp: new Date(),
            cancel: false,
            placementId: 'dash-exec-sales-pulse-01',
            settings: {
                refreshIntervalSeconds: 60,
                showPipelineTrend: true,
                regionFilter: 'ALL',
                pinnedDealIds: [],
            },
        };
        expect(saveArgs.placementId).toBe('dash-exec-sales-pulse-01');
    });
});
