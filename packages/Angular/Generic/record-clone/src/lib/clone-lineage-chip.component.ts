/**
 * @fileoverview Compact lineage chip and history popover component.
 *
 * Implements §12.3 of the Record Cloning architectural blueprint. Surfaces origin
 * and clone lineage metadata ("Cloned from <name>" or "<n> clones"). Clicking opens
 * a popover listing ancestral origins and descendant clones with safe navigation links.
 */

import {
    Component,
    ChangeDetectionStrategy,
    Input,
    Output,
    EventEmitter,
    OnInit,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
    RecordCloneKey,
    RecordCloneGetLineageOutput,
    RecordCloneLineageItem,
} from '@memberjunction/core-entities';
import { CompositeKey } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { RecordCloneService } from './record-clone.service';
import { CompositeKeyToRecordCloneKey, type CloneNavigationEvent } from './record-clone-types';

@Component({
    standalone: true,
    selector: 'mj-clone-lineage-chip',
    template: `
        @if (HasLineage) {
            <div class="lineage-wrapper">
                <!-- Compact Chip Button -->
                <button
                    type="button"
                    class="lineage-chip-btn"
                    [class.active]="IsOpen"
                    (click)="TogglePopover()"
                    [title]="ChipTooltip">
                    <i [class]="ChipIcon"></i>
                    <span class="chip-label">{{ChipLabel}}</span>
                </button>

                <!-- Lineage Popover Menu -->
                @if (IsOpen) {
                    <div class="lineage-popover" role="dialog" aria-label="Record Lineage">
                        <div class="popover-header">
                            <span class="popover-title">
                                <i class="fa-solid fa-code-fork"></i>
                                Record Clone Lineage
                            </span>
                            <button
                                type="button"
                                class="popover-close-btn"
                                (click)="ClosePopover()"
                                title="Close">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        <div class="popover-body">
                            <!-- Ancestors Origin Section -->
                            @if (Ancestors && Ancestors.length > 0) {
                                <div class="lineage-group">
                                    <span class="group-label">Ancestry Chain (Origins)</span>
                                    <div class="lineage-items-list">
                                        @for (item of Ancestors; track item.CloneLogID) {
                                            <div class="lineage-item">
                                                <i class="fa-solid fa-arrow-turn-up item-icon ancestor-icon"></i>
                                                <div class="item-content">
                                                    <button
                                                        type="button"
                                                        class="item-link"
                                                        (click)="OnNavigate(item)">
                                                        {{item.DisplayName || item.RecordID}}
                                                    </button>
                                                    <span class="item-meta">
                                                        {{item.EntityName}}
                                                        @if (item.ClonedBy) {
                                                            • by {{item.ClonedBy}}
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                            }

                            <!-- Direct Source Section if no full ancestry -->
                            @if (SourceRecord && (!Ancestors || Ancestors.length === 0)) {
                                <div class="lineage-group">
                                    <span class="group-label">Cloned From</span>
                                    <div class="lineage-item">
                                        <i class="fa-solid fa-arrow-turn-up item-icon ancestor-icon"></i>
                                        <div class="item-content">
                                            <button
                                                type="button"
                                                class="item-link"
                                                (click)="OnNavigate(SourceRecord)">
                                                {{SourceRecord.DisplayName || SourceRecord.RecordID}}
                                            </button>
                                            <span class="item-meta">
                                                {{SourceRecord.EntityName}}
                                                @if (SourceRecord.ClonedBy) {
                                                    • by {{SourceRecord.ClonedBy}}
                                                }
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            }

                            <!-- Clones Created from This Record -->
                            @if (Clones && Clones.length > 0) {
                                <div class="lineage-group">
                                    <span class="group-label">
                                        Clones Created from This Record ({{Clones.length}})
                                    </span>
                                    <div class="lineage-items-list">
                                        @for (clone of Clones; track clone.CloneLogID) {
                                            <div class="lineage-item">
                                                <i class="fa-solid fa-clone item-icon clone-icon"></i>
                                                <div class="item-content">
                                                    <button
                                                        type="button"
                                                        class="item-link"
                                                        (click)="OnNavigate(clone)">
                                                        {{clone.DisplayName || clone.RecordID}}
                                                    </button>
                                                    <span class="item-meta">
                                                        {{clone.EntityName}}
                                                        @if (clone.ClonedBy) {
                                                            • by {{clone.ClonedBy}}
                                                        }
                                                    </span>
                                                </div>
                                            </div>
                                        }
                                    </div>
                                </div>
                            }
                        </div>
                    </div>
                }
            </div>
        }
    `,
    styles: [`
        .lineage-wrapper {
            position: relative;
            display: inline-flex;
        }

        .lineage-chip-btn {
            display: inline-flex;
            align-items: center;
            gap: 5px;
            padding: 2px 8px;
            background: var(--mj-bg-surface-card);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-lg);
            font-size: var(--mj-text-xs);
            color: var(--mj-text-secondary);
            cursor: pointer;
            transition: all 0.15s ease-in-out;
            user-select: none;
        }

        .lineage-chip-btn:hover, .lineage-chip-btn.active {
            background: color-mix(in srgb, var(--mj-brand-primary) 10%, var(--mj-bg-surface));
            border-color: var(--mj-brand-primary);
            color: var(--mj-brand-primary);
        }

        .chip-label {
            font-weight: 500;
            max-width: 160px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .lineage-popover {
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 4px;
            width: 280px;
            background: var(--mj-bg-surface);
            border: 1px solid var(--mj-border-default);
            border-radius: var(--mj-radius-md);
            box-shadow: var(--mj-shadow-md);
            z-index: 1000;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        .popover-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 8px 12px;
            background: var(--mj-bg-surface-card);
            border-bottom: 1px solid var(--mj-border-default);
        }

        .popover-title {
            font-size: var(--mj-text-xs);
            font-weight: 600;
            color: var(--mj-text-primary);
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .popover-close-btn {
            background: none;
            border: none;
            color: var(--mj-text-muted);
            cursor: pointer;
            padding: 2px;
            font-size: 11px;
        }

        .popover-body {
            padding: 8px 12px;
            max-height: 280px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .lineage-group {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .group-label {
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--mj-text-muted);
        }

        .lineage-items-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .lineage-item {
            display: flex;
            align-items: flex-start;
            gap: 8px;
        }

        .item-icon {
            font-size: 11px;
            margin-top: 3px;
        }

        .ancestor-icon {
            color: var(--mj-brand-primary);
        }

        .clone-icon {
            color: var(--mj-status-success-text);
        }

        .item-content {
            display: flex;
            flex-direction: column;
            gap: 1px;
            min-width: 0;
            flex: 1;
        }

        .item-link {
            background: none;
            border: none;
            padding: 0;
            margin: 0;
            text-align: left;
            font-size: var(--mj-text-xs);
            font-weight: 500;
            color: var(--mj-brand-primary);
            cursor: pointer;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .item-link:hover {
            text-decoration: underline;
        }

        .item-meta {
            font-size: 10px;
            color: var(--mj-text-muted);
        }
    `],
    imports: [
        CommonModule,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CloneLineageChipComponent extends BaseAngularComponent implements OnInit {
    private cloneService = inject(RecordCloneService);
    private cdr = inject(ChangeDetectorRef);

    /** Entity of the record whose lineage to show. */
    @Input() EntityName = '';
    /** Key of the record: a RecordCloneKey or a record-id string (`CompositeKey.FromURLSegment` form). */
    @Input() RecordKey: RecordCloneKey | string = '';
    /** Load lineage on init. Set false and call `LoadLineage()` to control timing. */
    @Input() AutoLoad = true;
    /** Pre-loaded lineage; skips the server call when set. */
    @Input() LineageData: RecordCloneGetLineageOutput | null = null;

    /** Asks the host to open an ancestor or clone from the popover. */
    @Output() NavigateToRecord = new EventEmitter<CloneNavigationEvent>();

    public IsOpen = false;
    public IsLoading = false;

    public get SourceRecord(): RecordCloneLineageItem | undefined {
        if (!this.LineageData?.Ancestors || this.LineageData.Ancestors.length === 0) return undefined;
        return this.LineageData.Ancestors[this.LineageData.Ancestors.length - 1];
    }

    public get Ancestors(): RecordCloneLineageItem[] | undefined {
        return this.LineageData?.Ancestors;
    }

    public get Clones(): RecordCloneLineageItem[] | undefined {
        return this.LineageData?.Clones;
    }

    public get HasLineage(): boolean {
        return !!this.SourceRecord || (!!this.Clones && this.Clones.length > 0);
    }

    public get ChipIcon(): string {
        if (this.SourceRecord) {
            return 'fa-solid fa-code-branch';
        }
        return 'fa-solid fa-clone';
    }

    public get ChipLabel(): string {
        if (this.SourceRecord) {
            return `Cloned from ${this.SourceRecord.DisplayName || this.SourceRecord.RecordID}`;
        }
        if (this.Clones && this.Clones.length > 0) {
            return `${this.Clones.length} clone${this.Clones.length === 1 ? '' : 's'}`;
        }
        return 'Lineage';
    }

    public get ChipTooltip(): string {
        if (this.SourceRecord) {
            return `View clone origin and lineage history`;
        }
        return `View records cloned from this record`;
    }

    public async ngOnInit(): Promise<void> {
        if (this.AutoLoad && !this.LineageData && this.EntityName && this.RecordKey) {
            await this.LoadLineage();
        }
    }

    public async LoadLineage(): Promise<void> {
        this.IsLoading = true;
        this.cdr.markForCheck();
        try {
            const key: RecordCloneKey = typeof this.RecordKey === 'string'
                ? CompositeKeyToRecordCloneKey(
                      CompositeKey.FromURLSegment(this.ProviderToUse?.EntityByName(this.EntityName), this.RecordKey)
                  )
                : this.RecordKey;

            this.LineageData = await this.cloneService.GetLineage(
                {
                    EntityName: this.EntityName,
                    Key: key,
                    Direction: 'both',
                },
                this.ProviderToUse
            );
        } catch {
            this.LineageData = null;
        } finally {
            this.IsLoading = false;
            this.cdr.markForCheck();
        }
    }

    public TogglePopover(): void {
        this.IsOpen = !this.IsOpen;
        this.cdr.markForCheck();
    }

    public ClosePopover(): void {
        this.IsOpen = false;
        this.cdr.markForCheck();
    }

    public OnNavigate(item: RecordCloneLineageItem): void {
        this.ClosePopover();
        this.NavigateToRecord.emit({
            Kind: 'record',
            EntityName: item.EntityName,
            RecordKey: item.RecordID,
        });
    }
}
