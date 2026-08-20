// Test fixture standing in for a dynamicPackages.server package (e.g. an Open App
// server bundle). Importing it is the "class registration" side effect; the exported
// kicker records invocations on globalThis so tests can assert across the dynamic
// import boundary.
globalThis.__fakeServerPkgImports = (globalThis.__fakeServerPkgImports ?? 0) + 1;

export function LoadFakeServer() {
  globalThis.__fakeServerPkgKickerRuns = (globalThis.__fakeServerPkgKickerRuns ?? 0) + 1;
}

export function ExplodingStartup() {
  throw new Error('startup exploded (fixture)');
}
