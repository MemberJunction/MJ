/**
 * @fileoverview Search Result Detail Component (Task 8)
 *
 * Full-page detail view for a search result with breadcrumb navigation
 * back to search, score breakdown visualization, and related items sidebar.
 * Blends mockup results-detail-option-a (side panel) + option-b (full page).
 */

import {
    Component,
    EventEmitter,
    Input,
    Output,
    ChangeDetectorRef,
    inject
} from '@angular/core';
import { SearchResultItem, ScoreBreakdown } from '@memberjunction/ng-search';

/** Related item for the sidebar */
interface RelatedItem {
    ID: string;
    Title: string;
    EntityName: string;
    Score: number;
    SourceIcon: string;
}

@Component({
    standalone: false,
    selector: 'app-search-result-detail',
    templateUrl: './search-result-detail.component.html',
    styleUrls: ['./search-result-detail.component.css']
})
export class SearchResultDetailComponent {
    private cdr = inject(ChangeDetectorRef);

    /** The search result to display in detail */
    @Input() Result: SearchResultItem | null = null;

    /** Whether to show in side panel mode (no breadcrumb) */
    @Input() SidePanelMode = false;

    @Output() BackClicked = new EventEmitter<void>();
    @Output() RelatedItemSelected = new EventEmitter<RelatedItem>();
    @Output() NavigateToRecord = new EventEmitter<{ EntityName: string; RecordID: string }>();

    // --- Component State ---
    public RelatedItems: RelatedItem[] = [];
    public IsLoadingRelated = false;

    /** Navigate back to search results */
    public GoBack(): void {
        this.BackClicked.emit();
    }

    /** Navigate to the source record */
    public OpenSourceRecord(): void {
        if (!this.Result) return;
        this.NavigateToRecord.emit({
            EntityName: this.Result.EntityName,
            RecordID: this.Result.RecordID
        });
    }

    /** Handle clicking a related item */
    public OnRelatedItemClick(item: RelatedItem): void {
        this.RelatedItemSelected.emit(item);
    }

    /** Format a score as percentage */
    public FormatScore(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /** Get the width percentage for score bar visualization */
    public GetScoreBarWidth(score: number): string {
        return `${Math.round(score * 100)}%`;
    }

    /** Get the CSS class for a score level */
    public GetScoreClass(score: number): string {
        if (score >= 0.8) return 'score-high';
        if (score >= 0.5) return 'score-medium';
        return 'score-low';
    }

    /** Get score breakdown entries for visualization */
    public GetScoreBreakdownEntries(): { Label: string; Score: number }[] {
        if (!this.Result?.ScoreBreakdown) return [];
        const entries: { Label: string; Score: number }[] = [];
        const breakdown = this.Result.ScoreBreakdown;
        if (breakdown.Vector !== undefined) {
            entries.push({ Label: 'Vector Similarity', Score: breakdown.Vector });
        }
        if (breakdown.FullText !== undefined) {
            entries.push({ Label: 'Full-Text Match', Score: breakdown.FullText });
        }
        if (breakdown.Entity !== undefined) {
            entries.push({ Label: 'Entity Match', Score: breakdown.Entity });
        }
        return entries;
    }

    /** Get a human-readable source type label */
    public GetSourceTypeLabel(sourceType: string): string {
        const labels: Record<string, string> = {
            'entity': 'Entity Record',
            'content-item': 'Content Item',
            'file': 'Document',
            'web-page': 'Web Page'
        };
        return labels[sourceType] ?? sourceType;
    }
}
