import type { MiddlewareFn } from 'type-graphql';
import { getMetadataStorage } from 'type-graphql';
import { getNamedType } from 'graphql';
import type { GraphQLArgument } from 'graphql';
import { configInfo } from '../config.js';
import type { AppContext } from '../types.js';
import { redactArg } from './secretRedactor.js';
import { hasNoLogParameter, getNoLogFields } from './NoLog.js';
import { StartupLogger } from './StartupLogger.js';

/**
 * Memoized "is the server log level `debug`?" check. The per-resolver
 * variables echo is gated behind BOTH `logVariables` (opt-in redaction path)
 * AND `level === 'debug'` — it is a raw, constantly-on debug line, so it should
 * never fire unless an operator explicitly opted into debug verbosity. Config
 * is immutable post-boot, so caching the resolution is safe.
 */
let isDebugLevelCache: boolean | undefined;
function isDebugLogLevel(): boolean {
  if (isDebugLevelCache === undefined) {
    isDebugLevelCache = StartupLogger.resolveLevelFromConfig() === 'debug';
  }
  return isDebugLevelCache;
}

/**
 * Structural shape of a type-graphql `@Arg` parameter metadata entry. Mirrors the
 * subset of `ArgParamMetadata` we read (`kind`, `index`, `name`, `target`, `methodName`)
 * without depending on type-graphql's internal type exports (which are not part of its
 * public API).
 */
type MinimalArgParamMeta = {
  kind: 'arg';
  index: number;
  name: string;
  target: Function;
  methodName: string;
};

type MinimalParamMeta = MinimalArgParamMeta | { kind: 'args' | 'context' | 'root' | 'info' | 'pubSub' | 'custom'; index: number };

type MinimalResolverMeta = {
  schemaName: string;
  target: Function;
  methodName: string;
  params?: MinimalParamMeta[];
};

type ResolverEntry = {
  target: Function;
  methodName: string;
  params: ReadonlyArray<MinimalParamMeta>;
};

let resolverLookup: Map<string, ResolverEntry> | undefined;

function getResolverLookup(): Map<string, ResolverEntry> {
  if (resolverLookup !== undefined) {
    return resolverLookup;
  }
  const storage = getMetadataStorage() as unknown as {
    queries: MinimalResolverMeta[];
    mutations: MinimalResolverMeta[];
    subscriptions: MinimalResolverMeta[];
    inputTypes: Array<{ name: string; target: Function }>;
  };
  const lookup = new Map<string, ResolverEntry>();
  const collect = (entries: ReadonlyArray<MinimalResolverMeta>): void => {
    for (const entry of entries) {
      lookup.set(entry.schemaName, {
        target: entry.target,
        methodName: entry.methodName,
        params: entry.params ?? [],
      });
    }
  };
  collect(storage.queries);
  collect(storage.mutations);
  collect(storage.subscriptions);
  resolverLookup = lookup;
  return lookup;
}

function findInputClass(typeName: string): Function | undefined {
  const storage = getMetadataStorage() as unknown as { inputTypes: Array<{ name: string; target: Function }> };
  const found = storage.inputTypes.find((t) => t.name === typeName);
  return found?.target;
}

/** Type guard for `MinimalArgParamMeta`. */
function isArgParam(p: MinimalParamMeta): p is MinimalArgParamMeta {
  return p.kind === 'arg';
}

const warnedResolverSignatures = new Set<string>();

/**
 * Variables-logging middleware. Default-off; gated on `loggingSettings.graphql.logVariables`.
 *
 * NOTE: this middleware is NOT the primary leak defense. The primary defense is the removal
 * of the `variables` field from the always-on log line in `context.ts`. This middleware
 * provides an opt-in, redacted verbose-echo path for developers debugging locally.
 *
 * When enabled, fires once per root resolver call (skips field resolvers via
 * `info.path.prev === undefined`). For each `@Arg`:
 *   - Derives the GraphQL input type name from the schema (NOT from `args[i].constructor.name`,
 *     because type-graphql v2.0.0-beta.3 passes raw plain-object args to middleware).
 *   - Looks up `@NoLog` marks (parameter-level on the resolver, field-level on the input class).
 *   - Delegates redaction to `redactArg`.
 *
 * Emits a single `console.dir` line with shape `{ operation, args }`. Note: the key names
 * differ from the always-on log line (`operationName` vs `operation`, `variables` vs `args`)
 * — operators with log-grep automation should update their patterns.
 */
