# Sub-Epic S8a — Scoped External Participant Explorer Shell Chrome & Branded No-Access View

## Overview

Sub-Epic S8a ships generic, domain-neutral Explorer shell chrome scoping and zero-grant handling inside `@memberjunction/ng-explorer-core` (`packages/Angular/Explorer/explorer-core`) targeting `next` with **zero SQL DDL migrations** (`migrations/**`, `migrations-pg/**`, `teardown/**`, and `teardown-pg/**` remain untouched).

---

## XS-4: Restricted Participant Shell Chrome Policy & Visibility Scoping (Slice 1)

### 1. Policy Contracts & `ShellChromePolicyService`
- **File**: `packages/Angular/Explorer/explorer-core/src/lib/shell/services/shell-chrome-policy.service.ts` (re-exported via `packages/Angular/Explorer/explorer-core/src/public-api.ts`)
- **Domain-Neutral Interfaces**:
  - `ShellChromeVisibility`: `{ showGlobalSearch, showFloatingChat, showAppSwitcher, showNotifications, showAdminMenuItems, isRestrictedParticipant }`
  - `ShellChromePolicyRoleRule`: role-level visibility rules matching `UserInfo.UserRoles` by `roleId` (`UUIDsEqual`) or case-insensitive `roleName`, composed fail-closed across multiple matching rules.
  - `ShellChromePolicyConfig`: `{ restrictedRoleNames, unrestrictedRoleNames, roleRules, restrictedDefaults, restrictOnZeroAccessibleApps }`, injectable via `SHELL_CHROME_POLICY_CONFIG` or configured via `InstanceConfigEngine` (`Shell.ChromePolicy.Config`) / `UserInfoEngine` (`mj.shell.chromePolicy.config.v1`).
  - `ShellChromeUserPreferences`: non-escalating per-user narrowing preferences persisted via `UserInfoEngine.Instance.SetSettingDebounced('mj.shell.chromePolicy.preferences.v1', ...)`.
- **Fail-Closed Precedence & Zero Web Storage**:
  - Authoritative role/session/application boundaries are evaluated purely in memory from `UserInfoEngine.Instance`, `Provider.CurrentUser.UserRoles`, `InstanceConfigEngine.Instance`, and `MJAuthBase.GetSessionScope()`.
  - Read-only evaluation (`EvaluateVisibility` / `GetVisibility`) never triggers `SetSettingDebounced`.
  - User-writable `UserInfoEngine` preferences and setting overrides can narrow chrome (`false`) but can **never** escalate or re-enable controls restricted by role, session lock, or confirmed zero accessible apps.
  - Zero `window.localStorage` or `window.sessionStorage` calls exist anywhere in the policy service.

### 2. Explorer Shell & User Menu Integration
- **`ShellComponent` (`shell.component.ts` / `shell.component.html`)**:
  - Applies `ApplyShellChromeVisibilityToFlags(...)` inside `chromeFlags` so `ChromeFlags.chatOverlay`, `ShowSearchBar`, `ShowAppSwitcher`, and `ShowNotifications` automatically reflect the resolved `ShellChromeVisibility` alongside `BaseShellChromePolicy` and `InstanceConfigEngine`.
  - Adds `ShowAdminMenuItems`, `IsRestrictedParticipant`, `ShowCommandPalette`, and `IsUserMenuItemVisible(item)` using Angular 21 `@if`/`@for` control flow so hidden controls (desktop/mobile search, legacy search popup, command palette, omnibar palette, app switcher + nav-bar app buttons, notification bell, and admin user-menu items) are cleanly unmounted from the DOM rather than CSS-hidden.
  - Guards document-level `Ctrl/Cmd+K` and `Ctrl/Cmd+/` hotkeys so hidden search/palette surfaces have no keyboard back door.
- **`BaseUserMenu` (`base-user-menu.ts` / `user-menu.types.ts`)**:
  - Marks administrative and workspace-management items (`pin-to-home`, `sharing-center`, `reset-layout`, `diagnostic-bundle`, `about`) with `adminOnly: true`, filtering them in both `GetMenuElements()` and `HandleItemClick()` when `showAdminMenuItems === false`, while preserving `My Profile`, theme selection, and `Sign Out`.

