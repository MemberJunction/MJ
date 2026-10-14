import { describe, it, expect, vi } from 'vitest';
import { BaseEntity, EntityInfo, UserInfo, type IEntityDataProvider } from '@memberjunction/core';
import type { MJTemplateContentEntity } from '@memberjunction/core-entities';

const { globalEngine, providerEngine, getProviderInstance } = vi.hoisted(() => {
    const content = (text: string) => ({ ID: `c-${text}`, TemplateText: text, __mj_UpdatedAt: new Date('2026-01-01') });
    const globalEngine = { FindRenderedContent: vi.fn(() => content('global')), Config: vi.fn() };
    const providerEngine = { FindRenderedContent: vi.fn(() => content('provider')), Config: vi.fn() };
    return { globalEngine, providerEngine, getProviderInstance: vi.fn(() => providerEngine) };
});
vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: { Instance: globalEngine, GetProviderInstance: getProviderInstance },
}));

import { LinkedTemplateText } from '../LinkedTemplateText';

/** A provider that names its connection; the statics read only `InstanceConnectionString`, so every data call fails loudly. */
class ConnectionNamedProvider implements IEntityDataProvider {
    constructor(public readonly InstanceConnectionString: string) {}
    public async Config(): Promise<boolean> { throw new Error('not used by these tests'); }
    public async Load(): Promise<{}> { throw new Error('not used by these tests'); }
    public async Save(): Promise<{}> { throw new Error('not used by these tests'); }
    public async Delete(): Promise<boolean> { throw new Error('not used by these tests'); }
    public async GetRecordChanges(): Promise<never[]> { throw new Error('not used by these tests'); }
}

/** A minimal concrete entity: the statics read only its provider and its context user. */
class ProviderBoundEntity extends BaseEntity {}

const TEST_ENTITY = new EntityInfo({ ID: 'entity-test', Name: 'Test Records', Fields: [] });
const USER = new UserInfo(undefined, { ID: 'u1' });

/** An entity bound to `provider` (or to no provider), acting as {@link USER}. */
function entityOn(provider: ConnectionNamedProvider | null): BaseEntity {
    const entity = new ProviderBoundEntity(TEST_ENTITY, provider);
    entity.ContextCurrentUser = USER;
    return entity;
}

describe('LinkedTemplateText: the template cache of the entity\'s own provider', () => {
    it('reads the provider\'s engine instance when the provider names its connection', () => {
        const provider = new ConnectionNamedProvider('mssql://host/db-a');
        const content: MJTemplateContentEntity | undefined = LinkedTemplateText.RenderedContent(entityOn(provider), 'T1');
        expect(getProviderInstance).toHaveBeenCalledWith(provider, expect.anything());
        expect(content?.TemplateText).toBe('provider');
        expect(globalEngine.FindRenderedContent).not.toHaveBeenCalled();
    });

    it('falls back to the process-wide engine for a provider without a connection key', () => {
        expect(LinkedTemplateText.RenderedContent(entityOn(null), 'T1')?.TemplateText).toBe('global');
    });

    it('answers undefined without a template ID', () => {
        expect(LinkedTemplateText.RenderedContent(entityOn(null), null)).toBeUndefined();
    });

    it('loads the provider\'s engine as the entity\'s user, through the entity\'s provider', async () => {
        const provider = new ConnectionNamedProvider('mssql://host/db-a');
        await LinkedTemplateText.EnsureLoaded(entityOn(provider));
        expect(providerEngine.Config).toHaveBeenCalledWith(false, USER, provider);
    });
});
