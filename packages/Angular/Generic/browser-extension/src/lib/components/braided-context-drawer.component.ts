/**
 * @fileoverview Standalone Angular 21 Braided Entity Context Drawer (`<mj-braided-context-drawer>`)
 * for the MemberJunction Browser Extension Side Panel.
 *
 * Renders:
 * 1. Anchor Entity Match header (`People`, `Organizations`, etc.)
 * 2. Cross-Open-App Braided Facet Cards (Sales, ATS, Caliber, Tasks, Betty Association)
 * 3. Page-to-Entity Field Diff Preview & 1-Click Capture / Enrichment
 *
 * Follows MJ's L1/L2 UI Layering standard (`BeforeOpenRecord` / `AfterOpenRecord` cancelable event contract —
 * never imports `@angular/router`).
 */

import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    inject,
    Input,
    Output,
} from '@angular/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import {
    BraidedEntityContextMatch,
    BraidedEntityFacetItem,
    BraidedEntityFacetResult,
    BraidedPageContextPayload,
    BrowserEntityFieldDiff,
    UnmatchedPageEntityCandidate,
} from '@memberjunction/browser-extension-core';

/**
 * Cancelable `BeforeOpenRecord` event emitted when the user clicks an anchor or facet record.
 */
export interface BeforeOpenExtensionRecordEvent {
    /** Target MJ Entity name. */
    EntityName: string;
    /** Target primary key / Record ID. */
    RecordID: string;
    /** Set to `true` by a listener to cancel default record-open handling. */
    Cancel: boolean;
}

/**
 * `AfterOpenExtensionRecord` event emitted after a record open request is processed.
 */
export interface AfterOpenExtensionRecordEvent {
    /** Target MJ Entity name. */
    EntityName: string;
    /** Target primary key / Record ID. */
    RecordID: string;
}

/**
 * Event emitted when the user clicks "Create in MJ" or "Apply Selected Updates"
 * in the Page-to-Entity Capture & Diff Preview card.
 */
export interface ApplyPageEntityDiffsEvent {
    /** Target MJ Entity name. */
    EntityName: string;
    /** Existing MJ Record ID (`null` when creating a new record). */
    RecordID: string | null;
    /** Diff entries accepted by the user. */
    Diffs: BrowserEntityFieldDiff[];
}

/**
 * Standalone Angular 21 Braided Entity Context Drawer component.
 */
