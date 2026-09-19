import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TAB_DESTINATIONS, HOME_ONLY_DESTINATIONS } from '@/navigation/tabs';
import { Greeting } from '@/navigation/greeting';

/**
 * Can you actually get anywhere?
 *
 * This app shipped a state where the ONLY navigation was a modal sheet inside a chat thread, so
 * the screen it launched into could not reach Apps, Data or Profile at all — you had to open a
 * conversation to find the way out of conversations. Nothing caught it because nothing asserted
 * reachability; the sheet's own test passed happily while being mounted in one place.
 *
 * So these tests assert the property that actually matters: every top-level destination is
 * reachable from the shell, and every tab has a screen behind it.
 */

const APP = join(__dirname, '..', '..', 'app');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');

describe('tab destinations', () => {
    it('are the four places the app has, in bar order', () => {
        expect(TAB_DESTINATIONS.map((t) => t.Route)).toEqual([
            '/',
            '/conversations',
            '/apps',
            '/profile',
        ]);
    });

    it('every tab has a screen file behind it', () => {
        // A tab whose file is missing renders an empty screen rather than failing to build, which
        // is exactly the kind of thing that survives to a device.
        for (const t of TAB_DESTINATIONS) {
            const name = String(t.Route).replace(/^\//, '') || 'index';
            expect(() => read(`(tabs)/${name}.tsx`), `${t.Route} -> ${name}.tsx`).not.toThrow();
        }
    });

    it('every tab is declared in the navigator, and the navigator declares nothing else', () => {
        const layout = read('(tabs)/_layout.tsx');
        const declared = [...layout.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
        expect(declared).toEqual(TAB_DESTINATIONS.map((t) => String(t.Route).replace(/^\//, '') || 'index'));
    });

    it('labels are short enough for a four-up bar', () => {
        for (const t of TAB_DESTINATIONS) {
            expect(t.Label.length, t.Label).toBeLessThanOrEqual(6);
        }
    });
});

describe('reachability', () => {
    it('the ready path navigates nowhere — Home is the initial route', () => {
        // As a route that redirected, the boot gate raced the user: the first tab press after a
        // cold launch was swallowed while navigation settled. It wraps the shell now.
        const gate = readFileSync(join(__dirname, '..', 'boot', 'BootGate.tsx'), 'utf8');
        expect(gate).toContain('return <>{children}</>');
        expect(gate).not.toContain('href="/home"');
    });

    it('Home links to every destination that has no tab', () => {
        // Data Explorer is deliberately not a tab. That is only defensible while something links
        // to it — the previous design orphaned destinations exactly this way.
        const home = read('(tabs)/index.tsx');
        for (const route of HOME_ONLY_DESTINATIONS) {
            expect(home, `Home must link to ${String(route)}`).toContain(`'${String(route)}'`);
        }
    });

    it('a chat thread offers a way back rather than a navigation sheet', () => {
        // The thread is a drill-down over the tab shell now; going anywhere else is the bar's job.
        const chat = read('chat/[id].tsx');
        expect(chat).toContain('accessibilityLabel="Back"');
        expect(chat).not.toContain('GlobalNav');
    });

    it('no top-level screen ships a control with nothing behind it', () => {
        // Both of these rendered, depressed, and did nothing. A dead control reads as a broken app.
        const conversations = read('(tabs)/conversations.tsx');
        const pressablesWithoutHandlers = [...conversations.matchAll(/<Pressable(?![^>]*onPress)[^>]*>/g)];
        expect(pressablesWithoutHandlers.map((m) => m[0])).toEqual([]);
    });
});

/**
 * The greeting.
 *
 * MJ accounts frequently carry the login address in `Name`, and the first render of Home said
 * "Good evening, da-robot-tester@bluecypress.io" — long enough to wrap the heading and reading as
 * a system reciting a column rather than greeting anyone.
 */
describe('Greeting', () => {
    const at = (hour: number) => new Date(2026, 8, 18, hour, 0);

    it('uses a real first name', () => {
        expect(Greeting('Amith', at(9))).toBe('Good morning, Amith');
        expect(Greeting('Amith Nagarajan', at(14))).toBe('Good afternoon, Amith');
    });

    it('says nothing rather than greeting an email address', () => {
        expect(Greeting('da-robot-tester@bluecypress.io', at(20))).toBe('Good evening');
    });

    it('says nothing rather than wrapping the heading', () => {
        expect(Greeting('Bartholomew-Constantine', at(9))).toBe('Good morning');
    });

    it('handles an absent or blank name', () => {
        expect(Greeting(null, at(9))).toBe('Good morning');
        expect(Greeting('   ', at(20))).toBe('Good evening');
    });

    it('picks the part of day by hour', () => {
        expect(Greeting(null, at(0))).toBe('Good morning');
        expect(Greeting(null, at(11))).toBe('Good morning');
        expect(Greeting(null, at(12))).toBe('Good afternoon');
        expect(Greeting(null, at(17))).toBe('Good afternoon');
        expect(Greeting(null, at(18))).toBe('Good evening');
        expect(Greeting(null, at(23))).toBe('Good evening');
    });
});
