---
"@memberjunction/installer": patch
---

Distribution installs no longer ship MJ Explorer's `@memberjunction/*` prebundle exclude. The monorepo needs it for its symlinked packages, but an app that installs MJ from npm then has `ng serve` resolve MJ libraries' third-party imports from the app's folder, so under pnpm the page fails to load until the app declares each one (6.2's markdown component lazy-loads `katex`). The distribution's `angular.json` keeps an empty exclude list.
