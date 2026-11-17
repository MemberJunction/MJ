---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

Open Apps can declare `publicPages` in `mj-app.json`: pages the host serves before sign-in, at `/p/<slug>`. `mj app install` and `mj app upgrade` write them to a top-level `publicPages` array in `mj.config.cjs` and fail when another installed app owns a slug; `mj app remove`, `enable` and `disable` remove or toggle them. `mj codegen manifest --public-pages <file>` writes the host's page list from that array, and MJExplorer's `prestart` and `prebuild` scripts now pass it.
