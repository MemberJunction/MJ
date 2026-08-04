import { describe, it, expect } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { redactArg } from '../logging/secretRedactor.js';

type EncryptedField = { Name: string };
type FakeEntity = { ClassName: string; EncryptedFields: EncryptedField[] };

function makeProvider(entities: FakeEntity[]): IMetadataProvider {
  return {
    Entities: entities,
  } as unknown as IMetadataProvider;
}

describe('redactArg', () => {
  const credentialEntity: FakeEntity = {
    ClassName: 'MJCredential',
    EncryptedFields: [{ Name: 'Values' }],
  };
  const userEntity: FakeEntity = {
    ClassName: 'User',
    EncryptedFields: [],
  };

  it('returns "<redacted>" when noLogParameter is set, regardless of other inputs', () => {
    const result = redactArg({
      inputTypeName: 'CreateMJCredentialInput',
      rawValue: { Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: true,
      noLogFields: new Set(),
    });
    expect(result).toBe('<redacted>');
  });

  it('returns "<metadata-not-ready>" when the provider has no entities (bootstrap window)', () => {
    const result = redactArg({
      inputTypeName: 'CreateMJCredentialInput',
      rawValue: { Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' },
      provider: makeProvider([]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toBe('<metadata-not-ready>');
  });

  it('fails open (passes through) when input type does not match Create/Update<X>Input regex', () => {
    const result = redactArg({
      inputTypeName: 'SomeCustomArgs',
      rawValue: { accessToken: 'FAKE_TOKEN' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual('{"accessToken":"FAKE_TOKEN"}');
  });

  it('fails open when input type matches regex but no entity is found', () => {
    const result = redactArg({
      inputTypeName: 'CreateUnknownEntityInput',
      rawValue: { Foo: 'bar' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual('{"Foo":"bar"}');
  });

  it('redacts top-level keys matching EntityFieldInfo.Encrypt=true on entity-bound CRUD inputs', () => {
    const result = redactArg({
      inputTypeName: 'CreateMJCredentialInput',
      rawValue: { ID: 'abc-123', Name: 'HubSpot', Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual({
      ID: 'abc-123',
      Name: 'HubSpot',
      Values: '<redacted>',
    });
  });

  it('redacts top-level keys in noLogFields even when EncryptedFields does not include them', () => {
    const result = redactArg({
      inputTypeName: 'CreateUserInput',
      rawValue: { Name: 'Alice', SecretToken: 'oops' },
      provider: makeProvider([userEntity]),
      noLogParameter: false,
      noLogFields: new Set(['SecretToken']),
    });
    expect(result).toEqual({
      Name: 'Alice',
      SecretToken: '<redacted>',
    });
  });

  it('Update<X>Input is also handled (not just Create<X>Input)', () => {
    const result = redactArg({
      inputTypeName: 'UpdateMJCredentialInput',
      rawValue: { ID: 'abc-123', Values: 'NEW_FAKE_SECRET' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual({
      ID: 'abc-123',
      Values: '<redacted>',
    });
  });

  it('Delete<X>Input resolves to its entity and walks keys (PK only — no encrypted values to redact)', () => {
    // Delete is matched by the regex (alongside Create/Update) so the boot audit treats DeleteMJ*
    // resolvers as metadata-bound instead of flooding with false positives. Security is identical:
    // delete inputs carry PK + Options only — no encrypted field, so nothing is redacted, the keys
    // just pass through. See docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md.
    const result = redactArg({
      inputTypeName: 'DeleteMJCredentialInput',
      rawValue: { ID: 'abc-123' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual({ ID: 'abc-123' });
  });

  it('Delete<X>Input never exposes an encrypted value even if one were somehow present', () => {
    // Defense-in-depth: even if a delete input carried an encrypted field name, it must still mask.
    const result = redactArg({
      inputTypeName: 'DeleteMJCredentialInput',
      rawValue: { ID: 'abc-123', Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toEqual({ ID: 'abc-123', Values: '<redacted>' });
  });

  it('only walks TOP-level keys — nested objects with encrypted-field names are not recursed', () => {
    const result = redactArg({
      inputTypeName: 'CreateMJCredentialInput',
      rawValue: {
        Name: 'HubSpot',
        Nested: { Values: 'NESTED_FAKE_SECRET' },
      },
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    // Top-level `Values` would be redacted; nested `Values` is not.
    expect((result as Record<string, unknown>).Nested).toEqual('{"Values":"NESTED_FAKE_SECRET"}');
  });

  it('passes non-object raw values through to shortenForLog', () => {
    const result = redactArg({
      inputTypeName: 'CreateMJCredentialInput',
      rawValue: 'plain-string',
      provider: makeProvider([credentialEntity]),
      noLogParameter: false,
      noLogFields: new Set(),
    });
    expect(result).toBe('plain-string');
  });
});