@Component({
    selector: 'mj-braided-context-drawer',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <section class="mj-braided-drawer" role="region" aria-label="Braided MemberJunction Context">
            <header class="mj-drawer-header" (click)="ToggleCollapsed()">
                <div class="mj-drawer-title-group">
                    <span class="mj-drawer-badge">Context Braid</span>
                    @if (BraidedContext && BraidedContext.Matches.length > 0) {
                        <span class="mj-drawer-count">
                            {{ BraidedContext.Matches.length }} matched
                        </span>
                    } @else if (BraidedContext && BraidedContext.UnmatchedCandidates.length > 0) {
                        <span class="mj-drawer-count mj-drawer-count-new">New Candidate</span>
                    } @else {
                        <span class="mj-drawer-count">No match on page</span>
                    }
                </div>
                <button
                    type="button"
                    class="mj-collapse-btn"
                    [attr.aria-expanded]="!IsCollapsed"
                    (click)="$event.stopPropagation(); ToggleCollapsed()"
                >
                    @if (IsCollapsed) {
                        Expand
                    } @else {
                        Collapse
                    }
                </button>
            </header>

            @if (!IsCollapsed) {
                <div class="mj-drawer-body">
                    @if (BraidedContext && BraidedContext.Matches.length > 0) {
                        @for (match of BraidedContext.Matches; track match.Anchor.RecordID) {
                            <article class="mj-match-card">
                                <div class="mj-anchor-row">
                                    <div class="mj-anchor-info">
                                        <span class="mj-entity-pill">{{ match.Anchor.EntityName }}</span>
                                        <button
                                            type="button"
                                            class="mj-record-link"
                                            (click)="OnOpenRecord(match.Anchor.EntityName, match.Anchor.RecordID)"
                                        >
                                            {{ match.Anchor.RecordDisplayName }}
                                        </button>
                                    </div>
                                    <span class="mj-rule-tag">{{ match.Anchor.RuleName }}</span>
                                </div>

                                @if (GetActionableDiffs(match).length > 0) {
                                    <div class="mj-diff-panel" role="region" aria-label="Page to Entity Enrichment">
                                        <div class="mj-diff-header">
                                            <span class="mj-diff-title">
                                                Page Enrichment ({{ GetActionableDiffs(match).length }} changes detected)
                                            </span>
                                            <button
                                                type="button"
                                                class="mj-apply-diffs-btn"
                                                (click)="OnApplyMatchDiffs(match)"
                                            >
                                                Apply Selected Updates
                                            </button>
                                        </div>
                                        <ul class="mj-diff-list">
                                            @for (diff of GetActionableDiffs(match); track diff.FieldName) {
                                                <li class="mj-diff-item">
                                                    <label class="mj-diff-label">
                                                        <input
                                                            type="checkbox"
                                                            [checked]="diff.SelectedForApply"
                                                            (change)="OnToggleDiffSelection(diff)"
                                                        />
                                                        <span class="mj-diff-field">{{ diff.FieldLabel }}:</span>
                                                        @if (diff.CurrentEntityValue) {
                                                            <span class="mj-diff-old">{{ diff.CurrentEntityValue }}</span>
                                                            <span class="mj-diff-arrow" aria-hidden="true">→</span>
                                                        }
                                                        <span class="mj-diff-new">{{ diff.ExtractedPageValue }}</span>
                                                    </label>
                                                </li>
                                            }
                                        </ul>
                                    </div>
                                }

                                @if (match.Facets.length > 0) {
                                    <div class="mj-facets-grid">
                                        @for (facet of match.Facets; track facet.HeaderTitle) {
                                            <details open class="mj-facet-card">
                                                <summary class="mj-facet-header">
                                                    <span class="mj-facet-title">{{ facet.HeaderTitle }}</span>
                                                    <span class="mj-facet-badge">{{ facet.TotalCount }}</span>
                                                </summary>
                                                @if (facet.Items.length > 0) {
                                                    <ul class="mj-facet-rows">
                                                        @for (item of facet.Items; track item.RecordID) {
                                                            <li class="mj-facet-row">
                                                                {{ FormatFacetItemSummary(facet, item) }}
                                                            </li>
                                                        }
                                                    </ul>
                                                } @else {
                                                    <p class="mj-facet-empty">No linked records</p>
                                                }
                                            </details>
                                        }
                                    </div>
                                }
                            </article>
                        }
                    } @else if (BraidedContext && BraidedContext.UnmatchedCandidates.length > 0) {
                        @for (candidate of BraidedContext.UnmatchedCandidates; track candidate.RuleName) {
                            <article class="mj-candidate-card">
                                <div class="mj-candidate-header">
                                    <div>
                                        <span class="mj-entity-pill">{{ candidate.TargetEntityName }}</span>
                                        <strong class="mj-candidate-name">{{ candidate.RuleName }}</strong>
                                    </div>
                                    <button
                                        type="button"
                                        class="mj-apply-diffs-btn"
                                        (click)="OnCreateCandidateRecord(candidate)"
                                    >
                                        Create {{ candidate.TargetEntityName }} in MJ
                                    </button>
                                </div>
                                <ul class="mj-diff-list">
                                    @for (diff of candidate.ProposedFields; track diff.FieldName) {
                                        <li class="mj-diff-item">
                                            <label class="mj-diff-label">
                                                <input
                                                    type="checkbox"
                                                    [checked]="diff.SelectedForApply"
                                                    (change)="OnToggleDiffSelection(diff)"
                                                />
                                                <span class="mj-diff-field">{{ diff.FieldLabel }}:</span>
                                                <span class="mj-diff-new">{{ diff.ExtractedPageValue }}</span>
                                            </label>
                                        </li>
                                    }
                                </ul>
                            </article>
                        }
                    } @else {
                        <div class="mj-empty-braid">
                            No MemberJunction records matched this page yet.
                        </div>
                    }
                </div>
            }
        </section>
    `,
    styles: [
        `
            :host {
                display: block;
                font-family: var(--mj-font-family-base, system-ui, -apple-system, sans-serif);
            }
            .mj-braided-drawer {
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border-bottom: 1px solid var(--mj-border-default);
                color: var(--mj-text-primary);
            }
            .mj-drawer-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: var(--mj-space-2, 8px) var(--mj-space-3, 12px);
                cursor: pointer;
                user-select: none;
            }
            .mj-drawer-title-group {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2, 8px);
            }
            .mj-drawer-badge {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.04em;
                color: var(--mj-brand-primary);
            }
            .mj-drawer-count {
                font-size: var(--mj-text-xs, 12px);
                color: var(--mj-text-secondary);
                font-weight: 500;
            }
            .mj-drawer-count-new {
                color: var(--mj-status-info, var(--mj-brand-primary));
                font-weight: 600;
            }
            .mj-collapse-btn {
                border: none;
                background: transparent;
                color: var(--mj-text-secondary);
                font-size: var(--mj-text-xs, 11px);
                cursor: pointer;
            }
            .mj-drawer-body {
                padding: 0 var(--mj-space-3, 12px) var(--mj-space-3, 12px);
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2-5, 10px);
            }
            .mj-match-card,
            .mj-candidate-card {
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-2, 8px);
                padding: var(--mj-space-2-5, 10px);
                border-radius: var(--mj-radius-md, 8px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
            }
            .mj-anchor-row,
            .mj-candidate-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
                flex-wrap: wrap;
            }
            .mj-anchor-info {
                display: inline-flex;
                align-items: center;
                gap: var(--mj-space-2, 8px);
            }
            .mj-entity-pill {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                padding: 2px 7px;
                border-radius: var(--mj-radius-sm, 4px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
            }
            .mj-record-link {
                border: none;
                background: transparent;
                color: var(--mj-text-primary);
                font-weight: 700;
                font-size: var(--mj-text-sm, 13px);
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
            }
            .mj-rule-tag {
                font-size: var(--mj-text-xs, 11px);
                color: var(--mj-text-secondary);
            }
            .mj-diff-panel {
                padding: var(--mj-space-2, 8px);
                border-radius: var(--mj-radius-sm, 6px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border: 1px dashed var(--mj-brand-primary);
                display: flex;
                flex-direction: column;
                gap: var(--mj-space-1-5, 6px);
            }
            .mj-diff-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: var(--mj-space-2, 8px);
            }
            .mj-diff-title {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                color: var(--mj-brand-primary);
            }
            .mj-apply-diffs-btn {
                border: none;
                border-radius: var(--mj-radius-sm, 4px);
                background: var(--mj-brand-primary);
                color: var(--mj-text-inverse, var(--mj-bg-surface));
                font-size: var(--mj-text-xs, 11px);
                font-weight: 600;
                padding: 4px 8px;
                cursor: pointer;
            }
            .mj-diff-list {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .mj-diff-item {
                font-size: var(--mj-text-xs, 12px);
            }
            .mj-diff-label {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                cursor: pointer;
                flex-wrap: wrap;
            }
            .mj-diff-field {
                font-weight: 600;
                color: var(--mj-text-secondary);
            }
            .mj-diff-old {
                text-decoration: line-through;
                color: var(--mj-text-muted, var(--mj-text-secondary));
            }
            .mj-diff-new {
                font-weight: 600;
                color: var(--mj-status-success);
            }
            .mj-facets-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                gap: var(--mj-space-2, 8px);
            }
            .mj-facet-card {
                padding: var(--mj-space-2, 8px);
                border-radius: var(--mj-radius-sm, 6px);
                background: var(--mj-bg-surface-card, var(--mj-bg-surface));
                border: 1px solid var(--mj-border-default);
            }
            .mj-facet-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                margin-bottom: 4px;
            }
            .mj-facet-title {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                color: var(--mj-text-primary);
            }
            .mj-facet-badge {
                font-size: var(--mj-text-xs, 11px);
                font-weight: 700;
                padding: 1px 6px;
                border-radius: var(--mj-radius-full, 9999px);
                background: var(--mj-bg-surface-sunken, var(--mj-bg-surface));
                color: var(--mj-brand-primary);
            }
            .mj-facet-rows {
                list-style: none;
                margin: 0;
                padding: 0;
                display: flex;
                flex-direction: column;
                gap: 3px;
            }
            .mj-facet-row {
                font-size: var(--mj-text-xs, 11px);
                color: var(--mj-text-secondary);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .mj-facet-empty,
            .mj-empty-braid {
                margin: 0;
                font-size: var(--mj-text-xs, 12px);
                color: var(--mj-text-secondary);
            }
        `,
    ],
})
export class MJBraidedContextDrawerComponent extends BaseAngularComponent {
    private readonly cdr = inject(ChangeDetectorRef);

    /** Resolved braided context for the current browser page. */
    @Input() public BraidedContext: BraidedPageContextPayload | null = null;

    /** Whether the context drawer body is collapsed. */
    @Input() public IsCollapsed = false;

    /** Cancelable event emitted before opening an MJ entity record. */
    @Output() public readonly BeforeOpenRecord = new EventEmitter<BeforeOpenExtensionRecordEvent>();

    /** Event emitted after an MJ entity record open action is approved. */
    @Output() public readonly AfterOpenRecord = new EventEmitter<AfterOpenExtensionRecordEvent>();

    /** Event emitted when the user submits 1-click capture or enrichment diffs. */
    @Output() public readonly ApplyEntityDiffs = new EventEmitter<ApplyPageEntityDiffsEvent>();

    /**
     * Toggle the drawer collapsed state.
     */
    public ToggleCollapsed(): void {
        this.IsCollapsed = !this.IsCollapsed;
        this.cdr.markForCheck();
    }

    /**
     * Return only `'add'` and `'update'` field diffs for a match.
     */
    public GetActionableDiffs(match: BraidedEntityContextMatch): BrowserEntityFieldDiff[] {
        return match.FieldDiffs.filter(
            (d: BrowserEntityFieldDiff) => d.Status === 'add' || d.Status === 'update'
        );
    }

    /**
     * Toggle selection of an individual field diff row.
     */
    public OnToggleDiffSelection(diff: BrowserEntityFieldDiff): void {
        diff.SelectedForApply = !diff.SelectedForApply;
        this.cdr.markForCheck();
    }

    /**
     * Emit selected field diffs for an existing matched anchor entity.
     */
    public OnApplyMatchDiffs(match: BraidedEntityContextMatch): void {
        const selected = this.GetActionableDiffs(match).filter(
            (d: BrowserEntityFieldDiff) => d.SelectedForApply
        );
        if (selected.length === 0) {
            return;
        }
        this.ApplyEntityDiffs.emit({
            EntityName: match.Anchor.EntityName,
            RecordID: match.Anchor.RecordID,
            Diffs: selected,
        });
    }

    /**
     * Emit selected field diffs to create a new MJ entity record from an unmatched page candidate.
     */
    public OnCreateCandidateRecord(candidate: UnmatchedPageEntityCandidate): void {
        const selected = candidate.ProposedFields.filter(
            (d: BrowserEntityFieldDiff) => d.SelectedForApply
        );
        this.ApplyEntityDiffs.emit({
            EntityName: candidate.TargetEntityName,
            RecordID: null,
            Diffs: selected,
        });
    }

    /**
     * Format a concise 1-line summary of a facet item.
     */
    public FormatFacetItemSummary(_facet: BraidedEntityFacetResult, item: BraidedEntityFacetItem): string {
        const parts: string[] = [item.Title];
        if (item.Subtitle) {
            parts.push(item.Subtitle);
        }
        if (item.Badge) {
            parts.push(item.Badge);
        }
        return parts.filter(Boolean).join(' • ');
    }

    /**
     * Trigger the cancelable `BeforeOpenRecord` → `AfterOpenRecord` L1/L2 widget event pair.
     */
    public OnOpenRecord(entityName: string, recordId: string): void {
        const beforeEvt: BeforeOpenExtensionRecordEvent = {
            EntityName: entityName,
            RecordID: recordId,
            Cancel: false,
        };
        this.BeforeOpenRecord.emit(beforeEvt);
        if (beforeEvt.Cancel) {
            return;
        }
        this.AfterOpenRecord.emit({
            EntityName: entityName,
            RecordID: recordId,
        });
    }
}
