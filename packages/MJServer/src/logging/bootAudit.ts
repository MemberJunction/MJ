import { getMetadataStorage } from 'type-graphql';
import { configInfo } from '../config.js';
import { HasNoLogParameter } from './NoLog.js';

// Delete is included alongside Create/Update so codegen DeleteMJ*Input resolvers count as
// metadata-bound and don't flood the audit with false positives (their args are PK + Options
// only — no encrypted values by construction). Must stay in sync with the redactor's
// INPUT_TYPE_REGEX in secretRedactor.ts. See docs/adr/0001-graphql-variables-logging-tiered-by-verbose.md.
const INPUT_TYPE_REGEX = /^(Create|Update|Delete).+Input$/;

/**
 * Structural shape of an `@Arg` parameter as seen from outside type-graphql's internals.
 * Used by the audit walker. Mirrors the subset of `ArgParamMetadata` we need.
 */
export type AuditArgParam = {
  kind: 'arg';  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  Index: number;
  name: string;  // case-violation-ok-legacy-back-compat: the old name is also read off a value typed `any`, where a rename would compile and silently return undefined
  Target: Function;
  MethodName: string;
  GetType: () => unknown;
};

/**
 * Structural shape of a resolver metadata entry from outside type-graphql's internals.
 * Includes `@Query`, `@Mutation`, `@Subscription` entries.
 */
export type AuditResolver = {
  Target: Function;
  MethodName: string;
  params?: ReadonlyArray<{ kind: string; Index: number } & Partial<AuditArgParam>>;  // case-violation-ok-legacy-back-compat: optional, and the old name is also read off a value the checker cannot type; renaming it stays assignable and silently yields undefined
};

/**
 * Scans every `@Query` / `@Mutation` / `@Subscription` for `@Arg`s that are neither
 * metadata-bound (input type matching `Create<X>Input` / `Update<X>Input`) nor `@NoLog`-marked.
 * Emits one warning per such arg.
 *
 * Gated on `loggingSettings.graphql.logVariables=true` — runs zero work in default config.
 * In verbose mode, the audit is a diagnostic for the operator who chose to turn on
 * variables logging, naming gaps that will leak plaintext while the flag is active.
 *
 * Never throws. Boot does not fail on a missed `@NoLog`.
 */
export function AuditResolversForUndecoratedArgs(): void {
  if (!configInfo.loggingSettings.graphql.logVariables) {
    return;
  }

  const storage = getMetadataStorage() as unknown as {
    queries: AuditResolver[];
    mutations: AuditResolver[];
    subscriptions: AuditResolver[];
  };
  AuditResolverList([
    ...storage.queries,
    ...storage.mutations,
    ...storage.subscriptions,
  ]);
}

/** @deprecated Use {@link AuditResolversForUndecoratedArgs}. */
export function auditResolversForUndecoratedArgs(): void {
  return AuditResolversForUndecoratedArgs();
}

/**
 * Internal helper exported for test injection. Takes a list of resolver metadata directly,
 * skipping the global `getMetadataStorage()` lookup. The boot-time scan uses this after
 * pulling from the global storage; tests pass in a synthetic fixture.
 */
export function AuditResolverList(resolvers: ReadonlyArray<AuditResolver>): void {
  for (const resolver of resolvers) {
    auditResolver(resolver);
  }
}

/** @deprecated Use {@link AuditResolverList}. */
export function auditResolverList(resolvers: ReadonlyArray<AuditResolver>): void {
  return AuditResolverList(resolvers);
}

function auditResolver(resolver: AuditResolver): void {
  for (const param of resolver.params ?? []) {
    if (param.kind !== 'arg') {
      continue;
    }
    auditArg(resolver, param as AuditArgParam);
  }
}

function auditArg(resolver: AuditResolver, argParam: AuditArgParam): void {
  const typeName = readArgTypeName(argParam);
  if (typeName && INPUT_TYPE_REGEX.test(typeName)) {
    return;
  }
  if (HasNoLogParameter(resolver.Target, resolver.MethodName, argParam.Index)) {
    return;
  }
  const resolverName = `${resolver.Target.name}.${resolver.MethodName}`;
  console.warn(
    `[mj:NoLog audit] Custom resolver ${resolverName} takes argument '${argParam.name}' ` +
    `(type ${typeName ?? 'unknown'}) which is not marked @NoLog. Verify this argument does ` +
    `not carry sensitive material; if it does, apply @NoLog. Variables for this resolver will ` +
    `be logged in plaintext while logVariables=true is active.`,
  );
}

/**
 * Reads the declared input type name from an `@Arg` parameter's `getType()` thunk.
 * Returns the class/scalar name when the thunk resolves to a class or named scalar; otherwise
 * returns `undefined` (e.g. for array literals or complex generics we don't unwrap).
 */
function readArgTypeName(argParam: AuditArgParam): string | undefined {
  try {
    const type = argParam.GetType();
    if (typeof type === 'function') {
      return (type as { name?: string }).name;
    }
    if (type && typeof type === 'object' && 'name' in type && typeof (type as { name: unknown }).name === 'string') {
      return (type as { name: string }).name;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
