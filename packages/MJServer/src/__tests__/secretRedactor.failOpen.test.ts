import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { redactArg, resetUnboundCrudInputWarnings } from '../logging/secretRedactor.js';

/**
 * `redactArg` binds a GraphQL input type to an entity by NAME:
 *
 * ```ts
 * const match = /^(Create|Update|Delete)(?<name>.+)Input$/.exec(inputTypeName);
 * const entity = provider.Entities.find((e) => e.ClassName === match.groups.name);
 * ```
 *
 * Codegen inputs embed the entity ClassName (`CreateMJCredentialInput` → `MJCredential`)
 * so the lookup succeeds. Hand-written resolver inputs do not (`CreateConnectionInput`
 * → `Connection`, which is no entity), so the lookup fails, no encrypted-field names
 * are contributed, and the arg falls through to `shortenForLog` with values intact.
 *
 * The boot audit tests only the NAME pattern, so it classifies these as metadata-bound
 * and stays silent — the reason the gap went unnoticed. These tests pin both the
 * fail-open behaviour and the warning that now surfaces it.
 */

const SECRET = 'sk-live-CREDENTIAL-PAYLOAD';

/** Minimal provider exposing one entity with one encrypted column. */
function providerWith(entities: { ClassName: string; EncryptedFields: { Name: string }[] }[]): IMetadataProvider {
    return { Entities: entities } as unknown as IMetadataProvider;
}

const CREDENTIAL_ENTITY = providerWith([
    { ClassName: 'MJCredential', EncryptedFields: [{ Name: 'Values' }] },
]);

beforeEach(() => {
    resetUnboundCrudInputWarnings();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('redactArg — entity-bound inputs (the codegen case)', () => {
    it('redacts an encrypted column, keeping the rest', () => {
        const out = redactArg({
            inputTypeName: 'CreateMJCredentialInput',
            rawValue: { Name: 'Stripe', Values: SECRET },
            provider: CREDENTIAL_ENTITY,
            noLogParameter: false,
            noLogFields: new Set(),
        }) as Record<string, unknown>;

        expect(out.Values).toBe('<redacted>');
        expect(out.Name).toBe('Stripe');
    });

    it('emits no warning, because the binding resolved', () => {
        redactArg({
            inputTypeName: 'CreateMJCredentialInput',
            rawValue: { Values: SECRET },
            provider: CREDENTIAL_ENTITY,
            noLogParameter: false,
            noLogFields: new Set(),
        });
        expect(console.warn).not.toHaveBeenCalled();
    });
});

describe('redactArg — name matches the convention but no entity exists', () => {
    const unbound = {
        inputTypeName: 'CreateConnectionInput',
        rawValue: { CredentialName: 'acme', CredentialValues: SECRET },
        provider: CREDENTIAL_ENTITY,
        noLogParameter: false,
        noLogFields: new Set<string>(),
    };

    it('falls open — values are logged, which is the defect being surfaced', () => {
        const out = redactArg({ ...unbound });
        // Documents current behaviour: no entity binding and no @NoLog means no
        // redaction source, so the value survives into the log.
        expect(JSON.stringify(out)).toContain(SECRET);
    });

    it('now warns, naming the input type and what to do about it', () => {
        redactArg({ ...unbound });

        expect(console.warn).toHaveBeenCalledTimes(1);
        const message = vi.mocked(console.warn).mock.calls[0][0] as string;
        expect(message).toContain('CreateConnectionInput');
        expect(message).toContain('@NoLog');
        // The warning itself must not become a second leak.
        expect(message).not.toContain(SECRET);
    });

    it('warns only once per input type, however hot the mutation is', () => {
        redactArg({ ...unbound });
        redactArg({ ...unbound });
        redactArg({ ...unbound });
        expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('warns separately for a different unbound input type', () => {
        redactArg({ ...unbound });
        redactArg({ ...unbound, inputTypeName: 'CreateScheduleInput' });
        expect(console.warn).toHaveBeenCalledTimes(2);
    });
});

describe('redactArg — @NoLog closes the gap the metadata cannot', () => {
    it('redacts a marked field on an input with no entity binding', () => {
        const out = redactArg({
            inputTypeName: 'CreateConnectionInput',
            rawValue: { CredentialName: 'acme', CredentialValues: SECRET },
            provider: CREDENTIAL_ENTITY,
            noLogParameter: false,
            noLogFields: new Set(['CredentialValues']),
        }) as Record<string, unknown>;

        expect(out.CredentialValues).toBe('<redacted>');
        expect(out.CredentialName).toBe('acme');
        expect(JSON.stringify(out)).not.toContain(SECRET);
    });

    it('a parameter-level mark redacts the whole arg regardless of binding', () => {
        const out = redactArg({
            inputTypeName: 'CreateConnectionInput',
            rawValue: { CredentialValues: SECRET },
            provider: CREDENTIAL_ENTITY,
            noLogParameter: true,
            noLogFields: new Set(),
        });
        expect(out).toBe('<redacted>');
    });
});
