---
"@memberjunction/open-app-engine": patch
"@memberjunction/cli": patch
---

`mj app install` and `mj app upgrade` accept `--dependencies-from-head <app>` (repeatable, or `all`), for developers whose apps follow their default branches: the dependencies of those installed apps are read from the default branches of their repositories. Without the flag, an installed app is held to the dependencies of its installed version, as before (#6877).
