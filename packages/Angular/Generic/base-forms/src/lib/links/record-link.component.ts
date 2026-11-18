import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges,
    inject
} from '@angular/core';
import { BaseEntity, CompositeKey, IMetadataProvider } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FormNavigationEvent } from '../types/navigation-events';
import { RecordPreviewUpdatedEvent } from '../preview-popover/record-preview-popover.component';
import {
    ResolveLinkMetadataProvider,
    ResolveRecordLinkTarget,
    ResolvedRecordLinkTarget
} from './record-link-utils';

export type MjRecordLinkVariant = 'inline' | 'chip' | 'box';

/**
 * Reusable `<mj-record-link>` component that renders an entity-aware hyperlink, pill chip, or link box
 * backed by `[mjRecordLink]` (hover-intent preview popover, inline Quick Edit, and `FormNavigationEvent`).
 *
 * Automatically resolves the target record's display name via `GetEntityRecordName` when `DisplayName`
 * is not pre-populated.
 */
@Component({
    standalone: false,
    selector: 'mj-record-link',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (Target; as target) {
            <span class="mj-record-link-wrap" [class.mj-record-link-wrap--chip]="Variant === 'chip'" [class.mj-record-link-wrap--box]="Variant === 'box'">
                @if (RecordLinksEnabled) {
                    <a
                        class="mj-record-link"
                        [class.mj-record-link--inline]="Variant === 'inline'"
                        [class.mj-record-link--chip]="Variant === 'chip'"
                        [class.mj-record-link--box]="Variant === 'box'"
                        [class.mj-record-link--poly]="target.IsPolymorphic"
                        [mjRecordLink]="Record"
                        [FieldName]="FieldName"
                        [EntityName]="target.EntityName"
                        [PrimaryKey]="target.PrimaryKey"
                        [DisplayName]="EffectiveDisplayName"
                        [NameFieldMap]="NameFieldMap"
                        [RecordLinksEnabled]="RecordLinksEnabled"
                        [ShowHoverPreview]="ShowHoverPreview"
                        [Provider]="ProviderToUse"
                        [attr.aria-label]="'Open ' + target.EntityDisplayName + ' record: ' + EffectiveDisplayName"
                        (Navigate)="Navigate.emit($event)"
                        (RecordUpdated)="OnPopoverRecordUpdated($event)">
                        @if (ShouldShowIcon && target.EntityIcon) {
                            <i [class]="target.EntityIcon + ' mj-record-link__icon'" aria-hidden="true"></i>
                        }
                        <span class="mj-record-link__label">{{ EffectiveDisplayName }}</span>
                        @if (ShowExternalArrow) {
                            <i class="fa-solid fa-arrow-up-right-from-square mj-record-link__arrow" aria-hidden="true"></i>
                        }
                    </a>
                } @else {
                    <span class="mj-record-link mj-record-link--disabled">
                        @if (ShouldShowIcon && target.EntityIcon) {
                            <i [class]="target.EntityIcon + ' mj-record-link__icon'" aria-hidden="true"></i>
                        }
                        <span class="mj-record-link__label">{{ EffectiveDisplayName }}</span>
                    </span>
                }
                @if (ShowCopyIdButton && target.RecordID) {
                    <button
                        type="button"
                        class="mj-record-link__copy-btn"
                        [class.is-copied]="CopiedId"
                        (click)="OnCopyRecordId($event, target.RecordID)"
                        aria-label="Copy Record ID">
                        <i [class]="CopiedId ? 'fa-solid fa-check' : 'fa-regular fa-copy'" aria-hidden="true"></i>
                    </button>
                }
            </span>
        }
    `,
    styles: [`
        :host {
            display: inline-flex;
            align-items: center;
            max-width: 100%;
        }
        .mj-record-link-wrap {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            max-width: 100%;
        }
        .mj-record-link {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            color: var(--mj-brand-primary);
            font-weight: 500;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.14s ease, background-color 0.14s ease, border-color 0.14s ease;
            max-width: 100%;
        }
        .mj-record-link:hover {
            text-decoration: underline;
        }
        .mj-record-link--disabled {
            color: var(--mj-text-primary);
            cursor: default;
        }
        .mj-record-link--disabled:hover {
            text-decoration: none;
        }
        .mj-record-link--chip {
            padding: 3px 9px;
            border-radius: 999px;
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 26%, var(--mj-border-default));
            font-size: 12px;
        }
        .mj-record-link--chip:hover {
            background: color-mix(in srgb, var(--mj-brand-primary) 16%, var(--mj-bg-surface));
            text-decoration: none;
        }
        .mj-record-link--box {
            padding: 6px 10px;
            border-radius: 8px;
            background: var(--mj-bg-surface-sunken);
            border: 1px solid var(--mj-border-default);
            font-size: 13px;
        }
        .mj-record-link--box:hover {
            border-color: var(--mj-brand-primary);
            text-decoration: none;
        }
        .mj-record-link__icon {
            font-size: 0.88em;
            opacity: 0.85;
            flex-shrink: 0;
        }
        .mj-record-link__label {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .mj-record-link__arrow {
            font-size: 0.78em;
            opacity: 0.72;
            flex-shrink: 0;
        }
        .mj-record-link__copy-btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 22px;
            height: 22px;
            border-radius: 5px;
            border: 1px solid var(--mj-border-default);
            background: var(--mj-bg-surface);
            color: var(--mj-text-muted);
            font-size: 11px;
            cursor: pointer;
            padding: 0;
        }
        .mj-record-link__copy-btn:hover {
            color: var(--mj-brand-primary);
            border-color: var(--mj-brand-primary);
        }
        .mj-record-link__copy-btn.is-copied {
            color: var(--mj-status-success);
            border-color: var(--mj-status-success);
        }
    `]
})
export class MjRecordLinkComponent extends BaseAngularComponent implements OnChanges, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public Record: BaseEntity | null = null;
    @Input() public FieldName: string | null = null;
    @Input() public EntityName: string | null = null;
    @Input() public RecordID: string | number | null = null;
    @Input() public PrimaryKey: CompositeKey | null = null;
    @Input() public DisplayName: string | null = null;
    @Input() public NameFieldMap: string | null = null;
    @Input() public Variant: MjRecordLinkVariant = 'inline';
    @Input() public ShowIcon: boolean | 'auto' = 'auto';
    @Input() public ShowExternalArrow = false;
    @Input() public ShowCopyIdButton = false;
    @Input() public RecordLinksEnabled = true;
    @Input() public ShowHoverPreview = true;

    @Output() public readonly Navigate = new EventEmitter<FormNavigationEvent>();
    @Output() public readonly RecordUpdated = new EventEmitter<RecordPreviewUpdatedEvent>();

    public CopiedId = false;

    private _destroyed = false;
    private _resolvedAsyncName: string | null | undefined = undefined;
    private _resolvedTargetKey = '';
    private _loadingAsyncName = false;
    private _copyTimer: ReturnType<typeof setTimeout> | null = null;

    public get Target(): ResolvedRecordLinkTarget | null {
        const provider = ResolveLinkMetadataProvider(this.ProviderToUse, this.Record);
        const target = ResolveRecordLinkTarget({
            Record: this.Record,
            FieldName: this.FieldName,
            EntityName: this.EntityName,
            RecordID: this.RecordID,
            PrimaryKey: this.PrimaryKey,
            DisplayName: this.DisplayName,
            NameFieldMap: this.NameFieldMap,
            Provider: provider
        });
        if (target) {
            this.ensureAsyncDisplayName(target, provider);
        }
        return target;
    }

    public get ShouldShowIcon(): boolean {
        if (this.ShowIcon === 'auto') {
            return Boolean(this.Target?.IsPolymorphic || this.Variant === 'chip' || this.Variant === 'box');
        }
        return Boolean(this.ShowIcon);
    }

    public get EffectiveDisplayName(): string {
        const target = this.Target;
        if (!target) {
            return '';
        }
        if (this.DisplayName && this.DisplayName.trim().length > 0) {
            return this.DisplayName.trim();
        }
        if (target.DisplayName && target.DisplayName.trim().length > 0) {
            return target.DisplayName.trim();
        }
        if (this._resolvedAsyncName && this._resolvedAsyncName.trim().length > 0) {
            return this._resolvedAsyncName.trim();
        }
        return target.RecordID;
    }

    public ngOnChanges(_changes: SimpleChanges): void {
        this.cdr.markForCheck();
    }

    public ngOnDestroy(): void {
        this._destroyed = true;
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
            this._copyTimer = null;
        }
    }

    public OnPopoverRecordUpdated(event: RecordPreviewUpdatedEvent): void {
        const target = this.Target;
        if (target) {
            const nameField = target.EntityInfo?.NameField?.Name ?? 'Name';
            const nextName = event.UpdatedFields[nameField] ?? event.UpdatedFields['Name'];
            if (nextName !== undefined && nextName !== null && String(nextName).trim() !== '') {
                this._resolvedAsyncName = String(nextName).trim();
            }
        }
        this.RecordUpdated.emit(event);
        this.cdr.markForCheck();
    }

    public OnCopyRecordId(event: MouseEvent, rawId: string): void {
        event.preventDefault();
        event.stopPropagation();
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(rawId);
        }
        this.CopiedId = true;
        this.cdr.markForCheck();
        if (this._copyTimer) {
            clearTimeout(this._copyTimer);
        }
        this._copyTimer = setTimeout(() => {
            this._copyTimer = null;
            if (!this._destroyed) {
                this.CopiedId = false;
                this.cdr.markForCheck();
            }
        }, 1600);
    }

    private ensureAsyncDisplayName(
        target: ResolvedRecordLinkTarget,
        provider: IMetadataProvider | null
    ): void {
        if (this.DisplayName?.trim() || target.DisplayName?.trim()) {
            return;
        }
        const sig = `${target.EntityName}::${target.PrimaryKey.ToConcatenatedString()}`;
        if (this._resolvedTargetKey !== sig) {
            this._resolvedTargetKey = sig;
            this._resolvedAsyncName = undefined;
            this._loadingAsyncName = false;
        }
        if (this._resolvedAsyncName !== undefined || this._loadingAsyncName || !provider) {
            return;
        }
        this._loadingAsyncName = true;
        provider
            .GetEntityRecordName(target.EntityName, target.PrimaryKey)
            .then(name => {
                if (this._destroyed || this._resolvedTargetKey !== sig) {
                    return;
                }
                this._resolvedAsyncName = name || null;
                this._loadingAsyncName = false;
                this.cdr.markForCheck();
            })
            .catch(() => {
                if (this._destroyed || this._resolvedTargetKey !== sig) {
                    return;
                }
                this._resolvedAsyncName = null;
                this._loadingAsyncName = false;
                this.cdr.markForCheck();
            });
    }
}
