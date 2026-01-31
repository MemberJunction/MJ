import { Component, Input, Output, EventEmitter, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';

/**
 * Internal toolbar for the generic flow editor canvas controls.
 * Provides zoom, fit-to-screen, auto-layout, and grid/minimap toggles.
 */
@Component({
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

      <div class="mj-flow-toolbar-group" *ngIf="!ReadOnly">
        <button class="mj-flow-toolbar-btn" (click)="AutoLayoutClicked.emit()" title="Auto Arrange">
          <i class="fa-solid fa-diagram-project"></i>
        </button>
      </div>

      <div class="mj-flow-toolbar-divider" *ngIf="!ReadOnly"></div>

      <div class="mj-flow-toolbar-group">
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
      </div>
    </div>
  `,
  styles: [`
    .mj-flow-toolbar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    }

    .mj-flow-toolbar-group {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .mj-flow-toolbar-divider {
      width: 1px;
      height: 20px;
      background: #e2e8f0;
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
      color: #64748b;
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 13px;

      &:hover {
        background: #f1f5f9;
        color: #334155;
      }

      &--active {
        background: #eff6ff;
        color: #3b82f6;
      }
    }

    .mj-flow-toolbar-zoom {
      font-size: 11px;
      font-weight: 500;
      color: #64748b;
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
  @Input() ReadOnly = false;

  @Output() ZoomInClicked = new EventEmitter<void>();
  @Output() ZoomOutClicked = new EventEmitter<void>();
  @Output() FitToScreenClicked = new EventEmitter<void>();
  @Output() AutoLayoutClicked = new EventEmitter<void>();
  @Output() GridToggled = new EventEmitter<boolean>();
  @Output() MinimapToggled = new EventEmitter<boolean>();
}
