import { describe, it, expect } from 'vitest';
import type { MJCredentialEntity } from '@memberjunction/core-entities';
import type { DomainAuthBinding } from '@memberjunction/computer-use';
import { MJComputerUseEngine } from '../engine/MJComputerUseEngine.js';
import { MJDomainAuthBinding } from '../types/mj-params.js';

/**
 * `resolveCredentialBinding` turns a credential-backed binding into a concrete auth method.
 * The credential's type label comes from a LEFT OUTER join in the base view, so it is null
 * when the credential type row is missing; that must fail with a clear error instead of
 * falling through the credential-type switch.
 */
type ResolveCredentialBinding = (binding: MJDomainAuthBinding) => Promise<DomainAuthBinding>;

function resolver(engine: MJComputerUseEngine): ResolveCredentialBinding {
    const fn = (engine as unknown as { resolveCredentialBinding: ResolveCredentialBinding }).resolveCredentialBinding;
    return fn.bind(engine);
}

function bindingWith(credentialType: string | null): MJDomainAuthBinding {
    const binding = new MJDomainAuthBinding();
    binding.Domains = ['example.test'];
    binding.Credential = {
        Name: 'Placeholder Credential',
        CredentialType: credentialType,
        Values: JSON.stringify({ apiKey: 'placeholder' })
    } as unknown as MJCredentialEntity;
    return binding;
}

describe('MJComputerUseEngine.resolveCredentialBinding', () => {
    it('throws a clear error when the credential has no credential type', async () => {
        const resolve = resolver(new MJComputerUseEngine());
        await expect(resolve(bindingWith(null))).rejects.toThrow(
            'Credential "Placeholder Credential" has no credential type'
        );
    });
});
