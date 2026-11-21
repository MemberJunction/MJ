import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Metadata } from '../generic/metadata';
import { AllMetadata, IMetadataProvider, ProviderConfigDataBase } from '../generic/interfaces';
import { AllMetadataArrays } from '../generic/providerBase';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

function freshConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], true);
}

function reuseGlobalConfig(): ProviderConfigDataBase {
    return new ProviderConfigDataBase({}, '__mj', [], [], false);
}

describe('Zero-copy ProviderBase.CreateSharedMetadataShell prototype delegation', () => {
    let previousGlobalProvider: IMetadataProvider;
    let globalProvider: TestMetadataProvider;

    beforeEach(async () => {
        previousGlobalProvider = Metadata.Provider;
        globalProvider = new TestMetadataProvider();
        await globalProvider.Config(freshConfig());
        Metadata.Provider = globalProvider;
    });

    afterEach(() => {
        Metadata.Provider = previousGlobalProvider;
    });

    test('delegates AllMetadata collections through Object.create prototype chain with zero array copies', async () => {
        const providerA = new TestMetadataProvider();
        const providerB = new TestMetadataProvider();
        await providerA.Config(reuseGlobalConfig());
        await providerB.Config(reuseGlobalConfig());

        expect(Object.getPrototypeOf(providerA.AllMetadata)).toBe(globalProvider.AllMetadata);
        expect(Object.getPrototypeOf(providerB.AllMetadata)).toBe(globalProvider.AllMetadata);

        // No own properties for metadata arrays on the shell
        for (const m of AllMetadataArrays) {
            expect(Object.prototype.hasOwnProperty.call(providerA.AllMetadata, m.key)).toBe(false);
            expect((providerA.AllMetadata as unknown as Record<string, unknown>)[m.key]).toBe(
                (globalProvider.AllMetadata as unknown as Record<string, unknown>)[m.key]
            );
        }
    });

    test('isolates CurrentUser as an own property on each shell instance', async () => {
        const providerA = new TestMetadataProvider();
        const providerB = new TestMetadataProvider();
        await providerA.Config(reuseGlobalConfig());
        await providerB.Config(reuseGlobalConfig());

        expect(Object.prototype.hasOwnProperty.call(providerA.AllMetadata, 'CurrentUser')).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(providerB.AllMetadata, 'CurrentUser')).toBe(true);
        expect(providerA.CurrentUser).toBeNull();
        expect(providerB.CurrentUser).toBeNull();

        const userA = new UserInfo();
        userA.ID = 'user-a';
        userA.Name = 'User A';

        const userB = new UserInfo();
        userB.ID = 'user-b';
        userB.Name = 'User B';

        providerA.AllMetadata.CurrentUser = userA;
        providerB.AllMetadata.CurrentUser = userB;

        expect(providerA.CurrentUser).toBe(userA);
        expect(providerB.CurrentUser).toBe(userB);
        expect(globalProvider.CurrentUser).not.toBe(userA);
        expect(globalProvider.CurrentUser).not.toBe(userB);
    });
});
