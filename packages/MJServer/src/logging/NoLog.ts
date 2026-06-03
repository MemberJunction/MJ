import 'reflect-metadata';

/**
 * Reflect-metadata key for `@NoLog` marks. A single symbol covers both parameter-level
 * marks (stored against `(target, propertyKey)` pairs) and field-level marks (stored
 * against the input class prototype).
 */
const NO_LOG_PARAM_KEY = Symbol('mj:NoLog:param');
const NO_LOG_FIELD_KEY = Symbol('mj:NoLog:field');

/**
 * `@NoLog` — marks a resolver argument or input-type field as never-loggable.
 *
 * Two modes, distinguished by decorator arity at runtime:
 *
 *   **Parameter** — applied to an `@Arg(...)` parameter on a resolver method:
 *   ```ts
 *   @Mutation(() => Boolean)
 *   async VoiceTestHubSpotCredential(
 *     @Arg('accessToken') @NoLog accessToken: string,
 *     @Ctx() ctx: AppContext,
 *   ): Promise<boolean> { ... }
 *   ```
 *
 *   **Property** — applied to a `@Field()` on an `@InputType` class:
 *   ```ts
 *   @InputType()
 *   export class GetDataInputType {
 *     @Field(() => String) @NoLog Token: string;
 *     @Field(() => [String]) Queries: string[];
 *   }
 *   ```
 *
 * The variables-logging middleware reads these marks at runtime via
 * `hasNoLogParameter` / `getNoLogFields` and replaces the marked value (or whole arg)
 * with `"<redacted>"` before emitting the variables block. Metadata-covered fields
 * (entity columns with `EntityFieldInfo.Encrypt=true`) do not need `@NoLog` — applying
 * it is harmless but redundant. Use `@NoLog` for arguments that the redactor cannot
 * identify via metadata: custom-resolver parameters, MCP tool args, fields on input
 * types that don't map to a known entity.
 */
export function NoLog(target: object, propertyKey?: string | symbol, parameterIndex?: number): void {
  // Parameter-decorator path: (target, propertyKey, parameterIndex)
  if (typeof parameterIndex === 'number' && propertyKey !== undefined) {
    const existing = (Reflect.getOwnMetadata(NO_LOG_PARAM_KEY, target, propertyKey) as Set<number> | undefined) ?? new Set<number>();
    existing.add(parameterIndex);
    Reflect.defineMetadata(NO_LOG_PARAM_KEY, existing, target, propertyKey);
    return;
  }

  // Property-decorator path: (target, propertyKey)
  if (propertyKey !== undefined) {
    const existing = (Reflect.getOwnMetadata(NO_LOG_FIELD_KEY, target) as Set<string> | undefined) ?? new Set<string>();
    existing.add(String(propertyKey));
    Reflect.defineMetadata(NO_LOG_FIELD_KEY, existing, target);
    return;
  }
}

/**
 * Returns true if `@NoLog` was applied to `methodName`'s argument at `parameterIndex`
 * on the given resolver class prototype. False otherwise.
 *
 * Pass the resolver class itself (e.g. `MyResolver`) — the function reads from the
 * prototype internally to match how type-graphql stores resolver metadata.
 */
export function hasNoLogParameter(
  resolverClass: Function,
  methodName: string,
  parameterIndex: number,
): boolean {
  const target = resolverClass.prototype as object;
  const marks = Reflect.getMetadata(NO_LOG_PARAM_KEY, target, methodName) as Set<number> | undefined;
  return marks !== undefined && marks.has(parameterIndex);
}

/**
 * Returns the set of field names decorated `@NoLog` on the given input class. Empty set
 * if none were marked.
 *
 * Pass the input class itself (e.g. `GetDataInputType`) — the function reads from the
 * prototype internally.
 */
export function getNoLogFields(inputTypeClass: Function): ReadonlySet<string> {
  const target = inputTypeClass.prototype as object;
  const marks = Reflect.getMetadata(NO_LOG_FIELD_KEY, target) as Set<string> | undefined;
  return marks ?? new Set<string>();
}
