---
"@memberjunction/open-app-engine": patch
---

`mj app upgrade`: when the package install fails after the package files were written, the upgrade restores every file its package step changed (workspace `package.json` files and lockfiles), skips the config step, and leaves the app at its previous version and status instead of finalizing it `Disabled`. The failure message says the schema stays migrated and gives the retry command (#5517).
