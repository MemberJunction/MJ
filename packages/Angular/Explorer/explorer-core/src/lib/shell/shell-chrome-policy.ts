import { Subject } from 'rxjs';
import { LogError } from '@memberjunction/core';
import type { RecordOpenStyle } from '@memberjunction/ng-shared';
import type { AppSwitcherStyle } from './components/header/app-switcher.component';

/**
 * The shell's chrome as one resolved set: which header affordances render and how the app
 * switcher and record-opening behave. Instance Config supplies the platform-wide answer
 * (`Shell.SearchBar.Enabled` and friends); a host's {@link BaseShellChromePolicy} may narrow it.
 */
export interface ShellChromeFlags {
  searchBar: boolean;
  searchPreview: boolean;
  notifications: boolean;
  appSwitcher: boolean;
  appSwitcherStyle: AppSwitcherStyle;
  appNav: boolean;
  recordOpenStyle: RecordOpenStyle;
}

/**
 * Host hook for the shell's chrome, per user or tenant.
 *
 * Instance Config decides the platform-wide chrome and is the ceiling. A host that needs a
 * narrower answer for SOME users — a white-label product hiding the search bar for
 * organizations whose plan does not include browsing the knowledge base, say — registers a
 * subclass and overrides {@link Resolve}. The shell consults the policy every time it
 * resolves its flags, and re-resolves when the policy fires {@link Changed} (the user's
 * organization or plan changed under them).
 *
 * Booleans can only be narrowed: a `true` from the policy never re-enables something Instance
 * Config turned off, and `recordOpenStyle` is not the policy's to change (it is resolved at
 * startup and pushed to collaborators). `appSwitcherStyle` may be replaced.
 *
 * Same ClassFactory pattern as {@link BaseUserMenu}:
 * ```typescript
 * @RegisterClass(BaseShellChromePolicy)
 * export class MyChromePolicy extends BaseShellChromePolicy {
 *   public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
 *     return { ...flags, searchBar: flags.searchBar && this.orgHasKnowledgePlus() };
 *   }
 * }
 * ```
 * The default (this class) is the identity: nothing changes for hosts that register nothing.
 */
export class BaseShellChromePolicy {
  /** Fire when the answer may have changed; the shell drops its cached flags and repaints. */
  public readonly Changed = new Subject<void>();

  /** Return the chrome this user should see, given what Instance Config allows. */
  public Resolve(flags: ShellChromeFlags): ShellChromeFlags {
    return flags;
  }
}

/**
 * Applies a policy's answer to the Instance Config baseline, enforcing the contract above:
 * booleans narrow only, `recordOpenStyle` is kept, `appSwitcherStyle` is taken as given.
 */
export function ApplyShellChromePolicy(baseline: ShellChromeFlags, policy: BaseShellChromePolicy): ShellChromeFlags {
  let answer: ShellChromeFlags;
  try {
    answer = policy.Resolve({ ...baseline });
  } catch (error) {
    // Host code. A throwing policy must not take the shell's chrome down with it: the reader
    // keeps the Instance Config chrome, and the error names the subclass rather than
    // surfacing as mysteriously missing buttons.
    LogError(`Shell chrome policy ${policy.constructor.name}.Resolve threw; using the Instance Config chrome unchanged. ${error instanceof Error ? error.message : String(error)}`);
    return { ...baseline };
  }
  return {
    searchBar: baseline.searchBar && answer.searchBar,
    searchPreview: baseline.searchPreview && answer.searchPreview,
    notifications: baseline.notifications && answer.notifications,
    appSwitcher: baseline.appSwitcher && answer.appSwitcher,
    appSwitcherStyle: answer.appSwitcherStyle ?? baseline.appSwitcherStyle,
    appNav: baseline.appNav && answer.appNav,
    recordOpenStyle: baseline.recordOpenStyle,
  };
}