### 3. Slice 1 Unit Tests
- `packages/Angular/Explorer/explorer-core/src/lib/shell/services/shell-chrome-policy.service.spec.ts` (and Vitest discovery bridge `shell-chrome-policy.service.test.ts`)
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell-chrome-scoping.test.ts`

---

## XS-5: Themeable Branded No-Access View, Shell Integration & Visual Verification (Slice 2)

### 1. `ShellNoAccessComponent` (`mj-shell-no-access`)
- **Files**:
  - `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access.component.ts`
  - `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access.component.html`
  - `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access.component.css`
- **Exports & Module Wiring**:
  - Declared and exported by `ShellModule` (`shell.module.ts`) and re-exported via `packages/Angular/Explorer/explorer-core/src/public-api.ts`.
  - Extends `BaseAngularComponent` with `ChangeDetectionStrategy.OnPush`, Angular 21 `@if`/`@for` control flow, and strict TypeScript (zero `any`, zero `unknown`, zero `BaseEntity.Get()/Set()`).
- **Operator Branding & Configuration**:
  - Strongly typed `ShellNoAccessBrandingConfig` and `ResolvedShellNoAccessBranding` interfaces with `LogoUrl`, `LogoIconClass`, `BrandTitle`, `Heading`, `Message`, `HelpText`, `SupportLabel`, `SupportEmail`, `SupportUrl`, `RefreshLabel`, and `SignOutLabel`.
  - Layered resolution precedence: domain-neutral defaults → `InstanceConfigEngine` (`Shell.NoAccess.Branding`) → `UserInfoEngine.GetSetting('mj.shell.noAccess.branding.v1')` → `@Input() BrandingConfig`.
  - Sanitizes `LogoUrl` and `SupportUrl` (allowing only `https://`, `http://`, `/`, or `data:image/`), validates `SupportEmail` and `LogoIconClass`, falls back cleanly from broken logo images to icon badges, and never accesses `localStorage` or `sessionStorage`.
- **Token-Only Styling**:
  - Styled exclusively using semantic `--mj-*` CSS custom properties (`--mj-bg-page`, `--mj-bg-surface`, `--mj-bg-surface-card`, `--mj-bg-surface-sunken`, `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted`, `--mj-border-default`, `--mj-brand-primary`, `--mj-status-info-*`, etc.) with zero hardcoded `#hex`, `rgb()`, `rgba()`, `hsl()`, or named color keywords and zero `.mj-btn` overrides.

### 2. Zero-Grant Detection & Shell Integration
- **`ShellComponent` (`shell.component.ts` / `shell.component.html` / `shell.component.css`)**:
  - Gates zero-grant rendering on `ApplicationManager.Loading` completion (`apps.length === 0`) so standard users never see a transient no-access flash during startup.
  - When confirmed zero accessible applications exist (`HasZeroApplicationGrants === true`):
    - Clears `ActiveApp`, refreshes `ShellChromePolicyService` so restricted chrome applies immediately, stops loading animation, sets `Loading = false` (`data-mj-ready="true"`), and renders `<mj-shell-no-access>` inside `#mj-main-content` instead of mounting `<mj-tab-container>` / Golden Layout.
    - Suppresses `queuedRequests` replay, `syncWorkspaceWithUrl`, `processTabRequest`, and `restoreOrOpenFallbackTab` so deep-linked URLs never trigger broken workspace tabs or unhandled `NavigationService` errors.
  - Wires `(RefreshAccess)="OnRefreshNoAccessGrants()"` (forcing `UserInfoEngine.Config(true)`, `ApplicationManager.ReloadUserApplications()`, and `ShellChromePolicyService.Refresh(...)`, transitioning cleanly into the landing app if new grants appear or displaying inline status feedback if grants remain empty) and `(SignOut)="OnLogout()"`.
  - When `apps.length > 0`, `HasZeroApplicationGrants` remains `false` and normal Explorer application rendering proceeds unchanged.

### 3. Slice 2 Unit, Token Lint & DOM Tests
- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access.component.spec.ts` (and Vitest discovery bridge `shell-no-access.component.test.ts`)
- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access-tokens.spec.ts` (and Vitest discovery bridge `shell-no-access-tokens.test.ts`)
- `packages/Angular/Explorer/explorer-core/src/lib/shell/components/no-access/shell-no-access.component.dom.test.ts` (Angular TestBed AOT + jsdom DOM suite)

### 4. CI Workflow Verification
- Verified active GitHub Actions workflows targeting `next`:
  - `.github/workflows/test.yml` (`Unit Tests` — `pull_request` & `push` on `next`, runs `guards`, `build`, sharded `test`, and `esm-guard`)
  - `.github/workflows/build.yml` (`Build all packages for testing` — `push` on `next`)
  - `.github/workflows/ci-standards.yml` (`MJ standards` — `pull_request` on `next`)
  - `.github/workflows/ci-ui-tokens.yml` (`UI design tokens` — `pull_request` on `next`)
  - `.github/workflows/ci-ui-button.yml` (`mjButton overrides` — `pull_request` on `next`)
  - `.github/workflows/ci-ngc-scss.yml` (`Angular component stylesheets` — `pull_request` on `next`)
