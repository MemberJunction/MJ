import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-settings-card',
  template: `
    <div class="settings-card" [class.expanded]="expanded">
      <div class="card-header" (click)="toggle.emit()">
        <div class="card-icon">
          <i [class]="icon"></i>
        </div>
        <h3 class="card-title">{{ title }}</h3>
        <button class="expand-button" [attr.aria-expanded]="expanded">
          <i class="fa-solid fa-chevron-down"></i>
        </button>
      </div>
      
      @if (expanded) {
        <div class="card-content">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `,
  styles: [`
    .settings-card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      transition: all 0.3s ease;
      overflow: hidden;
    }

    .settings-card:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
    }

    .card-header {
      padding: 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s;
    }

    .card-header:hover {
      background-color: #f8f9fa;
    }

    .card-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #e3f2fd;
      color: #2196f3;
      font-size: 1.25rem;
      flex-shrink: 0;
    }

    .card-title {
      flex: 1;
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
      color: #1f2937;
    }

    .expand-button {
      background: none;
      border: none;
      padding: 0.5rem;
      cursor: pointer;
      color: #6b7280;
      transition: transform 0.3s ease;
    }

    .expand-button:hover {
      color: #374151;
    }

    .expanded .expand-button i {
      transform: rotate(180deg);
    }

    .card-content {
      padding: 0 1.25rem 1.25rem;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 768px) {
      .card-header {
        padding: 1rem;
      }
      
      .card-icon {
        width: 36px;
        height: 36px;
        font-size: 1.125rem;
      }
      
      .card-title {
        font-size: 1rem;
      }
    }
  `]
})
export class SettingsCardComponent {
  @Input() title = '';
  @Input() icon = '';
  @Input() expanded = false;
  @Output() toggle = new EventEmitter<void>();
}