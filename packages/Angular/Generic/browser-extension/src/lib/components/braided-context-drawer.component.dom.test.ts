import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
    AfterOpenExtensionRecordEvent,
    ApplyPageEntityDiffsEvent,
    BeforeOpenExtensionRecordEvent,
    MJBraidedContextDrawerComponent,
} from './braided-context-drawer.component';
import { BraidedPageContextPayload } from '@memberjunction/browser-extension-core';

describe('MJBraidedContextDrawerComponent (DOM TestBed)', () => {
    function createSampleContext(): BraidedPageContextPayload {
        return {
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
    }

    it('renders matched anchor, facets, aria-expanded toggle, and cancelable BeforeOpenRecord / AfterOpenRecord events', () => {
        const fixture = TestBed.createComponent(MJBraidedContextDrawerComponent);
        const comp = fixture.componentInstance;
        comp.BraidedContext = createSampleContext();
        comp.IsCollapsed = false;
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const collapseBtn = host.querySelector('.mj-collapse-btn') as HTMLButtonElement;
        expect(collapseBtn.getAttribute('aria-expanded')).toBe('true');

        const beforeEvents: BeforeOpenExtensionRecordEvent[] = [];
        const afterEvents: AfterOpenExtensionRecordEvent[] = [];
        comp.BeforeOpenRecord.subscribe((e) => beforeEvents.push(e));
        comp.AfterOpenRecord.subscribe((e) => afterEvents.push(e));

        const recordLink = host.querySelector('.mj-record-link') as HTMLButtonElement;
        recordLink.click();
        expect(beforeEvents.length).toBe(1);
        expect(afterEvents.length).toBe(1);
        expect(afterEvents[0].RecordID).toBe('person-1');
    });

    it('suppresses AfterOpenRecord when a BeforeOpenRecord subscriber sets Cancel = true', () => {
        const fixture = TestBed.createComponent(MJBraidedContextDrawerComponent);
        const comp = fixture.componentInstance;
        comp.BraidedContext = createSampleContext();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const afterEvents: AfterOpenExtensionRecordEvent[] = [];
        comp.BeforeOpenRecord.subscribe((e) => {
            e.Cancel = true;
        });
        comp.AfterOpenRecord.subscribe((e) => afterEvents.push(e));

        const recordLink = host.querySelector('.mj-record-link') as HTMLButtonElement;
        recordLink.click();
        expect(afterEvents.length).toBe(0);
    });

    it('emits ApplyEntityDiffs for both existing anchor enrichment and unmatched candidate creation', () => {
        const fixture = TestBed.createComponent(MJBraidedContextDrawerComponent);
        const comp = fixture.componentInstance;
        comp.BraidedContext = createSampleContext();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        const diffEvents: ApplyPageEntityDiffsEvent[] = [];
        comp.ApplyEntityDiffs.subscribe((e) => diffEvents.push(e));

        const applyBtn = host.querySelector('.mj-apply-diffs-btn') as HTMLButtonElement;
        applyBtn.click();
        expect(diffEvents.length).toBe(1);
        expect(diffEvents[0].RecordID).toBe('person-1');

        // Switch to an unmatched candidate
        const ctx = createSampleContext();
        ctx.Matches = [];
        ctx.UnmatchedCandidates = [
            {
                RuleName: 'Organization Website Match',
                TargetEntityName: 'Organizations',
                ProposedFields: [
                    {
                        FieldName: 'Name',
                        FieldLabel: 'Organization Name',
                        CurrentEntityValue: null,
                        ExtractedPageValue: 'Acme Corp',
                        Status: 'add',
                        SelectedForApply: true,
                    },
                ],
            },
        ];
        comp.BraidedContext = ctx;
        fixture.detectChanges();

        const createBtn = host.querySelector('.mj-candidate-card .mj-apply-diffs-btn') as HTMLButtonElement;
        createBtn.click();
        expect(diffEvents.length).toBe(2);
        expect(diffEvents[1].RecordID).toBeNull();
        expect(diffEvents[1].EntityName).toBe('Organizations');
    });
});
