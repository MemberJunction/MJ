import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RunActionParams, ActionResultSimple } from '@memberjunction/actions-base';

vi.mock('@memberjunction/global', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/global');
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

/**
 * Capture the most recently-created entity instances per type so tests can
 * inspect what got written. Tests reset between cases via beforeEach.
 */
const { hoisted } = vi.hoisted(() => ({
    hoisted: {
        lastComponentEntity: null as MockEntity | null,
        lastOverrideEntity: null as MockEntity | null,
        provider: null as MockProvider | null,
        lintResult: { violations: [] } as unknown,
        lintShouldThrow: null as Error | null,
    },
}));

/**
 * Tiny BaseEntity-shaped mock. The action calls `NewRecord()` then sets a
 * series of typed setters then `Save()`. We capture every setter call so
 * tests can assert exact field values. `Save()` returns `saveOutcome`
 * which tests flip per-case to simulate persistence failures.
 */
class MockEntity {
    public NewRecordCalled = false;
    public Saved = false;
    public saveOutcome = true;
    public fields: Record<string, unknown> = {};
    public LatestResult = { CompleteMessage: 'mock error' };
    public ID = '00000000-0000-0000-0000-AAAAAAAAAAAA';

    constructor(public entityName: string) {}

    NewRecord(): void { this.NewRecordCalled = true; }
    async Save(): Promise<boolean> {
        this.Saved = this.saveOutcome;
        return this.saveOutcome;
    }

    // BaseEntity uses getters/setters generated for each field. The action
    // sets fields via `entity.Scope = 'User'` etc. — we intercept those via
    // a Proxy installed below so we don't have to enumerate field names.
}

function makeEntity(entityName: string): MockEntity {
    const target = new MockEntity(entityName);
    return new Proxy(target, {
        set(t, prop, value) {
            if (typeof prop === 'string' && !(prop in t)) {
                t.fields[prop] = value;
                return true;
            }
            (t as unknown as Record<string | symbol, unknown>)[prop] = value;
            return true;
        },
        get(t, prop) {
            if (typeof prop === 'string' && prop in t.fields) {
                return t.fields[prop];
            }
            return (t as unknown as Record<string | symbol, unknown>)[prop];
        },
    });
}

class MockProvider {
    public entitiesByName: Record<string, { ID: string; Name: string }> = {
        'mj: applications': { ID: 'ENT-APPS-0000', Name: 'MJ: Applications' },
        'customers': { ID: 'ENT-CUSTOMERS', Name: 'Customers' },
    };

    EntityByName(name: string) {
        return this.entitiesByName[name.toLowerCase()];
    }

    async GetEntityObject<T>(entityName: string, _user: unknown): Promise<T> {
        const entity = makeEntity(entityName);
        if (entityName === 'MJ: Components') {
            hoisted.lastComponentEntity = entity;
            entity.ID = 'COMPONENT-NEW-0001';
        } else if (entityName === 'MJ: Entity Form Overrides') {
            hoisted.lastOverrideEntity = entity;
            entity.ID = 'OVERRIDE-NEW-0001';
        }
        return entity as unknown as T;
    }
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    // The action only imports type aliases — `MJComponentEntity` and
    // `MJEntityFormOverrideEntity` — and instances come via `GetEntityObject`
    // which we proxy through MockProvider. Preserve all other exports so
    // other code paths importing this module (the Base layer, etc.) still
    // resolve their generated entity classes.
    const actual = await importOriginal<Record<string, unknown>>();
    return {
        ...actual,
        MJComponentEntity: actual.MJComponentEntity ?? class {},
        MJEntityFormOverrideEntity: actual.MJEntityFormOverrideEntity ?? class {},
    };
});

vi.mock('@memberjunction/interactive-component-types/forms', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/interactive-component-types/forms');
    return actual;
});

vi.mock('@memberjunction/react-linter', () => ({
    ComponentLinter: {
        async lintComponent() {
            if (hoisted.lintShouldThrow) throw hoisted.lintShouldThrow;
            return hoisted.lintResult;
        },
    },
}));

vi.mock('@memberjunction/core', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/core');
    return {
        ...actual,
        Metadata: { get Provider() { return hoisted.provider; } },
        LogError: vi.fn(),
    };
});

import { CreateInteractiveFormAction } from '../custom/interactive-forms/create-interactive-form.action';

function validSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        name: 'CompactApplicationForm',
        componentRole: 'form',
        location: 'embedded',
        code: 'function CompactApplicationForm({ record }) { return <div>{record.Name}</div>; }',
        description: 'Compact variant',
        ...overrides,
    };
}

