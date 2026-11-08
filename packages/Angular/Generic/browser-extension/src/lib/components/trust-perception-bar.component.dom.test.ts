import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
    ControlModeChangeEvent,
    ExposureChangeEvent,
    MJExtensionTrustBarComponent,
} from './trust-perception-bar.component';

describe('MJExtensionTrustBarComponent (DOM TestBed)', () => {
    it('renders domain badge, aria-pressed state, and emits DomainBlockedToggled with mj-domain-blocked class', () => {
        const fixture = TestBed.createComponent(MJExtensionTrustBarComponent);
        const comp = fixture.componentInstance;
        comp.CurrentHostname = 'en.wikipedia.org';
        comp.IsDomainBlocked = false;
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const toggleBtn = host.querySelector('.mj-domain-toggle-btn') as HTMLButtonElement;
        expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
        expect(host.querySelector('.mj-domain-blocked')).toBeNull();

        const domainEvents: Array<{ Hostname: string; Blocked: boolean }> = [];
        comp.DomainBlockedToggled.subscribe((e) => domainEvents.push(e));
        toggleBtn.click();
        fixture.detectChanges();

        expect(domainEvents).toEqual([{ Hostname: 'en.wikipedia.org', Blocked: true }]);
        expect(host.querySelector('.mj-domain-badge')?.classList.contains('mj-domain-blocked')).toBe(true);
        expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    });

    it('highlights active exposure pill with mj-pill-active and emits ExposureChanged', () => {
        const fixture = TestBed.createComponent(MJExtensionTrustBarComponent);
        const comp = fixture.componentInstance;
        comp.CurrentHostname = 'www.amazon.com';
        comp.Exposure = 'pixels';
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const exposureEvents: ExposureChangeEvent[] = [];
        comp.ExposureChanged.subscribe((e) => exposureEvents.push(e));

        const perceptionGroup = host.querySelector('[aria-label="Page Perception Exposure"]');
        const pills = Array.from(perceptionGroup?.querySelectorAll('.mj-pill-btn') ?? []) as HTMLButtonElement[];
        expect(pills[2].classList.contains('mj-pill-active')).toBe(true);

        pills[1].click(); // Select 'state' (DOM)
        fixture.detectChanges();

        expect(exposureEvents).toEqual([{ PreviousExposure: 'pixels', NewExposure: 'state' }]);
        expect(pills[1].classList.contains('mj-pill-active')).toBe(true);
    });

    it('emits ControlModeChanged when AllowDebuggerCDP is true and renders Auth/MFA banner and CDP Active pill', () => {
        const fixture = TestBed.createComponent(MJExtensionTrustBarComponent);
        const comp = fixture.componentInstance;
        comp.CurrentHostname = 'app.hubspot.com';
        comp.ControlMode = 'content-script';
        comp.AllowDebuggerCDP = true;
        comp.IsDebuggerAttached = true;
        comp.IsAuthOrMfaScreen = true;
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.mj-debugger-live-pill')?.textContent).toContain('CDP Active');
        expect(host.querySelector('.mj-auth-pause-banner')?.textContent).toContain('Sign-In / MFA Screen Detected');

        const modeEvents: ControlModeChangeEvent[] = [];
        comp.ControlModeChanged.subscribe((e) => modeEvents.push(e));

        const modeGroup = host.querySelector('[aria-label="Browser Control Mode"]');
        const modeBtns = Array.from(modeGroup?.querySelectorAll('.mj-pill-btn') ?? []) as HTMLButtonElement[];
        modeBtns[1].click(); // Select 'auto'
        fixture.detectChanges();

        expect(modeEvents).toEqual([
            {
                PreviousMode: 'content-script',
                NewMode: 'auto',
                Hostname: 'app.hubspot.com',
            },
        ]);
        expect(modeBtns[1].classList.contains('mj-pill-active')).toBe(true);
    });
});
