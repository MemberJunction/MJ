import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Short-circuits config.ts's loadConfig() so this file loads in any environment, not just one
// with DB env vars set. bootAudit.ts imports `configInfo` at module-init; without this mock,
// `loadConfig()` runs and throws "Configuration validation failed" on a clean machine or in
// sandboxed CI. The audit tests below call `auditResolverList` directly and don't read
// `logVariables`, but the import chain still pulls in `configInfo`. Mirrors the same shim in
// subscriptionRedaction.test.ts.
vi.mock('../config', () => ({
  configInfo: {
    loggingSettings: { graphql: { logVariables: true } },
  },
}));
vi.mock('../config.js', () => ({
  configInfo: {
    loggingSettings: { graphql: { logVariables: true } },
  },
}));

import { auditResolverList } from '../logging/bootAudit.js';
import type { AuditArgParam, AuditResolver } from '../logging/bootAudit.js';
import { NoLog } from '../logging/NoLog.js';

// --------------------------------------------------------------------------
// Synthetic fixture types & helpers
// --------------------------------------------------------------------------

class CreateMJCredentialInput {}
class CustomSecretInput {}

function makeArgParam(opts: {
  target: Function;
  methodName: string;
  index: number;
  name: string;
  type: Function;
}): AuditArgParam {
  return {
    target: opts.target,
    methodName: opts.methodName,
    index: opts.index,
    kind: 'arg',
    name: opts.name,
    getType: () => opts.type,
  };
}

function makeResolver(opts: {
  target: Function;
  methodName: string;
  params: AuditArgParam[];
}): AuditResolver {
  return {
    target: opts.target,
    methodName: opts.methodName,
    params: opts.params,
  };
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

describe('auditResolverList', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('does NOT warn for an @Arg whose type matches Create<X>Input', () => {
    class SafeCrudResolver {
      doCreate(_input: CreateMJCredentialInput): void {
        // body
      }
    }
    const resolver = makeResolver({
      target: SafeCrudResolver,
      methodName: 'doCreate',
      params: [
        makeArgParam({
          target: SafeCrudResolver,
          methodName: 'doCreate',
          index: 0,
          name: 'input',
          type: CreateMJCredentialInput,
        }),
      ],
    });

    auditResolverList([resolver]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('WARNS for an @Arg of a custom type without @NoLog', () => {
    class CustomNoMarkResolver {
      doCustom(_input: CustomSecretInput): void {
        // body
      }
    }
    const resolver = makeResolver({
      target: CustomNoMarkResolver,
      methodName: 'doCustom',
      params: [
        makeArgParam({
          target: CustomNoMarkResolver,
          methodName: 'doCustom',
          index: 0,
          name: 'input',
          type: CustomSecretInput,
        }),
      ],
    });

    auditResolverList([resolver]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(typeof message).toBe('string');
    expect(message).toContain('CustomNoMarkResolver.doCustom');
    expect(message).toContain("'input'");
    expect(message).toContain('CustomSecretInput');
  });

  it('does NOT warn for an @Arg of a custom type marked @NoLog at parameter level', () => {
    class CustomMarkedResolver {
      doCustom(_input: CustomSecretInput): void {
        // body
      }
    }
    NoLog(CustomMarkedResolver.prototype, 'doCustom', 0);

    const resolver = makeResolver({
      target: CustomMarkedResolver,
      methodName: 'doCustom',
      params: [
        makeArgParam({
          target: CustomMarkedResolver,
          methodName: 'doCustom',
          index: 0,
          name: 'input',
          type: CustomSecretInput,
        }),
      ],
    });

    auditResolverList([resolver]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('mixed resolver: warns for the un-decorated custom arg but not the metadata-bound one', () => {
    class MixedResolver {
      doMixed(_safe: CreateMJCredentialInput, _custom: CustomSecretInput): void {
        // body
      }
    }
    const resolver = makeResolver({
      target: MixedResolver,
      methodName: 'doMixed',
      params: [
        makeArgParam({
          target: MixedResolver,
          methodName: 'doMixed',
          index: 0,
          name: 'safe',
          type: CreateMJCredentialInput,
        }),
        makeArgParam({
          target: MixedResolver,
          methodName: 'doMixed',
          index: 1,
          name: 'custom',
          type: CustomSecretInput,
        }),
      ],
    });

    auditResolverList([resolver]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = warnSpy.mock.calls[0][0];
    expect(message).toContain("'custom'");
    expect(message).not.toContain("'safe'");
  });
});
