import { Component, Input, ChangeDetectionStrategy, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CompositeKey, Metadata, EntityInfo } from '@memberjunction/core';
import { SharedService } from '@memberjunction/ng-shared';

import { BaseAngularComponent } from '@memberjunction/ng-base-types';
/**
 * A clickable pill component that displays a link to a related entity record.
 * Shows the entity icon (from metadata) and either the record name or entity name.
 * Clicking opens the entity record in a new tab.
 *
 * Usage:
 * ```html
 * <mj-entity-link-pill
 *   [entityName]="'MJ: AI Agent Runs'"
 *   [recordId]="run.TargetLogID"
 *   [recordName]="run.AgentRunName">
 * </mj-entity-link-pill>
 * ```
 */
@Component({
  standalone: false,
  selector: 'mj-entity-link-pill',
  template: `
    @if (entityInfo && recordId) {
      <span class="entity-link-pill" (click)="openRecord()" [title]="tooltipText">
        <i class="entity-icon" [ngClass]="iconClass"></i>
        <span class="entity-label">{{ displayLabel }}</span>
        <i class="fas fa-external-link-alt pill-action"></i>
      </span>
    }
    `,
  styles: [`
    .entity-link-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: color-mix(in srgb, var(--mj-brand-primary) 8%, transparent);
      border: 1px solid color-mix(in srgb, var(--mj-brand-primary) 20%, transparent);
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      color: var(--mj-brand-primary);
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
      max-width: 200px;
    }

    .entity-link-pill:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 15%, transparent);
      border-color: color-mix(in srgb, var(--mj-brand-primary) 40%, transparent);
      transform: translateY(-1px);
      box-shadow: var(--mj-shadow-sm);
    }

    .entity-icon {
      font-size: 11px;
      opacity: 0.9;
    }

    .entity-label {
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 150px;
    }

    .pill-action {
      font-size: 9px;
      opacity: 0.6;
      transition: opacity 0.2s ease;
    }

    .entity-link-pill:hover .pill-action {
      opacity: 1;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntityLinkPillComponent extends BaseAngularComponent implements OnChanges {
  /**
   * The entity name to link to (e.g., 'MJ: AI Agent Runs')
   */
  @Input() entityName: string | null = null;

  /**
   * The record ID to link to
   */
  @Input() RecordId: string | null = null;

  /** @deprecated Use {@link RecordId}. */
  @Input() set recordId(value: string | null) {
    this.RecordId = value;
  }
  /** @deprecated Use {@link RecordId}. */
  get recordId(): string | null {
    return this.RecordId;
  }

  /**
   * Optional display name for the record. If not provided, uses entity name.
   */
  @Input() RecordName: string | null = null;

  /** @deprecated Use {@link RecordName}. */
  @Input() set recordName(value: string | null) {
    this.RecordName = value;
  }
  /** @deprecated Use {@link RecordName}. */
  get recordName(): string | null {
    return this.RecordName;
  }

  EntityInfo: EntityInfo | null = null;

  /** @deprecated Use {@link EntityInfo}. */
  get entityInfo(): EntityInfo | null {
    return this.EntityInfo;
  }
  /** @deprecated Use {@link EntityInfo}. */
  set entityInfo(value: EntityInfo | null) {
    this.EntityInfo = value;
  }
  private get metadata() { return this.ProviderToUse; }
  constructor(private cdr: ChangeDetectorRef) {
    super();}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['entityName'] && this.entityName) {
      this.EntityInfo = this.metadata.EntityByName(this.entityName) ?? null;
      this.cdr.markForCheck();
    }
  }

  get IconClass(): string {
    if (this.EntityInfo?.Icon) {
      // Entity icon is typically a Font Awesome class like 'fa-robot'
      // Ensure it has the proper prefix
      const icon = this.EntityInfo.Icon;
      if (icon.startsWith('fa-')) {
        return `fas ${icon}`;
      }
      return icon;
    }
    // Default icon if none specified
    return 'fas fa-link';
  }

  /** @deprecated Use {@link IconClass}. */
  get iconClass(): string {
    return this.IconClass;
  }

  get DisplayLabel(): string {
    if (this.RecordName) {
      return this.RecordName;
    }
    if (this.EntityInfo) {
      return this.EntityInfo.Name;
    }
    return 'View Record';
  }

  /** @deprecated Use {@link DisplayLabel}. */
  get displayLabel(): string {
    return this.DisplayLabel;
  }

  get TooltipText(): string {
    const entityLabel = this.EntityInfo?.Name || 'Record';
    if (this.RecordName) {
      return `Open ${entityLabel}: ${this.RecordName}`;
    }
    return `Open ${entityLabel}`;
  }

  /** @deprecated Use {@link TooltipText}. */
  get tooltipText(): string {
    return this.TooltipText;
  }

  OpenRecord(): void {
    if (this.entityName && this.RecordId) {
      // `entityName` is an input — any entity, any key column name — so resolve the key against
      // the metadata already loaded in ngOnChanges instead of assuming `ID`.
      SharedService.Instance.OpenEntityRecord(this.entityName, CompositeKey.FromURLSegment(this.EntityInfo, this.RecordId));
    }
  }

  /** @deprecated Use {@link OpenRecord}. */
  openRecord(): void {
    return this.OpenRecord();
  }
}
