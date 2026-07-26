import { vi } from 'vitest';

/**
 * Global test setup.
 *
 * `react-native-mmkv` is a native module with no JS fallback, so any module that
 * imports it (e.g. src/data/preferences.ts) fails to load under Node. We replace
 * it with a tiny in-memory, Map-backed stub that faithfully implements the subset
 * of the MMKV API the app uses (get/set/delete/clear + typed getters).
 */
class InMemoryMMKV {
    private store = new Map<string, string | number | boolean>();

    // Accept the { id } options object the real constructor takes.
    constructor(_options?: { id?: string }) {}

    set(key: string, value: string | number | boolean): void {
        this.store.set(key, value);
    }

    getString(key: string): string | undefined {
        const v = this.store.get(key);
        return typeof v === 'string' ? v : undefined;
    }

    getNumber(key: string): number | undefined {
        const v = this.store.get(key);
        return typeof v === 'number' ? v : undefined;
    }

    getBoolean(key: string): boolean | undefined {
        const v = this.store.get(key);
        return typeof v === 'boolean' ? v : undefined;
    }

    contains(key: string): boolean {
        return this.store.has(key);
    }

    delete(key: string): void {
        this.store.delete(key);
    }

    getAllKeys(): string[] {
        return Array.from(this.store.keys());
    }

    clearAll(): void {
        this.store.clear();
    }
}

vi.mock('react-native-mmkv', () => ({ MMKV: InMemoryMMKV }));
