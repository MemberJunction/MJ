import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { FlowLayoutDirection } from '../interfaces/flow-types';

/**
 * Internal toolbar for the generic flow editor canvas controls.
 * Provides zoom, fit-to-screen, auto-layout, LR⇄TB direction switch, and grid/minimap/legend toggles.
 */
@Component({
  standalone: false,
  selector: 'mj-flow-toolbar',
  template: `
    <div class="mj-flow-toolbar">
      <div class="mj-flow-toolbar-group">
        <button class="mj-flow-toolbar-btn" (click)="ZoomInClicked.emit()" title="Zoom In">
          <i class="fa-solid fa-magnifying-glass-plus"></i>
        </button>
        <span class="mj-flow-toolbar-zoom">{{ ZoomLevel }}%</span>
        <button class="mj-flow-toolbar-btn" (click)="ZoomOutClicked.emit()" title="Zoom Out">
          <i class="fa-solid fa-magnifying-glass-minus"></i>
        </button>
        <button class="mj-flow-toolbar-btn" (click)="FitToScreenClicked.emit()" title="Fit to Screen">
          <i class="fa-solid fa-expand"></i>
        </button>
      </div>

      <div class="mj-flow-toolbar-divider"></div>

      <div class="mj-flow-toolbar-group">
        <button class="mj-flow-toolbar-btn"
          [class.mj-flow-toolbar-btn--active]="!PanMode"
          (click)="PanModeToggled.emit(false)"
          title="Select Mode (pointer)">
          <i class="fa-solid fa-arrow-pointer"></i>
        </button>
        <button class="mj-flow-toolbar-btn"
          [class.mj-flow-toolbar-btn--active]="PanMode"
          (click)="PanModeToggled.emit(true)"
          title="Pan Mode (drag to move canvas)">
          <i class="fa-solid fa-hand"></i>
        </button>
      </div>

      @if (!ReadOnly) {
        <div class="mj-flow-toolbar-divider"></div>
      }

      @if (!ReadOnly) {
        <div class="mj-flow-toolbar-group">
          <button class="mj-flow-toolbar-btn" (click)="AutoLayoutClicked.emit()" title="Auto Arrange">
            <i class="fa-solid fa-diagram-project"></i>
          </button>
        </div>
      }

      <div class="mj-flow-toolbar-divider"></div>

      <div class="mj-flow-toolbar-group">
        <button class="mj-flow-toolbar-btn mj-flow-toolbar-btn--dir"
          (click)="LayoutDirectionToggled.emit(LayoutDirection === 'horizontal' ? 'vertical' : 'horizontal')"
          [title]="LayoutDirection === 'horizontal' ? 'Switch layout to Top-to-Bottom (TB)' : 'Switch layout to Left-to-Right (LR)'">
          <i class="fa-solid" [class.fa-arrows-left-right]="LayoutDirection === 'horizontal'" [class.fa-arrows-up-down]="LayoutDirection !== 'horizontal'"></i>
        </button>
        <button class="mj-flow-toolbar-btn"
          [class.mj-flow-toolbar-btn--active]="ShowGrid"
          (click)="GridToggled.emit(!ShowGrid)"
          title="Toggle Grid">
          <i class="fa-solid fa-border-all"></i>
        </button>
        <button class="mj-flow-toolbar-btn"
          [class.mj-flow-toolbar-btn--active]="ShowMinimap"
          (click)="MinimapToggled.emit(!ShowMinimap)"
          title="Toggle Minimap">
          <i class="fa-solid fa-map"></i>
        </button>
        <button class="mj-flow-toolbar-btn"
          [class.mj-flow-toolbar-btn--active]="ShowLegend"
          (click)="LegendToggled.emit(!ShowLegend)"
          title="Toggle Legend">
          <i class="fa-solid fa-list-check"></i>
        </button>
      </div>

      <div class="mj-flow-toolbar-divider"></div>

      <div class="mj-flow-toolbar-group">
        <button class="mj-flow-toolbar-btn" (click)="MinimizeClicked.emit()"
                title="Minimize toolbar" aria-label="Minimize toolbar">
          <i class="fa-solid fa-compress"></i>
        </button>
        <button class="mj-flow-toolbar-btn" (click)="HideClicked.emit()"
                title="Hide toolbar" aria-label="Hide toolbar">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
    `,
  styles: [`
    .mj-flow-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: color-mix(in srgb, var(--mj-bg-surface-elevated) 92%, transparent);
      backdrop-filter: blur(8px);
      border: 1px solid var(--mj-border-default);
      border-radius: var(--mj-radius-md);
      box-shadow: var(--mj-shadow-md);
    }

    .mj-flow-toolbar-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .mj-flow-toolbar-divider {
      width: 1px;
      height: 20px;
      background: var(--mj-border-default);
      margin: 0 4px;
    }

    .mj-flow-toolbar-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--mj-text-secondary);
      cursor: pointer;
      transition: background-color var(--mj-transition-fast), color var(--mj-transition-fast);
      font-size: 13px;
    }

    .mj-flow-toolbar-btn:hover {
      background: var(--mj-bg-surface-hover);
      color: var(--mj-text-primary);
    }

    .mj-flow-toolbar-btn--active {
      background: color-mix(in srgb, var(--mj-brand-primary) 14%, transparent);
      color: var(--mj-brand-primary);
    }

    .mj-flow-toolbar-btn--active:hover {
      background: color-mix(in srgb, var(--mj-brand-primary) 22%, transparent);
      color: var(--mj-brand-primary-hover);
    }

    .mj-flow-toolbar-zoom {
      font-family: var(--mj-font-family-mono);
      font-size: 11px;
      font-weight: var(--mj-font-medium);
      color: var(--mj-text-muted);
      min-width: 38px;
      text-align: center;
      user-select: none;
    }
  `],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FlowToolbarComponent {
  @Input() ZoomLevel = 100;
  @Input() ShowGrid = true;
  @Input() ShowMinimap = true;
  @Input() ShowLegend = true;
  @Input() ReadOnly = false;
  @Input() PanMode = false;
  @Input() LayoutDirection: FlowLayoutDirection = 'vertical';

  @Output() ZoomInClicked = new EventEmitter<void>();
  @Output() ZoomOutClicked = new EventEmitter<void>();
  @Output() FitToScreenClicked = new EventEmitter<void>();
  @Output() AutoLayoutClicked = new EventEmitter<void>();
  @Output() LayoutDirectionToggled = new EventEmitter<FlowLayoutDirection>();
  @Output() GridToggled = new EventEmitter<boolean>();
  @Output() MinimapToggled = new EventEmitter<boolean>();
  @Output() LegendToggled = new EventEmitter<boolean>();
  @Output() PanModeToggled = new EventEmitter<boolean>();
  @Output() MinimizeClicked = new EventEmitter<void>();
  @Output() HideClicked = new EventEmitter<void>();
}
