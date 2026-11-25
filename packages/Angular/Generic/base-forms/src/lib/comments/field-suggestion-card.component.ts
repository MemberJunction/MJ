import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ViewEncapsulation,
    inject
} from '@angular/core';
import { MJCommentEntity, MJFieldSuggestionEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { EntitySubtypeUIDriverBase } from '../subtype-ui-driver/entity-subtype-ui-driver';
import type { CommentCardDriverContext } from './comment-card-driver-host.component';

type FieldSuggestionOutcome = MJFieldSuggestionEntity['Outcome'];
type FieldSuggestionSource = MJFieldSuggestionEntity['Source'];

/**
 * Built-in {@link EntitySubtypeUIDriverBase} card component for `MJ: Comment Types`
 * rows whose `UIDriverClass` is `'FieldSuggestionCardComponent'`.
 *
 * Displays:
 * - Provenance (`Source` + optional `Confidence` score) and disposition (`Outcome`).
 * - Current live value on `TargetRecord` vs proposed ghost value (`SuggestedValue`).
 * - Interactive **Accept**, **Reject**, and **Discuss** actions for pending suggestions.
 */
@RegisterClass(EntitySubtypeUIDriverBase, 'FieldSuggestionCardComponent')
@Component({
    standalone: false,
    selector: 'mj-field-suggestion-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None,
    templateUrl: './field-suggestion-card.component.html',
    styleUrls: ['./field-suggestion-card.component.css']
})
export class FieldSuggestionCardComponent extends EntitySubtypeUIDriverBase<
    MJCommentEntity,
    MJFieldSuggestionEntity
> {
    private readonly cdr = inject(ChangeDetectorRef);

    public ActiveAction: 'accept' | 'reject' | null = null;

    public get CardContext(): CommentCardDriverContext | null {
        const ctx = this.DriverContext;
        if (!ctx || typeof ctx !== 'object') {
            return null;
        }
        return ctx as CommentCardDriverContext;
    }

    public get Suggestion(): MJFieldSuggestionEntity | null {
        return this.ChildRecord;
    }

    public get Outcome(): FieldSuggestionOutcome {
        return this.Suggestion?.Outcome ?? null;
    }

    public get IsPending(): boolean {
        return this.Outcome === null;
    }

    public get Source(): FieldSuggestionSource {
        return this.Suggestion?.Source ?? 'Agent';
    }

    public get SourceLabel(): string {
        switch (this.Source) {
            case 'Agent':
                return 'AI Agent';
            case 'Integration':
                return 'Integration';
            case 'LLM':
                return 'AI Model';
            case 'Person':
                return 'Person';
            default:
                return String(this.Source);
        }
    }

    public get SourceIcon(): string {
        switch (this.Source) {
            case 'Agent':
                return 'fa-solid fa-robot';
            case 'Integration':
                return 'fa-solid fa-plug';
            case 'LLM':
                return 'fa-solid fa-microchip';
            case 'Person':
                return 'fa-solid fa-user';
            default:
                return 'fa-solid fa-wand-magic-sparkles';
        }
    }

    public get FormattedConfidence(): string | null {
        const conf = this.Suggestion?.Confidence;
        if (conf === null || conf === undefined || !Number.isFinite(conf)) {
            return null;
        }
        const pct = conf <= 1 ? Math.round(conf * 100) : Math.round(conf);
        return `${Math.max(0, Math.min(100, pct))}%`;
    }

    public get OutcomeBadgeLabel(): string {
        switch (this.Outcome) {
            case 'Accepted':
                return 'Accepted';
            case 'Rejected':
                return 'Rejected';
            case 'Superseded':
                return 'Superseded';
            default:
                return 'Pending';
        }
    }

    public get OutcomeBadgeModifier(): string {
        switch (this.Outcome) {
            case 'Accepted':
                return 'accepted';
            case 'Rejected':
                return 'rejected';
            case 'Superseded':
                return 'superseded';
            default:
                return 'pending';
        }
    }

    public get CurrentValueDisplay(): string {
        const fromContext = this.CardContext?.CurrentLiveValue;
        if (fromContext !== null && fromContext !== undefined && fromContext.length > 0) {
            return fromContext;
        }
        const fieldName = (this.Suggestion?.AnchorKey ?? '').trim();
        if (fieldName && this.TargetRecord) {
            const field = this.TargetRecord.Fields.find(
                (f) => f.Name.toLowerCase() === fieldName.toLowerCase()
            );
            if (field) {
                const raw = field.Value;
                if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
                    return this.formatScalarForDisplay(raw);
                }
            }
        }
        return '(empty)';
    }

    public get IsClearingSuggestion(): boolean {
        const val = this.Suggestion?.SuggestedValue;
        return val === null || val === undefined || val === '';
    }

    public get SuggestedValueDisplay(): string {
        if (this.IsClearingSuggestion) {
            return '(clear value)';
        }
        return this.formatScalarForDisplay(this.Suggestion!.SuggestedValue);
    }

    public get CanUserActOnSuggestion(): boolean {
        if (!this.IsPending || !this.Suggestion?.ID) {
            return false;
        }
        if (this.CardContext) {
            return this.CardContext.CanUserUpdateTargetField;
        }
        return true;
    }

    public get CanUserDiscuss(): boolean {
        if (this.CardContext) {
            return this.CardContext.CanUserDiscuss;
        }
        return true;
    }

    public get ActionDisabledReason(): string | null {
        if (!this.IsPending) {
            return null;
        }
        if (!this.CanUserActOnSuggestion) {
            return 'You need update permission on this field to accept or reject this suggestion';
        }
        return null;
    }

    public async OnAccept(): Promise<void> {
        const suggestionId = this.Suggestion?.ID;
        const coordinator = this.CardContext?.Coordinator ?? null;
        if (!suggestionId || !coordinator || !this.CanUserActOnSuggestion || this.ActiveAction !== null) {
            return;
        }

        this.ActiveAction = 'accept';
        this.cdr.markForCheck();
        try {
            await coordinator.AcceptFieldSuggestion(suggestionId);
            this.RecordMutated.emit();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.CardContext?.OnError(msg);
        } finally {
            this.ActiveAction = null;
            this.cdr.markForCheck();
        }
    }

    public async OnReject(): Promise<void> {
        const suggestionId = this.Suggestion?.ID;
        const coordinator = this.CardContext?.Coordinator ?? null;
        if (!suggestionId || !coordinator || !this.CanUserActOnSuggestion || this.ActiveAction !== null) {
            return;
        }

        this.ActiveAction = 'reject';
        this.cdr.markForCheck();
        try {
            await coordinator.RejectFieldSuggestion(suggestionId);
            this.RecordMutated.emit();
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            this.CardContext?.OnError(msg);
        } finally {
            this.ActiveAction = null;
            this.cdr.markForCheck();
        }
    }

    public OnDiscuss(): void {
        this.CardContext?.OnDiscuss();
    }

    private formatScalarForDisplay(raw: unknown): string {
        if (raw instanceof Date) {
            return isNaN(raw.getTime()) ? String(raw) : raw.toISOString().slice(0, 10);
        }
        const text = String(raw).trim();
        if (/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z?$/.test(text)) {
            return text.slice(0, 10);
        }
        return text;
    }
}
