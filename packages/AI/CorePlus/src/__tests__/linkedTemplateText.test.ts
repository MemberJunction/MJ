import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, IMetadataProvider } from '@memberjunction/core';
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

/** An entity double carrying the provider it saves through; the statics read only ProviderToUse and ContextCurrentUser. */
function entityOn(provider: Pick<IMetadataProvider, 'InstanceConnectionString'> | undefined): BaseEntity {
    const double = { ProviderToUse: provider, ContextCurrentUser: { ID: 'u1' } };
    // a partial double of a class with many required members
    return double as unknown as BaseEntity;
}

describe('LinkedTemplateText: the template cache of the entity\'s own provider', () => {
    it('reads the provider\'s engine instance when the provider names its connection', () => {
        const provider = { InstanceConnectionString: 'mssql://host/db-a' };
        const content: MJTemplateContentEntity | undefined = LinkedTemplateText.RenderedContent(entityOn(provider), 'T1');
        expect(getProviderInstance).toHaveBeenCalledWith(provider, expect.anything());
        expect(content?.TemplateText).toBe('provider');
        expect(globalEngine.FindRenderedContent).not.toHaveBeenCalled();
    });

    it('falls back to the process-wide engine for a provider without a connection key', () => {
        expect(LinkedTemplateText.RenderedContent(entityOn(undefined), 'T1')?.TemplateText).toBe('global');
    });

    it('answers undefined without a template ID', () => {
        expect(LinkedTemplateText.RenderedContent(entityOn(undefined), null)).toBeUndefined();
    });

    it('loads the provider\'s engine as the entity\'s user, through the entity\'s provider', async () => {
        const provider = { InstanceConnectionString: 'mssql://host/db-a' };
        await LinkedTemplateText.EnsureLoaded(entityOn(provider));
        expect(providerEngine.Config).toHaveBeenCalledWith(false, { ID: 'u1' }, provider);
    });
});
