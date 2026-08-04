/**
 * Ambient declaration for the **optional** `@zoom/rtms` dependency so this package compiles and
 * unit-tests **without it installed** (it's a native addon requiring Node >= 22, declared in
 * `optionalDependencies`). The runtime shape is constrained structurally by the `RtmsModule` interface
 * in `zoom-rtms-sdk.ts`; this declaration only keeps the dynamic `import('@zoom/rtms')` resolvable to
 * the type checker. When the real package IS installed, its own bundled types take precedence.
 *
 * VERIFY against @zoom/rtms: this is intentionally a thin `unknown`-typed module — the adapter narrows
 * the resolved value through `RtmsModule` at the loader boundary, never relying on this declaration for
 * shape. Replace with the package's real types once `@zoom/rtms` is a hard dependency.
 */
declare module '@zoom/rtms' {
    /** The module's default export; narrowed to `RtmsModule` at the loader boundary in zoom-rtms-sdk.ts. */
    const rtms: unknown;
    export default rtms;
}
