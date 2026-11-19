---
"@memberjunction/global": patch
"@memberjunction/core": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-modules": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Wave 5 UI bundle splitting, lazy loading, and ESBuild script minification safety:

- `@memberjunction/global`, `@memberjunction/core`: `BaseSingleton` detects a name-mangled build (its own class name no longer reads `BaseSingleton`) and then keys unstamped singletons by constructor, so unrelated classes the minifier gave the same name — even with byte-identical source — never share an instance. With real class names (Node, dev builds) it keys by name exactly as before, so duplicate copies of a class still share one instance even when their package versions differ. Stamped names and explicit `getInstance(className)` keys work in both modes. `BaseEngineRegistry` resolves names via `GetClassName` and registers a different engine class whose name is already taken under `Name#2`, `Name#3`… instead of overwriting the first engine's registration.
- `@memberjunction/ng-auth-services`, `@memberjunction/ng-bootstrap`, `@memberjunction/ng-bootstrap-lite`: Move the seven built-in auth providers out of the main barrel into dedicated subpath exports (`./msal`, `./auth0`, `./okta`, `./cognito`, `./workos`, `./magic-link`, `./local-dev`), declare provider files in `sideEffects`, extract `HasMagicLinkSessionToken` to a zero-dependency helper, and add `LoadAuthProvider`/`PreloadActiveAuthProvider` so Explorer loads only the active IdP SDK before bootstrapping `AppModule` while `@memberjunction/ng-bootstrap` retains eager registration via `EAGER_AUTH_PROVIDERS`.
- `@memberjunction/ng-explorer-settings`, `@memberjunction/ng-dashboards`, `@memberjunction/ng-explorer-core`, `@memberjunction/ng-explorer-modules`: Extract lightweight `UserSettingsModule` (`./user-settings.module`) and `DashboardEditorModule` (`./dashboard-editor.module`), sever unused `AITestHarnessModule` plus eager `CoreDashboardsModule` / `ExplorerSettingsModule` imports from `ExplorerCoreModule`, `ShellModule`, `ProfileDialogComponent`, and `MJExplorerModulesBundle`, and split `LiveKitRoomResource`, `HumanHandoffConsoleResource`, and `MeetingsResource` into a lazy `LiveKitResourcesModule` registered via `LIVEKIT_LAZY_FEATURE_CONFIG`.
- `MJExplorer`: Enable `optimization.scripts = true` in `production` and `staging`, switch `main.ts` from `platformBrowserDynamic` to AOT `platformBrowser` with `PreloadActiveAuthProvider`, move `@angular/compiler` to `devDependencies` (removing `@angular/platform-browser-dynamic`), and remove unused MSAL imports from `AppModule`.
