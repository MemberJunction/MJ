/**
 * Pure file-content transforms used when assembling a MemberJunction distribution
 * tree from a source checkout.
 *
 * Ported from the legacy root `CreateMJDistribution.js` so the assembled layout is
 * byte-compatible with the bootstrap zip it replaces. Every function here is pure
 * (string in → string out) so it is trivially unit-tested without any filesystem
 * or network access. The side-effectful enumeration/copy logic lives in
 * {@link DistributionAssembler}.
 *
 * @module distribution/transforms
 */

/** A parsed JSON object whose value types are not known ahead of time. */
type JsonObject = Record<string, unknown>;

/** Monorepo-only tsconfig path aliases that must be dropped from the Angular distribution. */
const ANGULAR_PATH_ALIASES_TO_REMOVE: readonly string[] = ['@memberjunction/ng-bootstrap'];

/** True when `value` is a non-null, non-array object (a plain JSON object). */
function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strip `//` line comments and block comments from JSON-with-comments
 * (tsconfig.json style) while preserving string contents verbatim.
 */
export function stripJsonComments(jsonString: string): string {
  let result = '';
  let i = 0;
  const len = jsonString.length;

  while (i < len) {
    if (jsonString[i] === '"') {
      result += jsonString[i++]; // opening quote
      while (i < len && jsonString[i] !== '"') {
        if (jsonString[i] === '\\' && i + 1 < len) {
          result += jsonString[i++]; // backslash
          result += jsonString[i++]; // escaped char
        } else {
          result += jsonString[i++];
        }
      }
      if (i < len) result += jsonString[i++]; // closing quote
    } else if (jsonString[i] === '/' && jsonString[i + 1] === '/') {
      while (i < len && jsonString[i] !== '\n') i++;
    } else if (jsonString[i] === '/' && jsonString[i + 1] === '*') {
      i += 2;
      while (i < len && !(jsonString[i] === '*' && jsonString[i + 1] === '/')) i++;
      i += 2;
    } else {
      result += jsonString[i++];
    }
  }

  return result;
}

/** Parse JSON that may contain comments (tsconfig.json style). */
export function parseJsonc(content: string): JsonObject {
  const parsed: unknown = JSON.parse(stripJsonComments(content));
  if (!isPlainObject(parsed)) {
    throw new Error('Expected a JSON object at the top level');
  }
  return parsed;
}

/**
 * Deep-merge `source` onto `base`. Plain objects are merged recursively; every
 * other value (including arrays) from `source` replaces the one in `base`.
 */
export function deepMerge(base: JsonObject, source: JsonObject): JsonObject {
  const result: JsonObject = { ...base };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const baseValue = result[key];
    if (isPlainObject(sourceValue) && isPlainObject(baseValue)) {
      result[key] = deepMerge(baseValue, sourceValue);
    } else {
      result[key] = sourceValue;
    }
  }
  return result;
}

/**
 * Flatten a package `tsconfig.json` by inlining its `extends` base config and
 * dropping the `extends` key, so the distribution has no root-config dependency.
 *
 * @param packageTsconfig - Raw contents of the package's `tsconfig.json` (may have comments).
 * @param baseTsconfig - Raw contents of the base config it `extends` (may have comments).
 */
export function flattenTsconfig(packageTsconfig: string, baseTsconfig: string): JsonObject {
  const pkg = parseJsonc(packageTsconfig);
  const base = parseJsonc(baseTsconfig);
  delete pkg.extends;
  return deepMerge(base, pkg);
}

/**
 * Transform a server-package `tsconfig.json` (MJAPI, GeneratedEntities,
 * GeneratedActions): flatten the `extends` base, then drop monorepo-only
 * `../../node_modules` excludes that don't exist in a distribution.
 *
 * @returns Pretty-printed JSON (2-space indent).
 */
export function transformServerTsconfig(packageTsconfig: string, baseTsconfig: string): string {
  const merged = flattenTsconfig(packageTsconfig, baseTsconfig);
  const exclude = merged.exclude;
  if (Array.isArray(exclude)) {
    merged.exclude = exclude.filter(
      (entry): entry is string => typeof entry === 'string' && !entry.includes('../../node_modules')
    );
  }
  return JSON.stringify(merged, null, 2);
}

/**
 * Transform the MJExplorer `tsconfig.json`: flatten the `extends` base, then
 * remove monorepo-only path aliases that point at local workspace packages
 * (those come from npm in a distribution).
 *
 * @returns Pretty-printed JSON (2-space indent).
 */
export function transformAngularTsconfig(packageTsconfig: string, baseTsconfig: string): string {
  const merged = flattenTsconfig(packageTsconfig, baseTsconfig);
  const compilerOptions = merged.compilerOptions;
  if (isPlainObject(compilerOptions) && isPlainObject(compilerOptions.paths)) {
    const paths = compilerOptions.paths;
    for (const alias of ANGULAR_PATH_ALIASES_TO_REMOVE) {
      delete paths[alias];
    }
    if (Object.keys(paths).length === 0) {
      delete compilerOptions.paths;
    }
  }
  return JSON.stringify(merged, null, 2);
}

/**
 * Remove `&& tsc-alias ...` from every `package.json` build script. Server
 * distribution packages don't use path aliases and `tsc-alias` is only a
 * monorepo-root devDependency.
 *
 * @returns Pretty-printed JSON (2-space indent).
 */
export function stripTscAliasFromPackageJson(packageJson: string): string {
  const pkg = JSON.parse(packageJson) as JsonObject;
  const scripts = pkg.scripts;
  if (isPlainObject(scripts)) {
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command === 'string' && command.includes('tsc-alias')) {
        scripts[name] = command.replace(/\s*&&\s*tsc-alias\b[^&]*/g, '').trim();
      }
    }
  }
  return JSON.stringify(pkg, null, 2);
}

/**
 * Remove `--port NNNN` flags from every `package.json` script. The monorepo uses
 * non-default ports (e.g. 4201) to avoid conflicts; a distribution should use the
 * framework defaults.
 *
 * @returns Pretty-printed JSON (2-space indent).
 */
export function removePortFlagsFromPackageJson(packageJson: string): string {
  const pkg = JSON.parse(packageJson) as JsonObject;
  const scripts = pkg.scripts;
  if (isPlainObject(scripts)) {
    for (const [name, command] of Object.entries(scripts)) {
      if (typeof command === 'string' && command.includes('--port')) {
        scripts[name] = command.replace(/\s*--port[=\s]+\d+/g, '');
      }
    }
  }
  return JSON.stringify(pkg, null, 2);
}
