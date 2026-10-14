---
"@memberjunction/theme-engine": minor
"@memberjunction/core-entities": minor
"@memberjunction/server": minor
"@memberjunction/ng-auth-services": minor
"@memberjunction/ng-explorer-app": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
---

Login Studio: design the Explorer sign-in page on the default theme.

- **Schema:** `MJ: Themes` gains `LoginScreen` (published) and `LoginScreenDraft`. `MJThemeEntityExtended`
  refuses a design the login screen cannot draw safely (`StoredLoginDesignProblems` in
  `@memberjunction/theme-engine`, the same contract the editor checks).
- **App:** Login Studio (`LoginStudioResource`) edits blocks, layout, background and colors, saves a draft
  and publishes it.
- **Public route:** `GET /auth/login-screen` serves the default Active theme's published design, logos and
  seeds, sanitized (`SanitizePublicLoginScreen`) on the server and again in the browser. Drafts are never
  served to anonymous visitors; signed-in users who can read themes can read them.
- **Login screen:** `<mj-explorer-app>` draws a published design through `<mj-login-region>` and wears the
  default theme's brand colors before sign-in. A host's `mjLoginSlot` templates still win;
  `UsePublishedLoginScreen = false` keeps the screen as the host's own inputs and CSS draw it.
