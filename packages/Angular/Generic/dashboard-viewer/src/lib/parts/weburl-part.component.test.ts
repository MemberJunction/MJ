import '@angular/compiler';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChangeDetectorRef } from '@angular/core';
import type { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import type { DashboardPanel, WebURLPanelConfig } from '../models/dashboard-types';
import { WebURLPartComponent } from './weburl-part.component';

function buildPanel(url: string, overrides: Partial<WebURLPanelConfig> = {}): DashboardPanel {
    return {
        id: 'panel-weburl-1',
        title: 'Embedded Docs',
        icon: 'fa-solid fa-globe',
        partTypeId: 'part-type-weburl',
        config: {
            type: 'WebURL',
            url,
            ...overrides,
        },
    };
}

describe('WebURLPartComponent', () => {
    let detectChangesMock: ReturnType<typeof vi.fn>;
    let bypassSecurityTrustResourceUrlMock: ReturnType<typeof vi.fn<(url: string) => SafeResourceUrl>>;
    let cdr: ChangeDetectorRef;
    let sanitizer: DomSanitizer;

    beforeEach(() => {
        vi.useFakeTimers();
        detectChangesMock = vi.fn();
        bypassSecurityTrustResourceUrlMock = vi.fn((url: string) => ({ trustedUrl: url } as unknown as SafeResourceUrl));
        cdr = { detectChanges: detectChangesMock } as unknown as ChangeDetectorRef;
        sanitizer = { bypassSecurityTrustResourceUrl: bypassSecurityTrustResourceUrlMock } as unknown as DomSanitizer;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('embeds valid https:// and http:// URLs via bypassSecurityTrustResourceUrl', async () => {
        const part = new WebURLPartComponent(cdr, sanitizer);
        part.Panel = buildPanel('https://docs.memberjunction.org/guide');

        await part.loadContent();

        expect(part.ErrorMessage).toBeNull();
        expect(part.IsLoading).toBe(false);
        expect(part.RawUrl).toBe('https://docs.memberjunction.org/guide');
        expect(bypassSecurityTrustResourceUrlMock).toHaveBeenCalledWith('https://docs.memberjunction.org/guide');
        expect(part.SafeUrl).toEqual({ trustedUrl: 'https://docs.memberjunction.org/guide' });

        part.Panel = buildPanel('http://localhost:4200/health');
        expect(part.ErrorMessage).toBeNull();
        expect(part.RawUrl).toBe('http://localhost:4200/health');
        expect(bypassSecurityTrustResourceUrlMock).toHaveBeenLastCalledWith('http://localhost:4200/health');

        part.ngOnDestroy();
    });

    it.each([
        'javascript:alert(document.cookie)',
        'JAVASCRIPT:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'ftp://files.example.com/archive.zip',
        '/relative/path/only',
        'not a valid url',
    ])('refuses non-http(s) or malformed URL %s without calling bypassSecurityTrustResourceUrl', async (unsafeUrl) => {
        const part = new WebURLPartComponent(cdr, sanitizer);
        part.Panel = buildPanel(unsafeUrl);

        await part.loadContent();

        expect(bypassSecurityTrustResourceUrlMock).not.toHaveBeenCalled();
        expect(part.SafeUrl).toBeNull();
        expect(part.RawUrl).toBe('');
        expect(part.IsLoading).toBe(false);
        expect(part.ErrorMessage).toBe('Only http:// and https:// URLs can be embedded.');
    });

    it('clears ErrorMessage when reconfigured from a rejected URL to a valid https:// URL or empty URL', async () => {
        const part = new WebURLPartComponent(cdr, sanitizer);
        part.Panel = buildPanel('javascript:alert(1)');
        await part.loadContent();
        expect(part.ErrorMessage).toBe('Only http:// and https:// URLs can be embedded.');

        // Reconfigure with a valid https:// URL
        part.Panel = buildPanel('https://example.com/dashboard');
        await part.loadContent();

        expect(part.ErrorMessage).toBeNull();
        expect(part.RawUrl).toBe('https://example.com/dashboard');
        expect(part.SafeUrl).toEqual({ trustedUrl: 'https://example.com/dashboard' });

        // Trigger another error and then clear the URL altogether
        part.Panel = buildPanel('data:text/html,<h1>bad</h1>');
        await part.loadContent();
        expect(part.ErrorMessage).toBe('Only http:// and https:// URLs can be embedded.');

        part.Panel = buildPanel('');
        await part.loadContent();
        expect(part.ErrorMessage).toBeNull();
        expect(part.SafeUrl).toBeNull();
        expect(part.RawUrl).toBe('');

        part.ngOnDestroy();
    });

    it('clears the 3-second blocked-embed timer when destroyed before it fires', async () => {
        const part = new WebURLPartComponent(cdr, sanitizer);
        part.Panel = buildPanel('https://example.com');
        await part.loadContent();

        part.ngOnDestroy();
        detectChangesMock.mockClear();

        vi.advanceTimersByTime(5000);
        expect(part.ShowFallbackLink).toBe(false);
        expect(detectChangesMock).not.toHaveBeenCalled();
    });
});
