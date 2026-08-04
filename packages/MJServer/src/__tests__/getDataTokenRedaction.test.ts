import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { IMetadataProvider } from '@memberjunction/core';
import { redactArg } from '../logging/secretRedactor.js';
import { NoLog, getNoLogFields } from '../logging/NoLog.js';

/**
 * Test 4 (unit form): the `@NoLog`-decorated `Token` field on GetDataInputType is redacted
 * from verbose logs, while the non-sensitive `Queries` field passes through.
 *
 * GetData is @RequireSystemUser (system-user-only), so this is verified at the redactor level
 * rather than via a live request. It exercises the field-level @NoLog path: the middleware
 * collects @NoLog field names via getNoLogFields() and passes them to redactArg as noLogFields.
 *
 * GetDataInputType is NOT a Create/Update/Delete*Input, so it fails the entity-binding regex and
 * would otherwise pass through whole — the @NoLog field set is the ONLY thing protecting Token here.
 * That's exactly the case @NoLog exists for: sensitive args metadata cannot identify.
 */
describe('Test 4: GetData Token redaction via field-level @NoLog', () => {
  // Mirror the real GetDataInputType shape and apply @NoLog to Token at field level, as the source does.
  class GetDataInputType {
    Token = '';
    Queries: string[] = [];
  }
  NoLog(GetDataInputType.prototype, 'Token');

  const provider = { Entities: [] } as unknown as IMetadataProvider;

  it('getNoLogFields picks up the Token field mark', () => {
    const fields = getNoLogFields(GetDataInputType);
    expect(fields.has('Token')).toBe(true);
    expect(fields.has('Queries')).toBe(false);
  });

  it('masks field-level @NoLog Token on a NON-entity-bound input (the real GetData case)', () => {
    // GetDataInput does NOT match Create/Update/Delete*Input. This is the exact case @NoLog exists
    // for: a custom resolver input metadata cannot identify. The redactor must still honor the
    // field-level @NoLog set and mask Token, while passing the non-sensitive Queries through.
    const providerWithEntities = {
      Entities: [{ ClassName: 'Something', EncryptedFields: [] }],
    } as unknown as IMetadataProvider;

    const result = redactArg({
      inputTypeName: 'GetDataInput', // not entity-bound — regex won't match
      rawValue: { Token: 'FAKE_SYSTEM_TOKEN_DO_NOT_USE', Queries: ['SELECT 1', 'SELECT 2'] },
      provider: providerWithEntities,
      noLogParameter: false,
      noLogFields: getNoLogFields(GetDataInputType),
    });

    expect(result).toEqual({ Token: '<redacted>', Queries: ['SELECT 1', 'SELECT 2'] });
    expect(JSON.stringify(result)).not.toContain('FAKE_SYSTEM_TOKEN_DO_NOT_USE');
  });

  it('redactArg masks Token field-by-field when input IS entity-bound (noLogFields wins over metadata)', () => {
    // When the input type maps to an entity, redactArg walks top-level keys and applies noLogFields.
    const providerWithEntity = {
      Entities: [{ ClassName: 'GetDataThing', EncryptedFields: [] }],
    } as unknown as IMetadataProvider;

    const result = redactArg({
      inputTypeName: 'CreateGetDataThingInput',
      rawValue: { Token: 'FAKE_SYSTEM_TOKEN_DO_NOT_USE', Queries: ['SELECT 1'] },
      provider: providerWithEntity,
      noLogParameter: false,
      noLogFields: new Set(['Token']),
    });

    expect(result).toEqual({ Token: '<redacted>', Queries: ['SELECT 1'] });
    expect(JSON.stringify(result)).not.toContain('FAKE_SYSTEM_TOKEN_DO_NOT_USE');
  });

  it('parameter-level @NoLog masks the entire arg regardless of shape', () => {
    // If Token were a top-level @Arg with @NoLog (parameter form), noLogParameter=true masks it whole.
    const result = redactArg({
      inputTypeName: 'String',
      rawValue: 'FAKE_SYSTEM_TOKEN_DO_NOT_USE',
      provider,
      noLogParameter: true,
      noLogFields: new Set(),
    });
    expect(result).toBe('<redacted>');
  });
});
