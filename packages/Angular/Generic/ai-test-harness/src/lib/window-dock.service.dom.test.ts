import { describe, it, expect, afterEach } from 'vitest';
import { ApplicationRef, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WindowDockService } from './window-dock.service';

/**
 * The dock is a root view the service attaches itself, so a minimize from another window does not
 * flag it for change detection. Each added or removed window must still reach the dock's DOM.
 */
describe('WindowDockService', () => {
    afterEach(() => {
        document.body.querySelectorAll('mj-window-dock').forEach(el => el.remove());
    });

    const itemCount = (): number => document.body.querySelectorAll('mj-window-dock .dock-item').length;

    it('shows every minimized window, including those added after the dock exists', () => {
        const appRef = TestBed.inject(ApplicationRef);
        const dock = new WindowDockService(appRef, TestBed.inject(Injector));

        dock.AddWindow('w-1', 'First run', 'fa-solid fa-robot');
        appRef.tick();
        dock.AddWindow('w-2', 'Second run', 'fa-solid fa-robot');
        appRef.tick();
        expect(itemCount()).toBe(2);

        dock.RemoveWindow('w-1');
        appRef.tick();
        expect(itemCount()).toBe(1);
        dock.RemoveWindow('w-2');
    });
});
