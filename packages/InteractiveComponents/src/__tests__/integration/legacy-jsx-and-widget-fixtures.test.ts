import { describe, it, expect, vi } from 'vitest';
import {
    BuildComponentCompleteCode,
    ComponentDataRequirements,
    ComponentSpec,
    ComponentSpecRuntime,
    IsOperationAllowed,
    IsUpdateHostAdapter,
    IsWidgetHostProps,
    IsWidgetRole,
    ResolveAllowedOperations,
    ResolveComponentLanguage,
    ResolveComponentLanguageInfo,
    UpdateHostAdapter,
    UpdateStateSnapshot,
    ValidateComponentLanguageSpec,
    ValidateOperationAllowlist,
    ValidateUpdateTransition,
    ValidateWidgetHostProps,
    ValidateWidgetSettingsAgainstSchema,
    WidgetHostProps,
    WidgetInvokeActionRequest,
    WidgetOpenRecordRequest,
    WidgetSettingsSchema,
    type JsonObject,
} from '../../index';

/**
 * Multi-entity domain seed fixtures spanning Organizations, People, Roles,
 * EntityPermissions, and cross-app Widget/Legacy specs (no single-row toy mocks).
 */
interface DomainSeedWorld {
    organizations: Array<{ id: string; name: string; tier: 'enterprise' | 'growth' }>;
    people: Array<{ id: string; email: string; organizationId: string; roleNames: string[] }>;
    roles: Array<{ name: string; allowedOperations: string[]; canReadEntities: string[] }>;
}

function buildMultiEntitySeedWorld(): DomainSeedWorld {
    return {
        organizations: [
            { id: 'org-northstar-001', name: 'Northstar Logistics', tier: 'enterprise' },
            { id: 'org-beacon-002', name: 'Beacon Health Systems', tier: 'growth' },
        ],
        people: [
            {
                id: 'person-elena-101',
                email: 'elena@northstar.example',
                organizationId: 'org-northstar-001',
                roleNames: ['OperationsDirector', 'WidgetAuthor'],
            },
            {
                id: 'person-marcus-102',
                email: 'marcus@beacon.example',
                organizationId: 'org-beacon-002',
                roleNames: ['Analyst'],
            },
        ],
        roles: [
            {
                name: 'OperationsDirector',
                allowedOperations: ['RecordProcess.GetRunStatus', 'Template.Run'],
                canReadEntities: ['Organizations', 'People', 'MJ: Tasks', 'MJ: User Settings'],
            },
            {
                name: 'Analyst',
                allowedOperations: ['Template.Run'],
                canReadEntities: ['Organizations', 'MJ: Tasks'],
            },
        ],
    };
}

/**
 * Simulates the sandbox bridge enforcing P11 allowlists alongside role-based permissions.
 */
function simulateSandboxBridgeCall(
    spec: ComponentSpec,
    personRoles: string[],
    world: DomainSeedWorld,
    operationKey: string
): { allowed: boolean; reason?: string } {
    if (!IsOperationAllowed(spec.dataRequirements, operationKey)) {
        return { allowed: false, reason: `DENIED_BY_SPEC_ALLOWLIST:${operationKey}` };
    }

    const rolePermitsOp = personRoles.some((roleName) => {
        const role = world.roles.find((r) => r.name === roleName);
        return role ? role.allowedOperations.includes(operationKey) : false;
    });
    if (!rolePermitsOp) {
        return { allowed: false, reason: `DENIED_BY_ROLE_RBAC:${operationKey}` };
    }
    return { allowed: true };
}

