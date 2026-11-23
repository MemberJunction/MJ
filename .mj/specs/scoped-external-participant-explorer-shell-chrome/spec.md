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

### 3. Unit Tests & Verification
- `packages/Angular/Explorer/explorer-core/src/lib/shell/services/shell-chrome-policy.service.spec.ts` (and Vitest discovery entrypoint `shell-chrome-policy.service.test.ts`)
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell-chrome-scoping.test.ts`
