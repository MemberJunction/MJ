/**
 * The over-the-wire FLS fixture refuses an entity that already has field security enabled, so it
 * never mutates a configured entity. The client reloads metadata on a timer, so the flag it holds
 * can be out of date: the guard must decide from metadata refreshed before it reads the flag.
 */
import { describe, it, expect } from 'vitest';
import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';
import { SEEDED_FLS_ENTITY } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { SetupFlsClientFixture, FlsClientFixtureSkipText } from '../checks/fls-client.checks';

/** A client provider whose cached flag is `stale` until Refresh() runs, and `fresh` after. */
function providerWithFlag(stale: boolean, fresh: boolean): { Provider: IMetadataProvider; Refreshes: () => number } {
    let refreshes = 0;
    const fake: Pick<IMetadataProvider, 'EntityByName' | 'Refresh'> = {
        EntityByName: (name: string) => (name === SEEDED_FLS_ENTITY
            ? ({ ID: 'E1', Name: name, EnableFieldLevelSecurity: refreshes > 0 ? fresh : stale } as EntityInfo)
            : undefined),
        Refresh: async () => { refreshes++; return true; },
    };
    return { Provider: fake as IMetadataProvider, Refreshes: () => refreshes };
}

/** Runs Setup; anything past the guard needs a live server and fails here, which is fine. */
async function runSetup(provider: IMetadataProvider): Promise<IntegrationCheckContext> {
    const ctx = { Provider: provider } as IntegrationCheckContext;
    await SetupFlsClientFixture(ctx).catch(() => undefined);
    return ctx;
}

describe('SetupFlsClientFixture guard', () => {
    it('refreshes metadata before reading the flag', async () => {
        const fake = providerWithFlag(true, false);
        await runSetup(fake.Provider);
        expect(fake.Refreshes()).toBe(1);
    });

    it('proceeds when a stale cache still says the flag is on but the refreshed metadata says off', async () => {
        const ctx = await runSetup(providerWithFlag(true, false).Provider);
        expect(ctx.FlsClientFixture?.Reason ?? '').not.toMatch(/field-level security/);
    });

    it('refuses when the refreshed metadata says the entity really has field security configured', async () => {
        const ctx = await runSetup(providerWithFlag(false, true).Provider);
        expect(ctx.FlsClientFixture?.Usable).toBe(false);
        expect(ctx.FlsClientFixture?.Reason).toMatch(/really has field-level security configured/);
    });
});

describe('FlsClientFixtureSkipText', () => {
    it('says the entity is configured, without a seeding remedy, when that is why the fixture refused', async () => {
        const ctx = await runSetup(providerWithFlag(true, true).Provider);
        const text = FlsClientFixtureSkipText(ctx.FlsClientFixture);
        expect(text).toMatch(/really has field-level security configured/);
        expect(text).not.toMatch(/sync push|start MJAPI/);
    });

    it('points at seeding and MJAPI when the fixture is missing', () => {
        expect(FlsClientFixtureSkipText(undefined)).toMatch(/sync push.*start MJAPI/);
    });
});
