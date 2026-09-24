import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { CloneReviewComponent } from './clone-review.component';
import type { RecordClonePlanDetails } from '@memberjunction/core-entities';

const UNBLOCKED_PLAN: RecordClonePlanDetails = {
    PlanVersion: 1,
    Hash: 'hash-xyz',
    Roots: ['Users:1'],
    Nodes: [
        {
            Key: 'Users:1',
            EntityName: 'Users',
            SourceKey: 'u-1',
            TargetKey: null,
            Action: 'Create',
            Reason: 'Root',
            Depth: 0,
            ParentKey: null,
            DisplayName: 'John Doe',
            FieldChanges: [
                { Field: 'Name', OldValue: 'John Doe', NewValue: 'John Doe (2)', Kind: 'naming_strategy', Reason: 'Name made unique' },
                { Field: 'Email', OldValue: 'jdoe@test.com', NewValue: 'jdoe+copy@test.com', Kind: 'user_override', Reason: 'Entered by the user' },
            ],
            Warnings: [{ Code: 'WARN_INFO', Severity: 'Info', Message: 'Profile picture not cloned' }],
            Route: 'direct',
        },
        {
            Key: 'Roles:2',
            EntityName: 'Roles',
            SourceKey: 'r-2',
            TargetKey: 'r-2',
            Action: 'Reference',
            Reason: 'Lookup',
            Depth: 1,
            ParentKey: 'Users:1',
            DisplayName: 'Sales Agent',
            FieldChanges: [],
            Warnings: [],
            Route: 'direct',
        },
    ],
    Edges: [],
    Counts: {
        ByEntity: {
            Users: { Create: 1, Reference: 0, Skip: 0 },
            Roles: { Create: 0, Reference: 1, Skip: 0 },
        },
        Create: 1,
        Total: 2,
    },
    Warnings: [],
    Blocked: false,
    EffectiveOptions: {
        MaxDepth: 3,
        MaxRecords: 500,
        Subtypes: 'include',
        Hierarchy: 'subtree',
        SoftLinks: 'skip',
        EntityActions: 'suppress',
        AIActions: 'suppress',
        Embeddings: 'copy',
    },
};

const BLOCKED_PLAN: RecordClonePlanDetails = {
    ...UNBLOCKED_PLAN,
    Blocked: true,
    Warnings: [{ Code: 'UNIQUE_COLLISION', Severity: 'Error', Message: 'Unique email already exists' }],
};

describe('CloneReviewComponent (DOM)', () => {
    it('renders stat badges and unblocked state correctly', () => {
        const fixture = renderComponentFixture(CloneReviewComponent, {
            inputs: { Plan: UNBLOCKED_PLAN },
        });

        const badges = queryAll(fixture, 'mj-stat-badge');
        expect(badges.length).toBeGreaterThanOrEqual(3); // Create, Referenced, Warnings

        expect(query(fixture, '.blocked-banner')).toBeNull();

        const executeBtn = query(fixture, '.actions-bar button') as HTMLButtonElement;
        expect(executeBtn.disabled).toBe(false);
        expect(executeBtn.textContent).toContain('Execute Clone (1 Records)');
    });

    it('renders blocked banner and disables execute button when blocked', () => {
        const fixture = renderComponentFixture(CloneReviewComponent, {
            inputs: { Plan: BLOCKED_PLAN },
        });

        const blockedBanner = query(fixture, '.blocked-banner');
        expect(blockedBanner).not.toBeNull();
        expect(text(fixture, '.blocked-reasons-list')).toContain('Unique email already exists');

        const executeBtn = query(fixture, '.actions-bar button') as HTMLButtonElement;
        expect(executeBtn.disabled).toBe(true);
    });

    it('renders field changes diff with old and new values', () => {
        const fixture = renderComponentFixture(CloneReviewComponent, {
            inputs: { Plan: UNBLOCKED_PLAN },
        });

        const diffRows = queryAll(fixture, '.diff-row');
        expect(diffRows.length).toBe(2);

        const firstRowText = diffRows[0].textContent;
        expect(firstRowText).toContain('Name');
        expect(firstRowText).toContain('"John Doe"');
        expect(firstRowText).toContain('"John Doe (2)"');
    });

    it('emits Confirm and Cancel events', () => {
        const fixture = renderComponentFixture(CloneReviewComponent, {
            inputs: { Plan: UNBLOCKED_PLAN },
        });

        let confirmed = false;
        let cancelled = false;
        fixture.componentInstance.Confirm.subscribe(() => { confirmed = true; });
        fixture.componentInstance.Cancel.subscribe(() => { cancelled = true; });

        const buttons = queryAll(fixture, '.actions-bar button') as HTMLButtonElement[];
        buttons[0].click();
        expect(confirmed).toBe(true);

        buttons[1].click();
        expect(cancelled).toBe(true);
    });

    it('emits NodeClicked when clicking node links', () => {
        const fixture = renderComponentFixture(CloneReviewComponent, {
            inputs: { Plan: UNBLOCKED_PLAN },
        });

        let clickedKey = '';
        fixture.componentInstance.NodeClicked.subscribe((k) => { clickedKey = k; });

        const nodeLinks = queryAll(fixture, '.node-link-btn') as HTMLButtonElement[];
        expect(nodeLinks.length).toBeGreaterThan(0);
        nodeLinks[0].click();

        expect(clickedKey).toBe('Users:1');
    });
});
