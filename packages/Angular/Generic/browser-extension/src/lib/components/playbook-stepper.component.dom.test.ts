import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
    MJExtensionPlaybookStepperComponent,
    PlaybookStepExecuteEvent,
} from './playbook-stepper.component';
import { HUBSPOT_OAUTH_PLAYBOOK } from '@memberjunction/browser-extension-core';

describe('MJExtensionPlaybookStepperComponent (DOM TestBed)', () => {
    it('renders playbook steps with mj-step-completed, mj-step-active, and mj-step-pending classes and aria-label', () => {
        const fixture = TestBed.createComponent(MJExtensionPlaybookStepperComponent);
        const comp = fixture.componentInstance;
        comp.Playbook = HUBSPOT_OAUTH_PLAYBOOK;
        comp.ActiveStepIndex = 1; // Step 2 active, Step 1 completed, Steps 3..6 pending
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const region = host.querySelector('.mj-playbook-stepper');
        expect(region?.getAttribute('aria-label')).toBe(HUBSPOT_OAUTH_PLAYBOOK.Name);

        const items = Array.from(host.querySelectorAll('.mj-step-item'));
        expect(items[0].classList.contains('mj-step-completed')).toBe(true);
        expect(items[1].classList.contains('mj-step-active')).toBe(true);
        expect(items[2].classList.contains('mj-step-pending')).toBe(true);
    });

    it('emits ExecuteStep when clicking Run Step on an active non-gated step', () => {
        const fixture = TestBed.createComponent(MJExtensionPlaybookStepperComponent);
        const comp = fixture.componentInstance;
        comp.Playbook = HUBSPOT_OAUTH_PLAYBOOK;
        comp.ActiveStepIndex = 1;
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const events: PlaybookStepExecuteEvent[] = [];
        comp.ExecuteStep.subscribe((e) => events.push(e));

        const runBtn = host.querySelector('.mj-primary-step-btn') as HTMLButtonElement;
        expect(runBtn.textContent).toContain('Run Step');
        runBtn.click();

        expect(events.length).toBe(1);
        expect(events[0].PlaybookID).toBe(HUBSPOT_OAUTH_PLAYBOOK.Id);
        expect(events[0].StepIndex).toBe(1);
        expect(events[0].ConfirmedByUser).toBe(false);
    });

    it('renders Model-Blind Secret Pipe callout and confirmation gate on CopySecretToMJVault step', () => {
        const fixture = TestBed.createComponent(MJExtensionPlaybookStepperComponent);
        const comp = fixture.componentInstance;
        comp.Playbook = HUBSPOT_OAUTH_PLAYBOOK;
        comp.ActiveStepIndex = 5; // Step 6: CopySecretToMJVault with RequiresConfirmationGate: true
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.mj-secret-vault-badge')?.textContent).toContain('Model-Blind Secret Pipe');

        const events: PlaybookStepExecuteEvent[] = [];
        comp.ExecuteStep.subscribe((e) => events.push(e));

        const confirmBtn = host.querySelector('.mj-primary-step-btn') as HTMLButtonElement;
        expect(confirmBtn.textContent).toContain('Confirm & Run Step');
        confirmBtn.click();
        fixture.detectChanges();

        expect(events.length).toBe(1);
        expect(events[0].ConfirmedByUser).toBe(true);
        expect(events[0].StepID).toBe('hubspot-step-6-vault-client-secret');
    });

    it('renders honest empty state when Playbook is null (zero hardcoded playbooks)', () => {
        const fixture = TestBed.createComponent(MJExtensionPlaybookStepperComponent);
        const comp = fixture.componentInstance;
        comp.Playbook = null;
        comp.HostLabel = 'wsj.com';
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const emptyRegion = host.querySelector('.mj-playbook-empty');
        expect(emptyRegion).not.toBeNull();
        expect(emptyRegion?.textContent).toContain('No guided playbooks configured for wsj.com');
        expect(host.querySelectorAll('.mj-step-item').length).toBe(0);
    });
});
