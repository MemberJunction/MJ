import { Component, Input, TemplateRef } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A reusable settings card component providing consistent styling and layout
 * across all settings sections. Follows the modern AI dashboard design patterns.
 */
@Component({
  selector: 'mj-settings-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="settings-card" [class.settings-card-floating]="floating" [class.settings-card-sm]="size === 'sm'" [class.settings-card-lg]="size === 'lg'">
      @if (title || headerTemplate) {
        <div class="card-header">
          @if (headerTemplate) {
            <ng-container *ngTemplateOutlet="headerTemplate"></ng-container>
          } @else {
            <div class="header-content">
              <h3 class="card-title">{{ title }}</h3>
              @if (subtitle) {
                <p class="card-subtitle">{{ subtitle }}</p>
              }
            </div>
            @if (actionTemplate) {
              <div class="header-actions">
                <ng-container *ngTemplateOutlet="actionTemplate"></ng-container>
              </div>
            }
          }
        </div>
      }
      
      <div class="card-content" [class.no-padding]="noPadding">
        <ng-content></ng-content>
      </div>
      
      @if (footerTemplate) {
        <div class="card-footer">
          <ng-container *ngTemplateOutlet="footerTemplate"></ng-container>
        </div>
      }
    </div>
  `,
  styleUrls: ['./settings-card.component.scss']
})
export class SettingsCardComponent {
  /** Card title displayed in the header */
  @Input() title?: string;
  
  /** Card subtitle displayed below the title */
  @Input() subtitle?: string;
  
  /** Whether to use floating card style (higher elevation) */
  @Input() floating = false;
  
  /** Card size variant */
  @Input() size: 'sm' | 'md' | 'lg' = 'md';
  
  /** Whether to remove padding from content area */
  @Input() noPadding = false;
  
  /** Template for custom header content */
  @Input() headerTemplate?: TemplateRef<any>;
  
  /** Template for header action buttons */
  @Input() actionTemplate?: TemplateRef<any>;
  
  /** Template for footer content */
  @Input() footerTemplate?: TemplateRef<any>;
}