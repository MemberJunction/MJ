/**
 * Shared mock class for `PermissionProviderBase` used by every permission-provider
 * test file. Mirrors the four protected helpers the real base class carries
 * (`buildNormalizedPermission`, `boolsToActions`, `fetchRows`, `bulkLookupNames`)
 * so tests exercise real behavior rather than a trivial no-op stub.
 *
 * The class depends on a `RunView` constructor being provided at construction
 * time — the test file's vi.mock of `@memberjunction/core` owns the RunView
 * queue/call recorder and passes its own class in. That keeps per-test state
 * isolated across test files while the helper class stays share-safe.
 *
 * Usage inside a test file:
 * ```ts
 * import { buildPermissionProviderBase } from './_mockPermissionProviderBase';
 *
 * const runViewQueue: Array<...> = [];
 * const runViewCalls: Array<...> = [];
 * class MockRunView {
 *     async RunView(args) { runViewCalls.push(args); return runViewQueue.shift() ?? ... }
 * }
 *
 * vi.mock('@memberjunction/core', () => ({
 *     PermissionProviderBase: buildPermissionProviderBase(MockRunView),
 *     RunView: MockRunView,
 *     // … the rest of the mock …
 * }));
 * ```
 */

export type PermissionAction = 'Read' | 'Create' | 'Update' | 'Delete' | 'Share' | 'Execute' | 'Admin';

export interface MockRunViewLike {
    new (): {
        RunView: (args: {
            EntityName: string;
            ExtraFilter?: string;
            Fields?: string[];
            ResultType?: string;
            MaxRows?: number;
        }) => Promise<{ Success: boolean; Results: unknown[]; ErrorMessage?: string }>;
    };
}

/**
 * Build the concrete `PermissionProviderBase` stand-in class, bound to the
 * caller's mocked RunView constructor. Returns the class itself (not an
 * instance) — test code uses it exactly as they would the real
 * `PermissionProviderBase`: providers extend it, and tests instantiate them.
 */
export function buildPermissionProviderBase(RunViewCtor: MockRunViewLike) {
    abstract class MockPermissionProviderBase {
        readonly DomainName: string = '';

        async GetPermissionsGrantedByUser(): Promise<unknown[]> { return []; }
        async GetPermissionsSharedWithUser(): Promise<unknown[]> { return []; }
        GetResourceTypes(): string[] { return []; }

        protected buildNormalizedPermission(args: {
            resourceType: string;
            resourceId: string | null;
            resourceName?: string;
            granteeType: string;
            granteeId: string | null;
            granteeName?: string;
            actions: PermissionAction[];
            sourceRecordId?: string;
            expiresAt?: Date;
            effect?: 'Allow' | 'Deny';
        }) {
            return {
                DomainName: this.DomainName,
                ResourceType: args.resourceType,
                ResourceID: args.resourceId,
                ResourceName: args.resourceName,
                GranteeType: args.granteeType,
                GranteeID: args.granteeId,
                GranteeName: args.granteeName,
                Actions: args.actions,
                Effect: args.effect ?? 'Allow',
                SourceRecordID: args.sourceRecordId,
                ExpiresAt: args.expiresAt,
            };
        }

        protected boolsToActions(flags: Partial<Record<PermissionAction, boolean | null | undefined>>): PermissionAction[] {
            const order: PermissionAction[] = ['Read', 'Create', 'Update', 'Delete', 'Share', 'Execute', 'Admin'];
            const out: PermissionAction[] = [];
            for (const action of order) {
                if (flags[action]) out.push(action);
            }
            return out;
        }

        protected async fetchRows<T>(
            entityName: string,
            extraFilter: string,
            fields: string[],
            _methodName: string
        ): Promise<T[]> {
            const rv = new RunViewCtor();
            const result = await rv.RunView({
                EntityName: entityName,
                ExtraFilter: extraFilter,
                Fields: fields,
                ResultType: 'simple',
            });
            if (!result.Success) return [];
            return (result.Results as T[]) ?? [];
        }

        protected async bulkLookupNames(
            entityName: string,
            ids: string[],
            nameField = 'Name'
        ): Promise<Map<string, string>> {
            const map = new Map<string, string>();
            if (ids.length === 0) return map;
            const escaped = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(',');
            const rows = await this.fetchRows<{ ID: string } & Record<string, string | null>>(
                entityName,
                `ID IN (${escaped})`,
                ['ID', nameField],
                'bulkLookupNames'
            );
            for (const r of rows) {
                const name = r[nameField];
                if (name) map.set(r.ID, name);
            }
            return map;
        }
    }
    return MockPermissionProviderBase;
}
