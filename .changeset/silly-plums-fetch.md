---
"@memberjunction/ng-explorer-app": patch
---

Fix MJExplorer login crash where MJNotificationService.Instance was read before DI constructed the singleton — surfaced by magic-link's instant (no-redirect) login. Inject the service into MJExplorerAppComponent so it's constructed before handleLogin runs.