export const variablesLoggingMiddleware: MiddlewareFn<AppContext> = async (action, next) => {
  // Field resolvers (info.path.prev !== undefined) are skipped — only root @Query/@Mutation/@Subscription.
  if (action.info.path.prev !== undefined) {
    return next();
  }

  // Hot-path zero-cost short-circuit when the flag is off.
  if (!configInfo.loggingSettings.graphql.logVariables) {
    return next();
  }

  const provider = action.context.providers?.[0]?.provider;
  if (!provider) {
    return next();
  }

  const fieldDef = action.info.parentType.getFields()[action.info.fieldName];
  if (!fieldDef) {
    return next();
  }

  const resolverEntry = getResolverLookup().get(action.info.fieldName);
  const argParams: ReadonlyArray<MinimalArgParamMeta> = (resolverEntry?.params ?? []).filter(isArgParam);

  const redactedArgs: Record<string, unknown> = {};
  let hasUndecoratedCustomArg = false;
  for (const argDef of fieldDef.args as ReadonlyArray<GraphQLArgument>) {
    const inputTypeName = getNamedType(argDef.type).name;
    const rawValue = action.args[argDef.name];

    const paramMeta = argParams.find((p) => p.name === argDef.name);
    const noLogParameter = paramMeta && resolverEntry
      ? hasNoLogParameter(resolverEntry.target, resolverEntry.methodName, paramMeta.index)
      : false;

    const inputClass = findInputClass(inputTypeName);
    const noLogFields = inputClass ? getNoLogFields(inputClass) : new Set<string>();

    redactedArgs[argDef.name] = redactArg({
      inputTypeName,
      rawValue,
      provider,
      noLogParameter,
      noLogFields,
    });

    if (!noLogParameter && isCustomArg(inputTypeName, noLogFields, provider)) {
      hasUndecoratedCustomArg = true;
    }
  }

  // Raw per-resolver variables echo — gated to debug-only so it never streams
  // constantly even when an operator turns on logVariables at a lower level.
  if (isDebugLogLevel()) {
    // eslint-disable-next-line no-console
    console.dir(
      { operation: action.info.fieldName, args: redactedArgs },
      { depth: null, breakLength: 200 },
    );
  }

  if (hasUndecoratedCustomArg && resolverEntry) {
    const signature = `${resolverEntry.target.name}.${resolverEntry.methodName}`;
    if (!warnedResolverSignatures.has(signature)) {
      warnedResolverSignatures.add(signature);
      console.warn(
        `[mj:NoLog] Resolver ${signature} has un-decorated, non-metadata-bound argument(s). ` +
        `Variables for this resolver were logged in plaintext while logVariables=true is active. ` +
        `Apply @NoLog to sensitive arguments to suppress this.`,
      );
    }
  }

  return next();
};

/**
 * Heuristic: an arg is "custom" (i.e. needs `@NoLog` discipline because metadata can't redact it)
 * when its GraphQL input type is not a known `Create<X>Input` / `Update<X>Input` for an entity
 * in the provider, AND no field-level `@NoLog` marks are present on the input class.
 */
function isCustomArg(
  inputTypeName: string,
  noLogFields: ReadonlySet<string>,
  provider: { Entities: ReadonlyArray<{ ClassName: string }> },
): boolean {
  if (noLogFields.size > 0) {
    return false;
  }
  const match = /^(Create|Update)(?<name>.+)Input$/.exec(inputTypeName);
  if (!match || !match.groups?.name) {
    return true;
  }
  const className = match.groups.name;
  const found = provider.Entities.find((e) => e.ClassName === className);
  return !found;
}
