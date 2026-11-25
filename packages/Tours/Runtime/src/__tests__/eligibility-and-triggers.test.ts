import { MJGlobal } from '@memberjunction/global';
import { describe, expect, it } from 'vitest';
import { BaseTourTrigger, MergeTourOverrides, RegisterStandardTourPlugins, TourEligibilityEvaluator } from '../index';

RegisterStandardTourPlugins();
import type { TourDefinition, TourOverrideDefinition, TourTriggerDefinition } from '../types';
import { MockTourHost } from './test-helpers';

function makeOfferableTour(overrides: Partial<TourDefinition> = {}): TourDefinition {
    return {
        TourKey: 'core.welcome',
        Name: 'Welcome',
        Status: 'Active',
        Priority: 100,
        ThrottleTags: ['onboarding'],
        Steps: [
            {
                StepKey: 'intro',
                Sequence: 10,
                StepType: 'Modal',
                Title: 'Welcome',
            },
        ],
        ...overrides,
    };
}

describe('Eligibility Policies & Triggers', () => {
    it('CapabilityPolicy filters out tours whose step types or anchors exceed host capabilities', () => {
        const evaluator = new TourEligibilityEvaluator();
        const webHost = new MockTourHost({
            Capabilities: {
                Navigation: 'Url',
                EntityEvents: false,
                MJForms: false,
                Angular: true,
                Agent: 'None',
                Persistence: 'Guest',
            },
            Principal: { Kind: 'Guest', VisitorKey: 'v1', SurfaceKey: 'surf-1' },
        });

        const formTour = makeOfferableTour({
            TourKey: 'forms.edit',
            Steps: [
                {
                    StepKey: 'amount',
                    Sequence: 10,
                    StepType: 'Action',
                    Title: 'Amount',
                    Anchor: { Strategy: 'FormField', Entity: 'Deals', Field: 'Amount' },
                },
            ],
        });

        const res = evaluator.EvaluateTour({
            Tour: formTour,
            Host: webHost,
            Location: { Url: 'https://example.org/deals' },
            Principal: webHost.Principal,
            Runs: [],
        });

        expect(res.Eligible).toBe(false);
        expect(res.PolicyName).toBe('CapabilityPolicy');
        expect(res.Reason).toContain('MJForms');

        const agentTour = makeOfferableTour({
            TourKey: 'agent.ask',
            Steps: [
                {
                    StepKey: 'ask',
                    Sequence: 10,
                    StepType: 'AskAgent',
                    Title: 'Ask Sage',
                    Configuration: { SeedPrompt: 'Help me' },
                },
            ],
        });
        const agentRes = evaluator.EvaluateTour({
            Tour: agentTour,
            Host: webHost,
            Location: { Url: 'https://example.org/' },
            Principal: webHost.Principal,
            Runs: [],
        });
        expect(agentRes.Eligible).toBe(false);
        expect(agentRes.PolicyName).toBe('CapabilityPolicy');
    });

    it('InterruptionBudgetPolicy blocks on dirty forms, open dialogs, typing, live voice, load quiet period, and rate caps', () => {
        const evaluator = new TourEligibilityEvaluator();
        const host = new MockTourHost();
        const tour = makeOfferableTour();

        const baseBudget = {
            OffersThisSession: 0,
            OffersToday: 0,
            TagCountsToday: {},
            IsFormDirty: false,
            IsDialogOpen: false,
            IsUserTyping: false,
            IsRealtimeSessionLive: false,
            MsSincePageLoad: 10000,
        };

        // Dirty form
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, IsFormDirty: true },
            }).Eligible,
        ).toBe(false);

        // Open dialog
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, IsDialogOpen: true },
            }).Eligible,
        ).toBe(false);

        // User typing
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, IsUserTyping: true },
            }).Eligible,
        ).toBe(false);

        // Realtime voice session live
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, IsRealtimeSessionLive: true },
            }).Eligible,
        ).toBe(false);

        // Initial load quiet period (< 3000ms)
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, MsSincePageLoad: 1200 },
            }).Eligible,
        ).toBe(false);

        // Session cap reached (1/1)
        expect(
            evaluator.EvaluateTour({
                Tour: tour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, OffersThisSession: 1 },
            }).Eligible,
        ).toBe(false);

        // CriticalBypass overrides session/day caps when focus is clean
        const criticalTour = makeOfferableTour({
            LaunchPolicy: { CriticalBypass: true },
        });
        expect(
            evaluator.EvaluateTour({
                Tour: criticalTour,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InterruptionBudget: { ...baseBudget, OffersThisSession: 1, OffersToday: 1 },
            }).Eligible,
        ).toBe(true);
    });

    it('merges TourOverrides with User > Role > Global precedence', () => {
        const tour = makeOfferableTour({ Priority: 100 });
        const overrides: TourOverrideDefinition[] = [
            {
                TourKey: 'core.welcome',
                Scope: 'Global',
                Precedence: 10,
                Status: 'Active',
                Priority: 150,
            },
            {
                TourKey: 'core.welcome',
                Scope: 'Role',
                RoleName: 'Admin',
                Precedence: 10,
                Status: 'Active',
                Priority: 200,
            },
            {
                TourKey: 'core.welcome',
                Scope: 'User',
                UserId: 'user-1',
                Precedence: 10,
                Status: 'Active',
                IsDisabled: true,
            },
        ];

        const adminUser = { Kind: 'MJUser' as const, UserId: 'user-2', Roles: ['Admin'] };
        const mergedForAdmin = MergeTourOverrides(tour, overrides, adminUser);
        expect(mergedForAdmin?.Priority).toBe(200);

        const disabledUser = { Kind: 'MJUser' as const, UserId: 'user-1', Roles: ['Admin'] };
        const mergedForUser1 = MergeTourOverrides(tour, overrides, disabledUser);
        expect(mergedForUser1).toBeNull();
    });

    it('evaluates FirstVisit (MJ App and URL glob/regex) and Struggle triggers accurately', () => {
        const host = new MockTourHost();
        const tour = makeOfferableTour();

        const firstVisit = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTourTrigger>(
            BaseTourTrigger,
            'FirstVisit',
        )!;
        const urlTrigger: TourTriggerDefinition = {
            TriggerType: 'FirstVisit',
            Delivery: 'Beacon',
            Status: 'Active',
            Configuration: { UrlPattern: 'https://portal.example.org/members/*/renew', UrlMatchMode: 'glob' },
        };

        expect(
            firstVisit.Evaluate({
                Tour: tour,
                Trigger: urlTrigger,
                Host: host,
                Location: { Url: 'https://portal.example.org/members/42/renew' },
                Principal: host.Principal,
                Runs: [],
            }).Matched,
        ).toBe(true);

        expect(
            firstVisit.Evaluate({
                Tour: tour,
                Trigger: urlTrigger,
                Host: host,
                Location: { Url: 'https://portal.example.org/home' },
                Principal: host.Principal,
                Runs: [],
            }).Matched,
        ).toBe(false);

        const struggle = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTourTrigger>(
            BaseTourTrigger,
            'Struggle',
        )!;
        const struggleTrigger: TourTriggerDefinition = {
            TriggerType: 'Struggle',
            Delivery: 'Offer',
            Status: 'Active',
            Configuration: { MinValidationFailures: 2, Keywords: ['deal'] },
        };

        // Repeated save validation failures trigger Offer
        expect(
            struggle.Evaluate({
                Tour: tour,
                Trigger: struggleTrigger,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                StruggleEvent: { Kind: 'RepeatedSaveValidationFailure', FailureCount: 2, EntityName: 'Deals' },
            }),
        ).toEqual({ Matched: true, Delivery: 'Offer', Reason: 'RepeatedSaveValidationFailure' });

        // "how do I" omnibar query triggers Offer
        expect(
            struggle.Evaluate({
                Tour: tour,
                Trigger: struggleTrigger,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                StruggleEvent: { Kind: 'HowDoIOmnibarQuery', QueryText: 'how do I close a deal?' },
            }),
        ).toEqual({ Matched: true, Delivery: 'Offer', Reason: 'HowDoIOmnibarQuery' });

        // Non-"how do I" omnibar query does NOT trigger
        expect(
            struggle.Evaluate({
                Tour: tour,
                Trigger: struggleTrigger,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                StruggleEvent: { Kind: 'HowDoIOmnibarQuery', QueryText: 'open deals board' },
            }).Matched,
        ).toBe(false);

        // AppUpgraded trigger
        const appUpgraded = MJGlobal.Instance.ClassFactory.CreateInstance<BaseTourTrigger>(
            BaseTourTrigger,
            'AppUpgraded',
        )!;
        const upgradeTrigger: TourTriggerDefinition = {
            TriggerType: 'AppUpgraded',
            Delivery: 'Notification',
            Status: 'Active',
            Configuration: { ApplicationName: 'Sales', Version: '6.22.0' },
        };
        expect(
            appUpgraded.Evaluate({
                Tour: tour,
                Trigger: upgradeTrigger,
                Host: host,
                Location: {},
                Principal: host.Principal,
                Runs: [],
                InstalledAppVersions: new Map([['Sales', '6.22.0']]),
                SeenAppVersions: new Map([['Sales', '6.21.0']]),
            }).Matched,
        ).toBe(true);
    });

    it('evaluates AudiencePolicy, PrerequisitePolicy, and PermissionPolicy', () => {
        const evaluator = new TourEligibilityEvaluator();
        const host = new MockTourHost({
            Principal: {
                Kind: 'MJUser',
                UserId: 'u-1',
                Roles: ['SalesRep'],
                Permissions: {
                    Deals: { CanRead: true, CanCreate: false, CanUpdate: false, CanDelete: false },
                },
            },
        });

        const restrictedTour = makeOfferableTour({
            AudienceFilter: {
                logic: 'and',
                filters: [{ field: 'user.Roles', operator: 'contains', value: 'Admin' }],
            },
        });
        const audRes = evaluator.EvaluateTour({
            Tour: restrictedTour,
            Host: host,
            Location: {},
            Principal: host.Principal,
            Runs: [],
        });
        expect(audRes.Eligible).toBe(false);
        expect(audRes.PolicyName).toBe('AudiencePolicy');

        const prereqTour = makeOfferableTour({
            Prerequisites: [
                { PrerequisiteType: 'Tour', RequiredTourKey: 'core.intro', Strength: 'Required' },
            ],
        });
        const prereqRes = evaluator.EvaluateTour({
            Tour: prereqTour,
            Host: host,
            Location: {},
            Principal: host.Principal,
            Runs: [],
        });
        expect(prereqRes.Eligible).toBe(false);
        expect(prereqRes.PolicyName).toBe('PrerequisitePolicy');

        const permTour = makeOfferableTour({
            Goal: { Type: 'EntityEvent', EntityName: 'Deals', EventType: 'save' },
        });
        const permRes = evaluator.EvaluateTour({
            Tour: permTour,
            Host: host,
            Location: {},
            Principal: host.Principal,
            Runs: [],
        });
        expect(permRes.Eligible).toBe(false);
        expect(permRes.PolicyName).toBe('PermissionPolicy');
    });
});
