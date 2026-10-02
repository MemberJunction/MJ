import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardLayoutPreviewNode } from '@memberjunction/ng-dashboard-viewer';
import { LayoutPreviewCache } from './layout-preview-cache';

/**
 * A dashboard card: picture, type chip, favorite star, name, description, meta row. The picture is
 * the dashboard's screenshot (Thumbnail), else a miniature of its saved panel layout, else an icon.
 * Presentational only; the host decides what Open and ToggleFavorite do.
 */
@Component({
  standalone: false,
  selector: 'mj-dashboard-card',
  template: `
    <article class="dc-card">
      <button type="button" class="dc-thumb" [attr.aria-label]="'Open ' + Dashboard.Name" (click)="Open.emit(Dashboard)">
        @if (Dashboard.Thumbnail) {
          <img [src]="Dashboard.Thumbnail" alt="" />
        } @else if (LayoutPreview; as preview) {
          <mj-dashboard-layout-preview [Preview]="preview"></mj-dashboard-layout-preview>
        } @else {
          <i class="fa-solid fa-gauge-high" aria-hidden="true"></i>
        }
      </button>
      <span class="dc-type">{{ TypeLabel }}</span>
      <button
        type="button"
        class="dc-star"
        [class.on]="IsFavorite"
        [attr.aria-pressed]="IsFavorite ? 'true' : 'false'"
        [attr.aria-label]="'Favorite ' + Dashboard.Name"
        (click)="ToggleFavorite.emit(Dashboard)"
      >
        <i [class]="IsFavorite ? 'fa-solid fa-star' : 'fa-regular fa-star'" aria-hidden="true"></i>
      </button>
      <div class="dc-body">
        <button type="button" class="dc-name" (click)="Open.emit(Dashboard)">{{ Dashboard.Name }}</button>
        @if (Dashboard.Description) {
          <p class="dc-desc">{{ Dashboard.Description }}</p>
        }
        <div class="dc-meta">
          <span class="dc-owner">{{ Dashboard.User }}</span>
          @if (ShowCategory && CategoryPath) {
            <span class="dc-category">{{ CategoryPath }}</span>
          }
        </div>
      </div>
    </article>
  `,
  styles: [
    `
      .dc-card {
        position: relative;
        display: flex;
        flex-direction: column;
        background: var(--mj-bg-surface);
        border: 1px solid var(--mj-border-default);
        border-radius: var(--mj-radius-lg);
        overflow: hidden;
      }
      .dc-card:hover {
        box-shadow: var(--mj-shadow-md);
      }
      .dc-thumb {
        position: relative;
        overflow: hidden;
        aspect-ratio: 16 / 9;
        width: 100%;
        border: none;
        border-bottom: 1px solid var(--mj-border-default);
        background: var(--mj-bg-surface-sunken);
        color: var(--mj-text-muted);
        font-size: 32px;
        cursor: pointer;
        padding: 0;
      }
      /* The screenshot and the layout miniature fill the 16:9 picture area, whatever the screenshot's shape. */
      .dc-thumb img,
      .dc-thumb mj-dashboard-layout-preview {
        position: absolute;
        inset: 0;
      }
      .dc-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }
      .dc-type {
        position: absolute;
        top: 8px;
        left: 8px;
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--mj-bg-surface) 92%, transparent);
        border: 1px solid var(--mj-border-default);
        color: var(--mj-text-secondary);
      }
      .dc-star {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 26px;
        height: 26px;
        border-radius: 6px;
        border: 1px solid var(--mj-border-default);
        background: color-mix(in srgb, var(--mj-bg-surface) 92%, transparent);
        color: var(--mj-text-muted);
        cursor: pointer;
      }
      .dc-star.on {
        color: var(--mj-status-warning);
      }
      .dc-body {
        padding: 10px 12px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .dc-name {
        border: none;
        background: none;
        padding: 0;
        text-align: left;
        font: inherit;
        font-size: 14px;
        font-weight: 600;
        color: var(--mj-text-primary);
        cursor: pointer;
      }
      .dc-name:hover {
        color: var(--mj-brand-primary);
      }
      .dc-desc {
        margin: 0;
        font-size: 12px;
        color: var(--mj-text-muted);
        line-height: 1.45;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .dc-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 12px;
        color: var(--mj-text-muted);
        flex-wrap: wrap;
      }
      .dc-category {
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--mj-bg-surface-sunken);
      }
    `,
  ],
})
export class DashboardCardComponent {
  @Input({ required: true }) Dashboard!: MJDashboardEntity;
  @Input() IsFavorite = false;
  @Input() ShowCategory = true;
  @Input() CategoryPath: string | null = null;
  @Output() Open = new EventEmitter<MJDashboardEntity>();
  @Output() ToggleFavorite = new EventEmitter<MJDashboardEntity>();

  private layoutPreview = new LayoutPreviewCache();

  /** The miniature of the saved panel layout the card can draw: a Config dashboard's saved panels, else null. */
  public get LayoutPreview(): DashboardLayoutPreviewNode | null {
    return this.layoutPreview.PreviewFor(this.Dashboard);
  }

  public get TypeLabel(): string {
    return this.Dashboard.Type === 'Dynamic Code' ? 'Dynamic code' : this.Dashboard.Type;
  }
}