describe('Cross-contract integration fixtures: TSX Widgets, Ops Allowlists & G9 Legacy JSX', () => {
    it('validates multi-entity TSX widget spec, settings schema, UserInfoEngine-aligned persistence, and ops bridge boundaries', async () => {
        const world = buildMultiEntitySeedWorld();
        const director = world.people[0];
        const analyst = world.people[1];

        const settingsSchema: WidgetSettingsSchema = {
            type: 'object',
            title: 'Org Operations Digest Settings',
            properties: {
                organizationScopeId: { type: 'string', minLength: 1 },
                maxVisibleTasks: { type: 'integer', minimum: 5, maximum: 50, default: 15 },
                includeSubOrgs: { type: 'boolean', default: true },
            },
            required: ['organizationScopeId', 'maxVisibleTasks'],
            additionalProperties: false,
        };

        interface DigestWidgetSettings extends JsonObject {
            organizationScopeId: string;
            maxVisibleTasks: number;
            includeSubOrgs: boolean;
        }

        const widgetSpec: ComponentSpec = {
            name: 'OrgOperationsDigestWidget',
            location: 'embedded',
            description: 'Cross-entity TSX widget displaying org tasks, owners, and run status',
            title: 'Org Operations Digest',
            type: 'dashboard',
            componentRole: 'widget',
            language: 'tsx',
            erasableSyntaxOnly: true,
            tsxMetadata: {
                erasableSyntaxOnly: true,
                jsxTransform: 'react-jsx',
                targetTypeScriptVersion: '5.9',
            },
            code: 'export function OrgOperationsDigestWidget(props: { placementId: string }) { return <div>{props.placementId}</div>; }',
            functionalRequirements: 'Display tasks grouped by organization and person',
            technicalDesign: 'TSX widget hosted across Home, Dashboard, Tray, and Companion surfaces',
            exampleUsage: '<OrgOperationsDigestWidget />',
            dataRequirements: {
                mode: 'hybrid',
                entities: [
                    {
                        name: 'Organizations',
                        displayFields: ['ID', 'Name', 'Tier'],
                        fieldMetadata: [],
                        permissionLevelNeeded: ['read'],
                    },
                    {
                        name: 'People',
                        displayFields: ['ID', 'Email', 'OrganizationID'],
                        fieldMetadata: [],
                        permissionLevelNeeded: ['read'],
                    },
                    {
                        name: 'MJ: Tasks',
                        displayFields: ['ID', 'Name', 'Status', 'UserID'],
                        fieldMetadata: [],
                        permissionLevelNeeded: ['read', 'update'],
                    },
                ],
                queries: [
                    {
                        name: 'ActiveTasksByOrganization',
                        categoryPath: 'Operations/Widgets',
                        fields: [],
                        entityNames: ['Organizations', 'People', 'MJ: Tasks'],
                    },
                ],
                operations: [
                    {
                        operationKey: 'RecordProcess.GetRunStatus',
                        executionMode: 'Sync',
                        requiredScope: 'recordprocess:read',
                        description: 'Inspect nightly org sync process run status',
                    },
                    {
                        operationKey: 'Template.Run',
                        executionMode: 'Sync',
                        requiredScope: 'templates:execute',
                        description: 'Render executive summary digest',
                    },
                ],
            },
        };

        // 1. Spec language, role, and allowlist validation
        expect(IsWidgetRole(widgetSpec)).toBe(true);
        const langValidation = ValidateComponentLanguageSpec(widgetSpec);
        expect(langValidation.valid).toBe(true);
        expect(langValidation.resolved?.language).toBe('tsx');
        expect(langValidation.resolved?.erasableSyntaxOnly).toBe(true);
        expect(ResolveComponentLanguageInfo(widgetSpec).jsxTransform).toBe('react-jsx');

        const allowlistValidation = ValidateOperationAllowlist(widgetSpec.dataRequirements?.operations);
        expect(allowlistValidation.valid).toBe(true);
        expect(allowlistValidation.allowlist).toHaveLength(2);

        // 2. Sandbox bridge boundary checks (spec allowlist AND RBAC role checks)
        expect(simulateSandboxBridgeCall(widgetSpec, director.roleNames, world, 'RecordProcess.GetRunStatus')).toEqual({
            allowed: true,
        });
        expect(simulateSandboxBridgeCall(widgetSpec, director.roleNames, world, 'Records.DeleteAll')).toEqual({
            allowed: false,
            reason: 'DENIED_BY_SPEC_ALLOWLIST:Records.DeleteAll',
        });
        expect(simulateSandboxBridgeCall(widgetSpec, analyst.roleNames, world, 'RecordProcess.GetRunStatus')).toEqual({
            allowed: false,
            reason: 'DENIED_BY_ROLE_RBAC:RecordProcess.GetRunStatus',
        });

        // 3. Simulated UserInfoEngine-backed settings persistence & WidgetHostProps hydration
        const userInfoSettingsStore = new Map<string, DigestWidgetSettings>();
        const placementId = 'home-northstar-ops-digest';

        const hostProps: WidgetHostProps<DigestWidgetSettings> = {
            componentRole: 'widget',
            surface: 'home',
            placementId,
            sizeClass: 'lg',
            hostContext: {
                applicationName: 'MJExplorer',
                organizationId: director.organizationId,
                userId: director.id,
                themeMode: 'light',
                locale: 'en-US',
            },
            userSettings: {
                organizationScopeId: director.organizationId,
                maxVisibleTasks: 15,
                includeSubOrgs: true,
            },
            settingsSchema,
            onOpenRecord: vi.fn(),
            onInvokeAction: vi.fn(async (req: WidgetInvokeActionRequest) => ({
                success: true,
                resultCode: 'SUCCESS',
                output: { action: req.actionName },
            })),
            onNotify: vi.fn(),
            onSaveUserSettings: async (nextSettings: DigestWidgetSettings) => {
                const check = ValidateWidgetSettingsAgainstSchema(nextSettings, settingsSchema);
                if (!check.valid) {
                    throw new Error(check.errors.join('; '));
                }
                userInfoSettingsStore.set(placementId, nextSettings);
            },
        };

        expect(IsWidgetHostProps(hostProps)).toBe(true);
        expect(ValidateWidgetHostProps(hostProps).valid).toBe(true);

        const openRequest: WidgetOpenRecordRequest = {
            entityName: 'Organizations',
            primaryKey: { ID: director.organizationId },
            openMode: 'tab',
        };
        await hostProps.onOpenRecord(openRequest);
        expect(hostProps.onOpenRecord).toHaveBeenCalledWith(openRequest);

        await hostProps.onSaveUserSettings({
            organizationScopeId: director.organizationId,
            maxVisibleTasks: 25,
            includeSubOrgs: false,
        });
        expect(userInfoSettingsStore.get(placementId)?.maxVisibleTasks).toBe(25);
    });

    it('preserves 100% G9 backward compatibility for legacy JSX ComponentSpecs with no language/ops fields', () => {
        const legacySpecs: ComponentSpec[] = [
            {
                name: 'AccountOverviewHeader',
                location: 'embedded',
                description: 'Legacy JSX header component',
                title: 'Account Header',
                type: 'report',
                code: 'function AccountOverviewHeader({ data }) { return <h1>{data.name}</h1>; }',
                functionalRequirements: 'Render account header',
                technicalDesign: 'Plain JSX',
                exampleUsage: '<AccountOverviewHeader />',
                dataRequirements: {
                    mode: 'views',
                    entities: [
                        {
                            name: 'Accounts',
                            displayFields: ['ID', 'Name'],
                            fieldMetadata: [],
                            permissionLevelNeeded: ['read'],
                        },
                    ],
                    queries: [],
                },
            },
            {
                name: 'RevenueByQuarterChart',
                location: 'registry',
                registry: 'MJ',
                namespace: 'analytics/finance',
                version: '1.2.0',
                description: 'Registry JSX chart component',
                title: 'Quarterly Revenue',
                type: 'chart',
                code: 'function RevenueByQuarterChart() { return <div />; }',
                functionalRequirements: 'Render quarterly chart',
                technicalDesign: 'Registry JSX component',
                exampleUsage: '<RevenueByQuarterChart />',
                dataRequirements: {
                    mode: 'queries',
                    entities: [],
                    queries: [
                        {
                            name: 'QuarterlyRevenue',
                            categoryPath: 'Finance',
                            fields: [],
                            entityNames: ['Invoices'],
                        },
                    ],
                },
                dependencies: [
                    {
                        name: 'LegendChild',
                        location: 'embedded',
                        description: 'Child legend',
                        title: 'Legend',
                        type: 'chart',
                        code: 'function LegendChild() { return <span />; }',
                        functionalRequirements: '',
                        technicalDesign: '',
                        exampleUsage: '<LegendChild />',
                    },
                ],
            },
        ];

        for (const legacy of legacySpecs) {
            expect(ResolveComponentLanguage(legacy)).toBe('jsx');
            expect(ValidateComponentLanguageSpec(legacy).valid).toBe(true);
            // Default-deny: omitted operations must resolve to empty allowlist
            expect(ResolveAllowedOperations(legacy.dataRequirements)).toEqual([]);
            expect(IsOperationAllowed(legacy.dataRequirements, 'Template.Run')).toBe(false);

            const hydrated = ComponentSpecRuntime.FromJSON(JSON.stringify(legacy));
            expect(hydrated.name).toBe(legacy.name);
            expect(BuildComponentCompleteCode(hydrated)).toContain(legacy.name);
        }
    });

    it('rejects wildcard and malformed operations allowlists across security boundaries', () => {
        const hostileRequirements: ComponentDataRequirements = {
            mode: 'views',
            entities: [],
            queries: [],
            operations: [
                { operationKey: '*' },
                { operationKey: 'RecordProcess.*' },
                { operationKey: '' },
            ],
        };

        const validation = ValidateOperationAllowlist(hostileRequirements.operations);
        expect(validation.valid).toBe(false);
        expect(validation.errors).toHaveLength(3);
        expect(ResolveAllowedOperations(hostileRequirements)).toEqual([]);
        expect(IsOperationAllowed(hostileRequirements, 'RecordProcess.GetRunStatus')).toBe(false);
    });

    it('validates unified UpdateHostAdapter snapshot sequence across Web, Mobile, and Desktop platforms', async () => {
        const platforms: Array<{ platform: 'web' | 'mobile' | 'desktop'; version: string }> = [
            { platform: 'web', version: '6.3.0' },
            { platform: 'mobile', version: '6.3.0' },
            { platform: 'desktop', version: '6.3.0' },
        ];

        for (const entry of platforms) {
            const history: UpdateStateSnapshot[] = [{ status: 'idle', currentVersion: entry.version, platform: entry.platform }];
            let current = history[0];

            const transitionTo = (next: UpdateStateSnapshot): void => {
                const res = ValidateUpdateTransition(current, next);
                expect(res.valid).toBe(true);
                current = next;
                history.push(next);
            };

            const adapter: UpdateHostAdapter = {
                platform: entry.platform,
                checkForUpdates: async () => {
                    transitionTo({ status: 'checking', currentVersion: entry.version, platform: entry.platform });
                    transitionTo({
                        status: 'downloading',
                        currentVersion: entry.version,
                        targetVersion: '6.3.2',
                        downloadProgress: 0,
                        platform: entry.platform,
                    });
                    transitionTo({
                        status: 'downloading',
                        currentVersion: entry.version,
                        targetVersion: '6.3.2',
                        downloadProgress: 100,
                        platform: entry.platform,
                    });
                    transitionTo({
                        status: 'ready-to-apply',
                        currentVersion: entry.version,
                        targetVersion: '6.3.2',
                        downloadProgress: 100,
                        releaseNotesUrl: 'https://releases.memberjunction.org/v6.3.2',
                        platform: entry.platform,
                    });
                    return current;
                },
                applyUpdate: async () => {
                    transitionTo({ status: 'idle', currentVersion: '6.3.2', platform: entry.platform });
                },
                subscribe: () => () => undefined,
            };

            expect(IsUpdateHostAdapter(adapter)).toBe(true);
            const checked = await adapter.checkForUpdates();
            expect(checked.status).toBe('ready-to-apply');
            await adapter.applyUpdate();
            expect(history[history.length - 1].currentVersion).toBe('6.3.2');
        }
    });
});
