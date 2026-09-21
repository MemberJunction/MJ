---
"@memberjunction/cli": patch
---

`mj agent init` scaffolds a workspace with a `.env` again. The bundled template under
`src/init-templates/citizen-builder/` creates `.env` from its `.env.example`, but that file was
caught by the repo's `.env.*` ignore rule (only the root `citizen-builder/.env.example` was
whitelisted) — so it existed only where it was authored, and every clean checkout, CI included,
scaffolded a workspace with no `.env`. The file is now tracked and whitelisted; the two
`agent-init` tests that pinned this pass on a clean checkout.
