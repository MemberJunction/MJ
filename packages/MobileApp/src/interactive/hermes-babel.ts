/**
 * @fileoverview Babel settings the interactive-component compiler needs under Hermes.
 *
 * Its own module so the transform can be tested directly, without dragging the runtime loader —
 * and therefore React Native — into a unit test.
 */

/**
 * Babel settings this host needs on top of the runtime's defaults.
 *
 * ## Why `async` has to be transpiled away here and nowhere else
 *
 * Components are compiled at runtime and executed through `new Function`. Hermes compiles bytecode
 * ahead of time for the app's own modules — where `async`/`await` is fully supported — but code
 * handed to `Function` goes through its *runtime* compiler, which rejects async functions outright:
 * `async functions are unsupported`. A component doing `const rows = await utilities.rv.RunView(…)`
 * — which is how essentially every data-backed component loads — therefore failed to compile with
 * an error that named neither the cause nor a remedy.
 *
 * The browser has no such limit, so this is not a change to the runtime's defaults; it is one host
 * declaring what its JavaScript engine can accept. The two plugins run in order: async becomes a
 * generator, then the generator becomes a plain state machine, leaving output with neither `async`
 * nor `function*` in it. Babel inlines the regenerator helper into each compiled component, so
 * nothing has to be present globally at runtime.
 *
 * `react` is restated because this replaces the default preset list rather than extending it.
 */
export const HERMES_COMPILER_CONFIG = {
    babel: {
        presets: ['react'],
        plugins: ['transform-async-to-generator'],
    },
};
