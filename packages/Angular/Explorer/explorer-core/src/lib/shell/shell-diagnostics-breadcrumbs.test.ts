// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { NavigationEnd, NavigationStart } from '@angular/router';
import { Subject } from 'rxjs';
import { ShellComponent } from './shell.component';

/**
 * The shell adds each finished navigation to the diagnostics breadcrumb trail. Generic diagnostics
 * code cannot read the router, so the shell is the only place that sees every route change.
 *
 * `Object.create` holds the component without standing up Angular, as the other shell suites do.
 */
describe('ShellComponent diagnostics route breadcrumbs', () => {
    it('records each finished navigation, by its url after redirects', () => {
        const shell = Object.create(ShellComponent.prototype) as ShellComponent;
        const events = new Subject<NavigationStart | NavigationEnd>();
        const recordRoute = vi.fn();
        const open = shell as unknown as Record<string, unknown>;
        open['router'] = { events };
        open['subscriptions'] = [];
        open['diagnosticsService'] = { RecordRouteBreadcrumb: recordRoute };

        (shell as unknown as { subscribeRouteBreadcrumbs(): void }).subscribeRouteBreadcrumbs();
        events.next(new NavigationStart(1, '/app/home'));
        events.next(new NavigationEnd(1, '/app/home', '/app/home/dashboard'));

        expect(recordRoute).toHaveBeenCalledTimes(1);
        expect(recordRoute).toHaveBeenCalledWith('/app/home/dashboard');
    });

    it('subscribes in ngOnInit, before the first navigation settles', () => {
        const source = readFileSync(new URL('./shell.component.ts', import.meta.url), 'utf8');
        const init = source.slice(source.indexOf('async ngOnInit()'), source.indexOf('const initShellOnce'));

        expect(init).toContain('this.subscribeRouteBreadcrumbs();');
    });
});
