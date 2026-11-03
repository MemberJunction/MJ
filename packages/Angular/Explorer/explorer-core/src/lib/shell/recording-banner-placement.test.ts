import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The shell host and `.shell-container` are both `height: 100%; overflow: hidden`, so anything
 * placed after the container is clipped and never visible. The recording banner holds the only
 * "Stop & Package" control, so it must sit inside the container above the header.
 */
describe('shell template: diagnostic recording banner placement', () => {
    const html = readFileSync(fileURLToPath(new URL('./shell.component.html', import.meta.url)), 'utf8');

    it('renders the recording banner inside the shell container, before the header', () => {
        const container = html.indexOf('<div class="shell-container"');
        const banner = html.indexOf('<mj-diagnostic-recording-banner');
        const header = html.indexOf('<header class="shell-header"');

        expect(container).toBeGreaterThanOrEqual(0);
        expect(banner).toBeGreaterThan(container);
        expect(banner).toBeLessThan(header);
    });
});
