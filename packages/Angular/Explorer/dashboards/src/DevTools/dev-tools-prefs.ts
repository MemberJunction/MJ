import { UserInfoEngine } from '@memberjunction/core-entities';

/**
 * Lightweight wrapper around `UserInfoEngine` for the Admin → Developer
 * Tools dashboards' user preferences. Each dev tool stores its own JSON
 * blob keyed by `MJ.DevTools.<scope>` so individual prefs (filters,
 * expansion state, sort order, search history) survive reloads + new
 * sessions on a per-user basis.
 *
 * Reads are synchronous (the engine has already loaded user settings on
 * shell startup). Writes are debounced via `SetSettingDebounced` so
 * rapidly-typed search input doesn't hit the database on every keystroke.
 */
export class DevToolsPrefs {
    private static prefix(key: string): string {
        return `MJ.DevTools.${key}`;
    }

    /** Read prefs synchronously. Returns `null` if missing or invalid. */
    public static Get<T>(key: string): T | null {
        try {
            const raw = UserInfoEngine.Instance.GetSetting(DevToolsPrefs.prefix(key));
            if (!raw) return null;
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    /** Persist prefs (debounced). Safe to call on every state change. */
    public static Save<T>(key: string, value: T): void {
        try {
            UserInfoEngine.Instance.SetSettingDebounced(
                DevToolsPrefs.prefix(key),
                JSON.stringify(value)
            );
        } catch {
            // Storage unavailable — silent. Dev tools degrade gracefully.
        }
    }

    /** Force any pending debounced writes to flush — call on dev-tool destroy. */
    public static async Flush(): Promise<void> {
        try {
            await UserInfoEngine.Instance.FlushPendingSettings();
        } catch {
            // ignore
        }
    }
}