function mkParams(opts: {
    EntityName?: unknown;
    Spec?: unknown;
    Name?: unknown;
    Description?: unknown;
    user?: { ID: string; Name?: string } | null;
}): RunActionParams {
    const params: { Name: string; Type: string; Value: unknown }[] = [];
    if ('EntityName' in opts) params.push({ Name: 'EntityName', Type: 'Input', Value: opts.EntityName });
    if ('Spec' in opts) params.push({ Name: 'Spec', Type: 'Input', Value: opts.Spec });
    if ('Name' in opts) params.push({ Name: 'Name', Type: 'Input', Value: opts.Name });
    if ('Description' in opts) params.push({ Name: 'Description', Type: 'Input', Value: opts.Description });
    return {
        Params: params,
        Provider: hoisted.provider,
        ContextUser: opts.user === undefined ? { ID: 'USER-CALLER-001', Name: 'Caller' } : opts.user,
    } as unknown as RunActionParams;
}

async function run(action: CreateInteractiveFormAction, params: RunActionParams): Promise<ActionResultSimple> {
    return await (action as unknown as { InternalRunAction: (p: RunActionParams) => Promise<ActionResultSimple> })
        .InternalRunAction(params);
}

describe('CreateInteractiveFormAction', () => {
    beforeEach(() => {
        hoisted.provider = new MockProvider();
        hoisted.lastComponentEntity = null;
        hoisted.lastOverrideEntity = null;
        hoisted.lintResult = { violations: [] };
        hoisted.lintShouldThrow = null;
    });

    describe('input validation', () => {
        it('returns MISSING_PARAMETER when EntityName is absent', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                Spec: validSpec(), Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER' });
        });

        it('returns MISSING_PARAMETER when Name is absent', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(),
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER' });
        });

        it('returns MISSING_PARAMETER when Spec is absent', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'MISSING_PARAMETER' });
        });

        it('accepts Spec as a JSON string', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: JSON.stringify(validSpec()),
                Name: 'Test',
            }));
            expect(result.Success).toBe(true);
        });

        it('LINT_FAILED when Spec is malformed JSON string', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: '{ not valid json',
                Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
        });

        it('ENTITY_NOT_FOUND when entity is not registered', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'NoSuchEntity',
                Spec: validSpec(),
                Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'ENTITY_NOT_FOUND' });
        });

        it('NO_USER when ContextUser is absent', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: validSpec(),
                Name: 'Test',
                user: null,
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'NO_USER' });
        });
    });

    describe('linter gate', () => {
        it('LINT_FAILED when componentRole is not "form"', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: validSpec({ componentRole: 'dashboard' }),
                Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
            expect(result.Message).toMatch(/componentRole='form'/);
        });

        it('LINT_FAILED when componentRole is missing', async () => {
            const spec = validSpec();
            delete spec.componentRole;
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: spec, Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
        });

        it('LINT_FAILED when spec.code is empty', async () => {
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: validSpec({ code: '   ' }),
                Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
            expect(result.Message).toMatch(/non-empty JSX/);
        });

        it('LINT_FAILED when spec.location is unset', async () => {
            const spec = validSpec();
            delete spec.location;
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: spec, Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
        });

        it('LINT_FAILED when ComponentLinter returns critical violations', async () => {
            hoisted.lintResult = {
                violations: [
                    { severity: 'critical', rule: 'no-import', message: 'imports forbidden', line: 1 },
                ],
            };
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
            expect(result.Message).toMatch(/critical/);
            expect(result.Message).toMatch(/line 1/);
        });

        it('ignores low-severity ComponentLinter warnings', async () => {
            hoisted.lintResult = {
                violations: [
                    { severity: 'low', rule: 'style', message: 'use double quotes' },
                    { severity: 'medium', rule: 'naming', message: 'use camelCase' },
                ],
            };
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'Test',
            }));
            expect(result.Success).toBe(true);
        });

        it('LINT_FAILED when ComponentLinter throws', async () => {
            hoisted.lintShouldThrow = new Error('parser crashed');
            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'Test',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'LINT_FAILED' });
            expect(result.Message).toMatch(/parser crashed/);
        });
    });

    describe('successful persistence', () => {
        it('writes Component with Type=Form, Status=Published, stringified Spec', async () => {
            await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: validSpec({ title: 'Compact Apps' }),
                Name: 'Compact Application Form',
                Description: 'CSR variant',
            }));

            const comp = hoisted.lastComponentEntity!;
            expect(comp.NewRecordCalled).toBe(true);
            expect(comp.Saved).toBe(true);
            expect(comp.fields.Name).toBe('CompactApplicationForm');
            expect(comp.fields.Type).toBe('Form');
            expect(comp.fields.Status).toBe('Published');
            expect(comp.fields.Title).toBe('Compact Apps');
            expect(comp.fields.Description).toBe('CSR variant');
            expect(typeof comp.fields.Specification).toBe('string');
            const reparsed = JSON.parse(comp.fields.Specification as string);
            expect(reparsed.componentRole).toBe('form');
        });

        it('writes Override at Scope=User, Status=Active, UserID=caller, Priority=0', async () => {
            await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications',
                Spec: validSpec(),
                Name: 'CSR Form',
            }));

            const ovr = hoisted.lastOverrideEntity!;
            expect(ovr.NewRecordCalled).toBe(true);
            expect(ovr.Saved).toBe(true);
            expect(ovr.fields.Scope).toBe('User');
            expect(ovr.fields.UserID).toBe('USER-CALLER-001');
            expect(ovr.fields.RoleID).toBeNull();
            expect(ovr.fields.Status).toBe('Active');
            expect(ovr.fields.Priority).toBe(0);
            expect(ovr.fields.EntityID).toBe('ENT-APPS-0000');
            expect(ovr.fields.ComponentID).toBe('COMPONENT-NEW-0001');
            expect(ovr.fields.Name).toBe('CSR Form');
        });

        it('returns SUCCESS with both IDs in Message and output params', async () => {
            const params = mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'Test',
            });
            const result = await run(new CreateInteractiveFormAction(), params);
            expect(result).toMatchObject({ Success: true, ResultCode: 'SUCCESS' });
            const payload = JSON.parse(result.Message!);
            expect(payload.ComponentID).toBe('COMPONENT-NEW-0001');
            expect(payload.OverrideID).toBe('OVERRIDE-NEW-0001');
            expect(payload.Scope).toBe('User');

            const componentOutput = params.Params.find(p => p.Name === 'ComponentID');
            const overrideOutput = params.Params.find(p => p.Name === 'OverrideID');
            expect(componentOutput?.Value).toBe('COMPONENT-NEW-0001');
            expect(overrideOutput?.Value).toBe('OVERRIDE-NEW-0001');
        });
    });

    describe('security: scope clamp', () => {
        // The plan calls out this assertion explicitly. The action's
        // contract is: scope is always clamped to User regardless of any
        // caller-supplied parameter. There is no `Scope` input param at
        // all — but if a malicious or confused caller tries to sneak one
        // in via an extra param, the action ignores it.
        it('writes Scope=User even when caller passes Scope=Global as an extra param', async () => {
            const params = mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'Sneaky',
            });
            // Inject the rogue param the malicious caller might add.
            params.Params.push({ Name: 'Scope', Type: 'Input', Value: 'Global' });
            params.Params.push({ Name: 'UserID', Type: 'Input', Value: 'OTHER-USER-666' });
            params.Params.push({ Name: 'RoleID', Type: 'Input', Value: 'ROLE-ADMIN' });

            const result = await run(new CreateInteractiveFormAction(), params);
            expect(result.Success).toBe(true);

            const ovr = hoisted.lastOverrideEntity!;
            expect(ovr.fields.Scope).toBe('User');
            expect(ovr.fields.UserID).toBe('USER-CALLER-001'); // from ContextUser, NOT the param
            expect(ovr.fields.RoleID).toBeNull();
        });

        it('UserID always comes from ContextUser, never from spec', async () => {
            const spec = validSpec({ UserID: 'SPEC-INJECTED-USER' });
            await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: spec, Name: 'X',
            }));
            const ovr = hoisted.lastOverrideEntity!;
            expect(ovr.fields.UserID).toBe('USER-CALLER-001');
        });
    });

    describe('atomicity', () => {
        it('PERSIST_FAILED when Component save fails — override is never attempted', async () => {
            // Patch GetEntityObject to return a Component that refuses to save.
            const original = hoisted.provider!.GetEntityObject.bind(hoisted.provider);
            hoisted.provider!.GetEntityObject = (async <T>(entityName: string, user: unknown): Promise<T> => {
                const entity = await original<MockEntity>(entityName, user);
                if (entityName === 'MJ: Components') {
                    entity.saveOutcome = false;
                    entity.LatestResult = { CompleteMessage: 'check constraint X failed' };
                }
                return entity as unknown as T;
            }) as never;

            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'X',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'PERSIST_FAILED' });
            expect(result.Message).toMatch(/Component insert failed/);
            expect(result.Message).toMatch(/check constraint X failed/);
            expect(hoisted.lastOverrideEntity).toBeNull();
        });

        it('PERSIST_FAILED with orphan-disclosure when Override save fails', async () => {
            const original = hoisted.provider!.GetEntityObject.bind(hoisted.provider);
            hoisted.provider!.GetEntityObject = (async <T>(entityName: string, user: unknown): Promise<T> => {
                const entity = await original<MockEntity>(entityName, user);
                if (entityName === 'MJ: Entity Form Overrides') {
                    entity.saveOutcome = false;
                    entity.LatestResult = { CompleteMessage: 'FK violation' };
                }
                return entity as unknown as T;
            }) as never;

            const result = await run(new CreateInteractiveFormAction(), mkParams({
                EntityName: 'MJ: Applications', Spec: validSpec(), Name: 'X',
            }));
            expect(result).toMatchObject({ Success: false, ResultCode: 'PERSIST_FAILED' });
            // Caller needs to know the Component is already in the table.
            expect(result.Message).toMatch(/Component COMPONENT-NEW-0001/);
            expect(result.Message).toMatch(/no override yet/);
        });
    });
});
