/**
 * @fileoverview The one way MemberJunction code builds a nunjucks environment.
 * @module @memberjunction/nunjucks-sandbox
 */
import nunjucks from 'nunjucks';
import { HardenNunjucksRuntime } from './NunjucksSandbox';
import { AssertNunjucksSandboxIsEffective } from './NunjucksSandboxCanary';

/**
 * Builds a nunjucks environment that is guarded by the sandbox, whatever was loaded before and in whatever order.
 *
 * Use this instead of `new nunjucks.Environment(...)`. It does three things a bare constructor does not:
 * - it guards nunjucks first (`HardenNunjucksRuntime`), so the caller does not rely on another package having done so;
 * - it builds the environment from the nunjucks module this package loads, which is the one the guard
 *   covers, even if the caller's own `import nunjucks` resolved to a different copy;
 * - it checks the new environment with `AssertNunjucksSandboxIsEffective` and throws if a template can still run JavaScript.
 *
 * @param loader the template loader or loaders, or `null` for an environment that only renders strings
 * @param options the nunjucks environment options (`autoescape`, `throwOnUndefined`, ...)
 * @throws TemplateSandboxError when the sandbox is not in effect for the new environment
 */
export function CreateSandboxedEnvironment(
    loader?: nunjucks.ILoaderAny | nunjucks.ILoaderAny[] | null,
    options?: nunjucks.ConfigureOptions,
): nunjucks.Environment {
    HardenNunjucksRuntime();
    const env = new nunjucks.Environment(loader, options);
    AssertNunjucksSandboxIsEffective(env);
    return env;
}
