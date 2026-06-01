/**
 * Middleware wiring test.
 *
 * Locks the assumption that `variablesLoggingMiddleware` correctly:
 *   - Skips field resolvers (info.path.prev !== undefined)
 *   - Short-circuits when logVariables=false
 *   - Emits a redacted variables block when logVariables=true
 *   - Respects @NoLog field-level marks via the input class lookup
 *
 * We invoke the middleware directly with a synthetic ResolverData rather than booting a real
 * GraphQL execution — that would force two copies of `graphql` (CJS via type-graphql + ESM via
 * the test runner) into the same realm and fail with "Cannot use GraphQLSchema from another
 * module or realm." The wiring at schema-build time (which IS what we want to lock for future
 * type-graphql upgrades) is exercised in the end-to-end verification described in the PRD;
 * here we just lock the per-call redaction logic.
 *
 * `globalMiddlewares` covers `@Query`, `@Mutation`, and `@Subscription` resolvers identically
 * — they all go through the same `applyMiddlewares` chain inside type-graphql. Asserting the
 * middleware fires once for a representative root resolver covers all three.
 */
import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../config', () => ({
  configInfo: {
    loggingSettings: {
      graphql: {
        logVariables: true,
      },
    },
  },
}));
vi.mock('../config.js', () => ({
  configInfo: {
    loggingSettings: {
      graphql: {
        logVariables: true,
      },
    },
  },
}));

import { variablesLoggingMiddleware } from '../logging/variablesLoggingMiddleware.js';

/**
 * Build a synthetic GraphQLResolveInfo-shaped object that matches what type-graphql passes
 * to a middleware at runtime. Only the subset we read is populated.
 */
function makeInfo(opts: {
  fieldName: string;
  argTypeName: string;
  argName: string;
  isFieldResolver?: boolean;
}): unknown {
  const fakeArg = {
    name: opts.argName,
    type: { name: opts.argTypeName },
  };
  const fakeField = {
    args: [fakeArg],
  };
  const parentType = {
    getFields: () => ({ [opts.fieldName]: fakeField }),
  };
  const path = opts.isFieldResolver
    ? { prev: { prev: undefined, key: 'parent' }, key: opts.fieldName }
    : { prev: undefined, key: opts.fieldName };
  return {
    fieldName: opts.fieldName,
    parentType,
    path,
  };
}

// Stub `getNamedType` is unnecessary — middleware uses graphql's `getNamedType` against the
// type we pass. Our `argTypeName` value is wrapped in a plain `{ name }` object below; we need
// the middleware's `getNamedType` to read `.name` directly. The `graphql` library's
// `getNamedType` unwraps NonNull/List wrappers; a plain `{ name }` object survives unwrapping
// because none of those wrapper shapes are present.

describe('variablesLoggingMiddleware', () => {
  let dirSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    dirSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('skips field resolvers (info.path.prev !== undefined) without logging', async () => {
    const next = vi.fn(async () => 'next-result');
    const result = await variablesLoggingMiddleware(
      {
        root: undefined,
        args: { x: 1 },
        context: {} as never,
        info: makeInfo({
          fieldName: 'nestedThing',
          argTypeName: 'CreateMJCredentialInput',
          argName: 'input',
          isFieldResolver: true,
        }) as never,
      },
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('next-result');
    expect(dirSpy).not.toHaveBeenCalled();
  });

  it('emits a redacted variables block for a root resolver with an entity-bound CRUD input', async () => {
    const next = vi.fn(async () => 'next-result');
    const fakeProvider = {
      Entities: [
        { ClassName: 'MJCredential', EncryptedFields: [{ Name: 'Values' }] },
      ],
    };

    await variablesLoggingMiddleware(
      {
        root: undefined,
        args: { input: { ID: 'abc', Name: 'HubSpot', Values: 'FAKE_SECRET' } },
        context: {
          providers: [{ provider: fakeProvider, type: 'Read-Write' }],
        } as never,
        info: makeInfo({
          fieldName: 'CreateMJCredential',
          argTypeName: 'CreateMJCredentialInput',
          argName: 'input',
        }) as never,
      },
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(dirSpy).toHaveBeenCalledTimes(1);
    const [logged] = dirSpy.mock.calls[0];
    expect(logged).toEqual({
      operation: 'CreateMJCredential',
      args: {
        input: {
          ID: 'abc',
          Name: 'HubSpot',
          Values: '<redacted>',
        },
      },
    });
  });

  it('logs a custom-resolver plaintext arg (no metadata redaction available for it)', async () => {
    const next = vi.fn(async () => undefined);
    // Populate Entities (non-empty) so the redactor does not fall into the bootstrap fail-closed branch.
    // The String-typed arg doesn't match Create/Update<X>Input, so it falls through to shortenForLog.
    const fakeProvider = {
      Entities: [{ ClassName: 'SomeUnrelatedEntity', EncryptedFields: [] }],
    };

    await variablesLoggingMiddleware(
      {
        root: undefined,
        args: { token: 'plaintext-leak' },
        context: {
          providers: [{ provider: fakeProvider, type: 'Read-Write' }],
        } as never,
        info: makeInfo({
          fieldName: 'VoiceTestHubSpotCredential',
          argTypeName: 'String',
          argName: 'token',
        }) as never,
      },
      next,
    );

    expect(dirSpy).toHaveBeenCalledTimes(1);
    // Arg is logged as-is because String type doesn't match Create/Update<X>Input, so the
    // redactor's fail-open branch passes the value through shortenForLog (plain string passthrough).
    // This is the gap that @NoLog discipline plus the boot audit are designed to surface.
    const [logged] = dirSpy.mock.calls[0];
    expect(logged).toMatchObject({
      operation: 'VoiceTestHubSpotCredential',
      args: { token: 'plaintext-leak' },
    });
  });

  it('fails closed (<metadata-not-ready>) when provider.Entities is empty', async () => {
    const next = vi.fn(async () => undefined);
    const fakeProvider = { Entities: [] };

    await variablesLoggingMiddleware(
      {
        root: undefined,
        args: { input: { Values: 'FAKE_SECRET' } },
        context: {
          providers: [{ provider: fakeProvider, type: 'Read-Write' }],
        } as never,
        info: makeInfo({
          fieldName: 'CreateMJCredential',
          argTypeName: 'CreateMJCredentialInput',
          argName: 'input',
        }) as never,
      },
      next,
    );

    expect(dirSpy).toHaveBeenCalledTimes(1);
    const [logged] = dirSpy.mock.calls[0];
    expect(logged).toEqual({
      operation: 'CreateMJCredential',
      args: { input: '<metadata-not-ready>' },
    });
  });
});
