/**
 * `<mj-refresh-button>` emits `Clicked`; it has no `Refresh` output. The Chief of Staff templates
 * bound `(Refresh)`, which non-strict template checking accepted, so the Refresh button on every
 * Chief of Staff page did nothing. Guard the binding on each page template.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = ['overview', 'approvals', 'governance'];

describe('Chief of Staff page templates bind the refresh button to its Clicked output', () => {
    it.each(PAGES)('%s', (page) => {
        const html = readFileSync(join(__dirname, '..', 'ChiefOfStaff', `chief-of-staff-${page}.component.html`), 'utf-8');
        const button = html.match(/<mj-refresh-button[\s\S]*?<\/mj-refresh-button>/)?.[0] ?? '';
        expect(button).toContain('(Clicked)="LoadChiefOfStaffData()"');
        expect(button).not.toContain('(Refresh)');
    });
});
