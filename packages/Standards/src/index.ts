/**
 * `@memberjunction/standards` — MemberJunction's engineering standards, as runnable checks.
 *
 * ## What this is for
 *
 * MJ's standards live in two forms. **Judgment standards** are prose that has to be read — the
 * guides in the MJ repo. **Executable standards** are the ones a machine can settle, and those are
 * here. Shipping them as a versioned package rather than a file to copy is what lets a dozen repos
 * — first-party, client, and external — stay aligned as the standards evolve.
 *
 * ## The property that makes it safe
 *
 * **A new standard never changes an existing repo's result.** A check is registered here as
 * *available*; it does not run until a repo's `.mj-standards.json` names it. Checks whose `Since`
 * postdates the repo's recorded `StandardsVersion` are reported as available and stay inert until
 * a human runs `mj standards adopt --upgrade`.
 *
 * That means this package can ship new standards continuously, and a repo pinned on an older MJ
 * never wakes up to a red build it did not ask for.
 *
 * ## Usage
 *
 * ```bash
 * mj standards adopt --ci github --declare-compliant   # scaffold a repo
 * mj standards check                                   # run what the repo adopted
 * mj standards list                                    # what exists, and what this repo uses
 * ```
 *
 * @module @memberjunction/standards
 */

export * from './types.js';
export * from './version.js';
export * from './config.js';
export * from './registry.js';
export * from './runner.js';
export * from './scaffold.js';
export * from './checks/ui-layers.js';
