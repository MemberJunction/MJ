import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { MJExtensionSidePanelComponent } from './extension-side-panel.component';
import {
    BraidedPageContextPayload,
    HUBSPOT_OAUTH_PLAYBOOK,
} from '@memberjunction/browser-extension-core';
import {
    AfterOpenExtensionRecordEvent,
    ApplyPageEntityDiffsEvent,
    BeforeOpenExtensionRecordEvent,
} from './braided-context-drawer.component';
import { PlaybookStepExecuteEvent } from './playbook-stepper.component';

describe('MJExtensionSidePanelComponent & Subcomponents (DOM TestBed)', () => {
    it('renders Brand Header, Trust Bar, Braided Context Drawer, and Playbook Stepper with --mj-* tokens', () => {
        const fixture = TestBed.createComponent(MJExtensionSidePanelComponent);
        const comp = fixture.componentInstance;

        comp.AssistantDisplayName = 'Betty';
        comp.Tagline = 'Association & Community Intelligence';
        comp.CurrentHostname = 'www.linkedin.com';
        comp.Exposure = 'pixels';
        comp.ControlMode = 'content-script';
        comp.AllowDebuggerCDP = false;
        comp.ActiveTopology = 'topology-a-shared-daemon';

        const braided: BraidedPageContextPayload = {
            PageSnapshot: {
                Url: 'https://www.linkedin.com/in/jane-doe-12345',
                Title: 'Jane Doe - SVP of Engineering | LinkedIn',
                Hostname: 'www.linkedin.com',
                ViewportWidth: 1440,
                ViewportHeight: 900,
                InteractiveElements: [],
                VisibleTextExcerpt: 'Jane Doe',
                OpenGraph: {},
                SchemaOrgEntities: [],
                MetaTags: {},
                CapturedSignals: {},
                IsAuthOrMfaScreen: false,
                ActiveBackend: 'content-script',
                CapturedAtIso: new Date().toISOString(),
            },
            Matches: [
                {
                    Anchor: {
                        RuleName: 'LinkedIn Person Profile Match',
                        EntityName: 'People',
                        RecordID: 'person-1',
                        RecordDisplayName: 'Jane Doe',
                        RecordFields: { ID: 'person-1', Name: 'Jane Doe', Title: 'Director' },
                        ExtractedPageSignals: {},
                    },
                    Facets: [
                        {
                            AnchorEntityName: 'People',
                            HeaderTitle: 'Association Memberships',
                            EntityName: 'Memberships',
                            TotalCount: 1,
                            Items: [
                                {
                                    RecordID: 'mem-1',
                                    Title: 'Fellow Member',
                                    Subtitle: 'Midwest Chapter',
                                    Badge: 'Current',
                                    SummaryValues: {},
                                },
                            ],
                        },
                    ],
                    FieldDiffs: [
                        {
                            FieldName: 'Title',
                            FieldLabel: 'Job Title',
                            CurrentEntityValue: 'Director',
                            ExtractedPageValue: 'SVP of Engineering',
                            Status: 'update',
                            SelectedForApply: true,
                        },
                    ],
                },
            ],
            UnmatchedCandidates: [],
            ResolvedAtIso: new Date().toISOString(),
        };

        comp.BraidedContext = braided;
        comp.ActivePlaybook = HUBSPOT_OAUTH_PLAYBOOK;
        comp.ActivePlaybookStepIndex = 5;

        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;

        expect(host.querySelector('aside')?.getAttribute('aria-label')).toBe('Betty');
        expect(host.querySelector('.mj-ext-title')?.textContent).toBe('Betty');
        expect(host.querySelector('.mj-session-zero-blip')?.textContent).toContain('Live Daemon (0ms)');

        const beforeEvents: BeforeOpenExtensionRecordEvent[] = [];
        const afterEvents: AfterOpenExtensionRecordEvent[] = [];
        comp.BeforeOpenRecord.subscribe((e) => beforeEvents.push(e));
        comp.AfterOpenRecord.subscribe((e) => afterEvents.push(e));

        const recordLink = host.querySelector('.mj-record-link') as HTMLButtonElement;
        recordLink.click();

        expect(beforeEvents.length).toBe(1);
        expect(afterEvents.length).toBe(1);

        const diffEvents: ApplyPageEntityDiffsEvent[] = [];
        comp.ApplyEntityDiffs.subscribe((e) => diffEvents.push(e));
        const applyBtn = host.querySelector('.mj-apply-diffs-btn') as HTMLButtonElement;
        applyBtn.click();
        expect(diffEvents.length).toBe(1);

        const stepEvents: PlaybookStepExecuteEvent[] = [];
        comp.ExecutePlaybookStep.subscribe((e) => stepEvents.push(e));
        const confirmBtn = host.querySelector('.mj-primary-step-btn') as HTMLButtonElement;
        confirmBtn.click();
        expect(stepEvents.length).toBe(1);
    });

    it('emits ExposureChanged, ControlModeChanged, DomainBlockedToggled, and PromptSubmitted', () => {
        const fixture = TestBed.createComponent(MJExtensionSidePanelComponent);
        const comp = fixture.componentInstance;

        comp.AssistantDisplayName = 'Sidecar';
        comp.CurrentHostname = 'en.wikipedia.org';
        comp.Exposure = 'pixels';
        comp.ControlMode = 'content-script';
        comp.AllowDebuggerCDP = true;
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;

        const exposureEvents: Array<{ PreviousExposure: string; NewExposure: string }> = [];
        comp.ExposureChanged.subscribe((e) => exposureEvents.push(e));
        const perceptionGroup = host.querySelector('[aria-label="Page Perception Exposure"]');
        const perceptionBtns = Array.from(perceptionGroup?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        perceptionBtns[1].click();
        expect(exposureEvents).toEqual([{ PreviousExposure: 'pixels', NewExposure: 'state' }]);

        const modeEvents: Array<{ PreviousMode: string; NewMode: string; Hostname: string }> = [];
        comp.ControlModeChanged.subscribe((e) => modeEvents.push(e));
        const modeGroup = host.querySelector('[aria-label="Browser Control Mode"]');
        const modeBtns = Array.from(modeGroup?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        modeBtns[1].click();
        expect(modeEvents).toEqual([{ PreviousMode: 'content-script', NewMode: 'auto', Hostname: 'en.wikipedia.org' }]);

        const domainEvents: Array<{ Hostname: string; Blocked: boolean }> = [];
        comp.DomainBlockedToggled.subscribe((e) => domainEvents.push(e));
        const domainBtn = host.querySelector('.mj-domain-toggle-btn') as HTMLButtonElement;
        domainBtn.click();
        expect(domainEvents).toEqual([{ Hostname: 'en.wikipedia.org', Blocked: true }]);

        const prompts: string[] = [];
        comp.PromptSubmitted.subscribe((p) => prompts.push(p));
        comp.DraftPrompt = 'Summarize key links on this Wikipedia article';
        fixture.detectChanges();
        const sendBtn = host.querySelector('.mj-composer-send-btn') as HTMLButtonElement;
        sendBtn.click();
        expect(prompts).toEqual(['Summarize key links on this Wikipedia article']);
    });

    it('toggles VoiceToggled with mj-voice-active class and renders mj-chat-user / mj-chat-assistant messages', () => {
        const fixture = TestBed.createComponent(MJExtensionSidePanelComponent);
        const comp = fixture.componentInstance;
        comp.AssistantDisplayName = 'MJ Co-Pilot';
        comp.IsVoiceActive = false;
        comp.Messages = [
            {
                ID: 'm-1',
                Role: 'user',
                Content: 'Hello MJ Co-Pilot',
                TimestampIso: new Date().toISOString(),
            },
            {
                ID: 'm-2',
                Role: 'assistant',
                Content: 'Ready to assist on this page.',
                TimestampIso: new Date().toISOString(),
            },
        ];
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(host.querySelector('.mj-chat-user')?.textContent).toContain('Hello MJ Co-Pilot');
        expect(host.querySelector('.mj-chat-assistant')?.textContent).toContain('Ready to assist on this page.');

        const voiceStates: boolean[] = [];
        comp.VoiceToggled.subscribe((v) => voiceStates.push(v));

        const voiceBtn = host.querySelector('.mj-voice-btn') as HTMLButtonElement;
        expect(voiceBtn.getAttribute('aria-pressed')).toBe('false');
        voiceBtn.click();
        fixture.detectChanges();

        expect(voiceStates).toEqual([true]);
        expect(voiceBtn.classList.contains('mj-voice-active')).toBe(true);
        expect(voiceBtn.getAttribute('aria-pressed')).toBe('true');
    });
});
