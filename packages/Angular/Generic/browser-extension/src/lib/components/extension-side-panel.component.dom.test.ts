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
        comp.ActivePlaybookStepIndex = 5; // Step 6: CopySecretToMJVault with RequiresConfirmationGate: true

        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;

        // 1. Verify Brand Header & Topology A 0ms badge
        expect(host.querySelector('.mj-ext-title')?.textContent).toBe('Betty');
        expect(host.querySelector('.mj-session-zero-blip')?.textContent).toContain('Live Daemon (0ms)');

        // 2. Verify Enterprise Safety Lock disables Auto & CDP Power buttons when AllowDebuggerCDP = false
        const modeGroup = host.querySelector('[aria-label="Browser Control Mode"]');
        const modeButtons = Array.from(modeGroup?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        expect(modeButtons.length).toBe(3);
        expect(modeButtons[0].disabled).toBe(false); // Zero-Banner
        expect(modeButtons[1].disabled).toBe(true); // Auto (disabled by policy)
        expect(modeButtons[2].disabled).toBe(true); // CDP Power (disabled by policy)

        // 3. Verify Braided Context Anchor & cancelable BeforeOpenRecord -> AfterOpenRecord contract
        const beforeEvents: BeforeOpenExtensionRecordEvent[] = [];
        const afterEvents: AfterOpenExtensionRecordEvent[] = [];
        comp.BeforeOpenRecord.subscribe((e) => beforeEvents.push(e));
        comp.AfterOpenRecord.subscribe((e) => afterEvents.push(e));

        const recordLink = host.querySelector('.mj-record-link') as HTMLButtonElement;
        expect(recordLink.textContent?.trim()).toBe('Jane Doe');
        recordLink.click();

        expect(beforeEvents.length).toBe(1);
        expect(afterEvents.length).toBe(1);
        expect(afterEvents[0].RecordID).toBe('person-1');

        // 4. Verify 1-click Page-to-Entity Enrichment button emits ApplyEntityDiffs
        const diffEvents: ApplyPageEntityDiffsEvent[] = [];
        comp.ApplyEntityDiffs.subscribe((e) => diffEvents.push(e));
        const applyBtn = host.querySelector('.mj-apply-diffs-btn') as HTMLButtonElement;
        applyBtn.click();
        expect(diffEvents.length).toBe(1);
        expect(diffEvents[0].RecordID).toBe('person-1');
        expect(diffEvents[0].Diffs[0].ExtractedPageValue).toBe('SVP of Engineering');

        // 5. Verify Playbook Stepper renders Model-Blind Secret Pipe callout & Pre-Execution Confirmation Gate
        expect(host.querySelector('.mj-secret-vault-badge')?.textContent).toContain('Model-Blind Secret Pipe');
        const stepEvents: PlaybookStepExecuteEvent[] = [];
        comp.ExecutePlaybookStep.subscribe((e) => stepEvents.push(e));

        const confirmBtn = host.querySelector('.mj-primary-step-btn') as HTMLButtonElement;
        expect(confirmBtn.textContent).toContain('Confirm & Run Step');
        confirmBtn.click();
        expect(stepEvents.length).toBe(1);
        expect(stepEvents[0].ConfirmedByUser).toBe(true);
        expect(stepEvents[0].StepID).toBe('hubspot-step-6-vault-client-secret');
    });

    it('emits ExposureChanged, DomainBlockedToggled, UnmatchedCandidate creation, and PromptSubmitted', () => {
        const fixture = TestBed.createComponent(MJExtensionSidePanelComponent);
        const comp = fixture.componentInstance;

        comp.AssistantDisplayName = 'Sidecar';
        comp.CurrentHostname = 'en.wikipedia.org';
        comp.Exposure = 'pixels';
        comp.ControlMode = 'content-script';
        comp.AllowDebuggerCDP = true;
        comp.IsAuthOrMfaScreen = true;
        comp.BraidedContext = {
            PageSnapshot: {
                Url: 'https://en.wikipedia.org/wiki/Software_engineering',
                Title: 'Software engineering - Wikipedia',
                Hostname: 'en.wikipedia.org',
                ViewportWidth: 1280,
                ViewportHeight: 800,
                InteractiveElements: [],
                VisibleTextExcerpt: 'Software engineering',
                OpenGraph: {},
                SchemaOrgEntities: [],
                MetaTags: {},
                CapturedSignals: {},
                IsAuthOrMfaScreen: true,
                ActiveBackend: 'content-script',
                CapturedAtIso: new Date().toISOString(),
            },
            Matches: [],
            UnmatchedCandidates: [
                {
                    RuleName: 'Organization Website Match',
                    TargetEntityName: 'Organizations',
                    ProposedFields: [
                        {
                            FieldName: 'Name',
                            FieldLabel: 'Organization Name',
                            CurrentEntityValue: null,
                            ExtractedPageValue: 'Wikimedia Foundation',
                            Status: 'add',
                            SelectedForApply: true,
                        },
                    ],
                },
            ],
            ResolvedAtIso: new Date().toISOString(),
        };

        fixture.detectChanges();
        const host = fixture.nativeElement as HTMLElement;

        // Auth/MFA banner is shown
        expect(host.querySelector('.mj-auth-pause-banner')?.textContent).toContain('Sign-In / MFA Screen Detected');

        // Switch exposure from Vision ('pixels') to DOM ('state')
        const exposureEvents: Array<{ PreviousExposure: string; NewExposure: string }> = [];
        comp.ExposureChanged.subscribe((e) => exposureEvents.push(e));
        const perceptionGroup = host.querySelector('[aria-label="Page Perception Exposure"]');
        const perceptionBtns = Array.from(perceptionGroup?.querySelectorAll('button') ?? []) as HTMLButtonElement[];
        perceptionBtns[1].click(); // DOM ('state')
        expect(exposureEvents).toEqual([{ PreviousExposure: 'pixels', NewExposure: 'state' }]);

        // Create unmatched candidate record
        const createEvents: ApplyPageEntityDiffsEvent[] = [];
        comp.ApplyEntityDiffs.subscribe((e) => createEvents.push(e));
        const createBtn = host.querySelector('.mj-candidate-card .mj-apply-diffs-btn') as HTMLButtonElement;
        expect(createBtn.textContent).toContain('Create Organizations in MJ');
        createBtn.click();
        expect(createEvents.length).toBe(1);
        expect(createEvents[0].RecordID).toBeNull();
        expect(createEvents[0].EntityName).toBe('Organizations');

        // Submit prompt in composer
        const prompts: string[] = [];
        comp.PromptSubmitted.subscribe((p) => prompts.push(p));
        comp.DraftPrompt = 'Summarize key links on this Wikipedia article';
        fixture.detectChanges();
        const sendBtn = host.querySelector('.mj-composer-send-btn') as HTMLButtonElement;
        sendBtn.click();
        expect(prompts).toEqual(['Summarize key links on this Wikipedia article']);
    });
});
