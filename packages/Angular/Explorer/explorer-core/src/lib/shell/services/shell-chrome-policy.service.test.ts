// Vitest discovery bridge: vitest.shared.ts discovers *.test.ts while the
// service spec file uses the Angular *.spec.ts convention. Importing it here
// executes every test in shell-chrome-policy.service.spec.ts on `pnpm test`.
import './shell-chrome-policy.service.spec';
