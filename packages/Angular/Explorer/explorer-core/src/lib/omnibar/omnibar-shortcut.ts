/**
 * Platform-aware label for the omnibar summon chord. The KEYBINDING is already
 * platform-aware (Cmd on Mac, Ctrl elsewhere — see shell.component.ts's
 * OnGlobalKeydown); these helpers keep the DISPLAYED hint in lockstep so a Mac
 * user sees "⌘K", not "Ctrl+K". One source of truth for every surface that
 * advertises the shortcut (header affordance, tooltip, My Profile hint).
 */

/** True when running on macOS (same detection idiom as the keydown handlers). */
export function IsMacPlatform(): boolean {
    return typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

/** The omnibar summon shortcut as the current platform's convention renders it. */
export function GetOmnibarShortcutLabel(): string {
    return IsMacPlatform() ? '⌘K' : 'Ctrl+K';
}
