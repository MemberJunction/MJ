// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ShellComponent } from './shell.component';

/**
 * ResetApplication clears every browser-side cache and reloads. `Object.create` holds the component
 * without standing up Angular, as the other shell suites do.
 */
describe('ShellComponent.ResetApplication', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('deletes every IndexedDB database, MJ_Diagnostics included', async () => {
        vi.useFakeTimers();
        const deleteDatabase = vi.fn();
        const databases = vi.fn().mockResolvedValue([{ name: 'MJ_Metadata' }, { name: 'MJ_Diagnostics' }]);
        vi.stubGlobal('window', { indexedDB: { databases, deleteDatabase } });
        vi.stubGlobal('localStorage', { clear: vi.fn() });
        vi.stubGlobal('sessionStorage', { clear: vi.fn() });
        vi.stubGlobal('location', { reload: vi.fn() });
        const shell = Object.create(ShellComponent.prototype) as ShellComponent;
        (shell as unknown as Record<string, unknown>)['workspaceManager'] = { ResetConfiguration: vi.fn().mockResolvedValue(undefined) };

        await shell.ResetApplication();
        await vi.waitFor(() => expect(deleteDatabase).toHaveBeenCalledTimes(2));

        expect(deleteDatabase).toHaveBeenCalledWith('MJ_Metadata');
        expect(deleteDatabase).toHaveBeenCalledWith('MJ_Diagnostics');
    });
});
