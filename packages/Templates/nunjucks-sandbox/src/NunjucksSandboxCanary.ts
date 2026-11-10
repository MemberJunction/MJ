/**
 * @fileoverview A cheap check that the nunjucks sandbox is in effect.
 *
 * The sandbox works by replacing functions on the nunjucks module this package loads. It protects an
 * environment only when that environment was built from the same module instance. A second copy of
 * nunjucks in the process (two versions installed side by side, or a bundler that duplicated it)
 * has its own, unguarded functions. {@link AssertNunjucksSandboxIsEffective} renders templates that
 * try to reach the `Function` constructor and throws when one of them succeeds.
 * @module @memberjunction/nunjucks-sandbox
 */
import nunjucks from 'nunjucks';
import { TemplateSandboxError } from './TemplateSandboxError';

/** The two factors of the number an escaped probe computes. The product never appears in a probe's text. */
const PROBE_FACTORS: readonly [number, number] = [7, 191];

/** What a probe renders when its JavaScript ran. */
const PROBE_MARKER = String(PROBE_FACTORS[0] * PROBE_FACTORS[1]);

/** The JavaScript a probe tries to run. It has no effect beyond returning the marker. */
const PROBE_CODE = `return ${PROBE_FACTORS[0]}*${PROBE_FACTORS[1]}`;

/**
 * Templates that reach `Function` from a value every template has, each by a different route: a string
 * literal's constructor, a number literal's constructor, an array literal's method, and a built-in global.
 * Unguarded nunjucks renders the marker for each of them.
 */
const ESCAPE_PROBES: readonly string[] = [
    `{{ ''.constructor.constructor('${PROBE_CODE}')() }}`,
    `{{ (1).constructor.constructor('${PROBE_CODE}')() }}`,
    `{{ [].join.constructor('${PROBE_CODE}')() }}`,
    `{{ range.constructor('${PROBE_CODE}')() }}`,
];

/**
 * Throws a {@link TemplateSandboxError} when a template rendered by `env` can run JavaScript.
 *
 * Each probe is a sandbox escape that only computes a number. A guarded environment renders nothing for
 * it, or throws; either way the probe was blocked. Rendering the number means the environment is not
 * guarded, and the caller must not render a template it does not fully trust.
 *
 * @param env the environment to check. Omit it to check a new environment of the nunjucks module this
 *        package loads, which is what `HardenNunjucksRuntime` guards.
 */
export function AssertNunjucksSandboxIsEffective(env?: nunjucks.Environment): void {
    const target = env ?? new nunjucks.Environment(null, { autoescape: false });
    for (const probe of ESCAPE_PROBES) {
        if (probeEscapes(target, probe)) {
            throw new TemplateSandboxError(
                'The nunjucks sandbox is NOT in effect for this environment: a template reached the Function constructor. '
                + 'The environment was probably built from a second copy of the nunjucks module, or a guarded nunjucks function was replaced. '
                + 'Build environments with CreateSandboxedEnvironment() from @memberjunction/nunjucks-sandbox, '
                + 'and keep one version of nunjucks installed.',
            );
        }
    }
}

/** True when the probe's JavaScript ran. A probe that throws, or renders anything else, was blocked. */
function probeEscapes(env: nunjucks.Environment, probe: string): boolean {
    try {
        return String(env.renderString(probe, {})).includes(PROBE_MARKER);
    } catch {
        // A blocked probe throws (a TemplateSandboxError, or nunjucks' own "unable to call undefined").
        return false;
    }
}
