/**
 * REGRESSION GUARD — MJExplorer notification-service login-ordering bug.
 *
 * Background: MJExplorerAppComponent used to read `MJNotificationService.Instance`
 * STATICALLY in handleLogin and the ShowNotification client-tool handler. That
 * static getter is a non-lazy read of MJ's global object store (notifications.service.ts:155-157)
 * — it returns undefined until Angular DI constructs the `@Injectable({providedIn:'root'})`
 * singleton (whose constructor self-registers into the store). Magic-link login
 * resolves auth synchronously from the URL fragment (no redirect), so handleLogin
 * fired before anything constructed the service → `.Instance` was undefined →
 * "Cannot set properties of undefined (setting 'ShouldSuppressToast')".
 *
 * The fix: inject MJNotificationService into the constructor (forcing DI to build
 * the singleton before handleLogin runs) and use `this.notifications` instead of
 * the static `.Instance` accessor.
 *
 * This test is a SOURCE-LEVEL guard (same shape as MJGlobal's UUIDCompliance test):
 * it fails if anyone reverts the fix — i.e. drops the injection or reintroduces a
 * static `MJNotificationService.Instance.<member>` access in executable code. A
 * mechanism-only unit test would NOT catch that, because it never touches the
 * component. Reading the source is the only thing that actually protects the fix.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const COMPONENT_PATH = join(__dirname, '..', 'lib', 'explorer-app.component.ts');
const rawSource = readFileSync(COMPONENT_PATH, 'utf8');

/**
 * Strip line + block comments so the rationale comment (which deliberately
 * mentions "MJNotificationService.Instance undefined") doesn't trip the scan.
 * URLs inside string literals may be partially mangled, but those lines never
 * contain the tokens we assert on, so it's safe for this purpose.
 */
const code = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
  .replace(/\/\/.*$/gm, '');        // line comments

describe('MJExplorerAppComponent — notification-service ordering regression guard', () => {
  it('injects MJNotificationService into the constructor (so DI constructs it before handleLogin)', () => {
    // A constructor param `private <name>: MJNotificationService`. The only other
    // `MJNotificationService` mention is the import, which has no `: ` type-annotation form.
    expect(code).toMatch(/private\s+\w+\s*:\s*MJNotificationService\b/);
  });

  it('uses the injected instance (this.notifications.*), not the static singleton', () => {
    expect(code).toMatch(/this\.notifications\.\w+/);
  });

  it('does NOT read MJNotificationService.Instance statically anywhere in executable code', () => {
    // This is the actual bug. Any `MJNotificationService.Instance` member access
    // in a component that runs pre-shell (handleLogin) reintroduces the crash.
    expect(code).not.toMatch(/MJNotificationService\s*\.\s*Instance/);
  });
});
