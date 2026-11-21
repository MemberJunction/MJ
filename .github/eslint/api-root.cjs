/**
 * check:api-root — MJAPI is often served under a prefix (MJAPI_BASE_PATH, e.g. `/api`), so a route
 * mounted on the Express app with a root-relative literal is unreachable behind a CDN that forwards only
 * that prefix. Mount through `ApiRoute()` from @memberjunction/server (extensions: mount on
 * `context.config.RootPath`, which core already composes under MJAPI_BASE_PATH). See MJ #5674.
 *
 * Only the APPLICATION object is checked (`app.*`, `context.app.*`, `this.app.*`). Paths on a sub-router
 * (`router.get('/:id')`) are relative to wherever that router is mounted, so they are fine.
 */
const METHODS = '/^(use|get|post|put|patch|delete|all)$/';
const message =
    'Root-relative route on the Express app. Mount it with ApiRoute() from @memberjunction/server (or on an extension\'s config.RootPath): the API is not always at "/" (MJ #5674).';

const selectors = [];
for (const receiver of ["[callee.object.name='app']", "[callee.object.property.name='app']"]) {
    const call = `CallExpression[callee.property.name=${METHODS}]${receiver}`;
    selectors.push({ selector: `${call}[arguments.0.type='Literal'][arguments.0.value=/^\\//]`, message });
    selectors.push({ selector: `${call}[arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^\\//]`, message });
    // A *_PATH constant (`app.use(REALTIME_RECORDING_MOUNT_PATH, …)`) is a root-relative literal one hop away.
    selectors.push({ selector: `${call}[arguments.0.type='Identifier'][arguments.0.name=/_PATH$/]`, message });
    selectors.push({ selector: `${call}[arguments.0.type='MemberExpression'][arguments.0.property.name=/_PATH$/]`, message });
}

module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-restricted-syntax': ['error', ...selectors] },
};
