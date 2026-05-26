/**
 * Locks the boundary-log payload contract that `context.ts` depends on. The wiring in
 * `context.ts` is a one-line call to this function; if its contract holds, the wiring is
 * correct by construction. Tests run as a pure-function suite — no need to boot the heavy
 * context-module dependency chain (auth providers, SQL Server provider, etc.).
 *
 * The load-bearing security property is asserted last: a serialized form of every produced
 * payload must NOT contain any literal value from the variables payload, in either flag state.
 */
import { describe, it, expect } from 'vitest';
import { buildBoundaryLogPayload } from '../logging/structuralShape.js';

describe('buildBoundaryLogPayload', () => {
  describe('flag off (default config)', () => {
    it('returns operationName only when logVariables=false', () => {
      const result = buildBoundaryLogPayload(
        'CreateMJCredential',
        { input: { Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' } },
        false,
      );
      expect(result).toEqual({ operationName: 'CreateMJCredential' });
      expect(result).not.toHaveProperty('variables');
    });

    it('returns operationName only even when variables are undefined', () => {
      const result = buildBoundaryLogPayload('SomeQuery', undefined, false);
      expect(result).toEqual({ operationName: 'SomeQuery' });
    });

    it('preserves undefined operationName', () => {
      const result = buildBoundaryLogPayload(undefined, { x: 'secret' }, false);
      expect(result).toEqual({ operationName: undefined });
      expect(result).not.toHaveProperty('variables');
    });
  });

  describe('flag on (verbose debug)', () => {
    it('returns operationName plus structure-only variables when logVariables=true', () => {
      const result = buildBoundaryLogPayload(
        'CreateMJCredential',
        { input: { ID: 'abc-123', Name: 'HubSpot', Values: 'FAKE_SECRET_VALUE_DO_NOT_USE' } },
        true,
      );
      expect(result).toEqual({
        operationName: 'CreateMJCredential',
        variables: {
          input: {
            ID: '<string>',
            Name: '<string>',
            Values: '<string>',
          },
        },
      });
    });

    it('handles undefined variables payload (e.g. variables-less query)', () => {
      const result = buildBoundaryLogPayload('IntrospectionQuery', undefined, true);
      expect(result).toEqual({ operationName: 'IntrospectionQuery', variables: undefined });
    });

    it('handles null variables payload', () => {
      const result = buildBoundaryLogPayload('SomeQuery', null, true);
      expect(result).toEqual({ operationName: 'SomeQuery', variables: null });
    });

    it('preserves array length in structural echo', () => {
      const result = buildBoundaryLogPayload(
        'GetData',
        { input: { Token: 'TOKEN', Queries: ['SELECT * FROM Foo', 'SELECT * FROM Bar'] } },
        true,
      );
      expect(result.variables).toEqual({
        input: { Token: '<string>', Queries: ['<string>', '<string>'] },
      });
    });

    it('labels Date instances in the variables payload', () => {
      const result = buildBoundaryLogPayload(
        'UpdateRecord',
        { input: { ID: 'x', UpdatedAt: new Date('2026-01-01') } },
        true,
      );
      expect(result.variables).toEqual({
        input: { ID: '<string>', UpdatedAt: '<Date>' },
      });
    });
  });

  describe('security property — no input value reaches the output, in either flag state', () => {
    const secretValues = [
      'FAKE_SECRET_VALUE_DO_NOT_USE',
      'HubSpot Production',
      'abc-123-def-456',
      'sk-1234567890abcdef',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
    ];
    const sensitivePayload = {
      input: {
        ID: 'abc-123-def-456',
        Name: 'HubSpot Production',
        Description: 'CRM credentials for the production HubSpot portal',
        Values: 'FAKE_SECRET_VALUE_DO_NOT_USE',
        ApiKey: 'sk-1234567890abcdef',
        Token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      },
    };

    it('does not leak any secret value when logVariables=false', () => {
      const result = buildBoundaryLogPayload('CreateMJCredential', sensitivePayload, false);
      const serialized = JSON.stringify(result);
      for (const secret of secretValues) {
        expect(serialized, `flag=false leaked: ${secret}`).not.toContain(secret);
      }
    });

    it('does not leak any secret value when logVariables=true', () => {
      const result = buildBoundaryLogPayload('CreateMJCredential', sensitivePayload, true);
      const serialized = JSON.stringify(result);
      for (const secret of secretValues) {
        expect(serialized, `flag=true leaked: ${secret}`).not.toContain(secret);
      }
    });

    it('does not leak nested-blob values when logVariables=true', () => {
      // GraphQL clients sometimes pass JSON-blob-shaped values inside fields.
      // The redactor should NOT walk into these and accidentally surface inner values.
      const blobPayload = {
        input: {
          Config: { apiKey: 'NESTED_SECRET_KEY', host: 'api.example.com' },
        },
      };
      const result = buildBoundaryLogPayload('SetConfig', blobPayload, true);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain('NESTED_SECRET_KEY');
      expect(serialized).not.toContain('api.example.com');
    });
  });
});
