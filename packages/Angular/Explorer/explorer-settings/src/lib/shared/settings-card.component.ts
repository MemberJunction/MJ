import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'mj-settings-card',
  template: `
    <div class="settings-card" [class.expanded]="expanded">
      <div class="card-header" (click)="toggle.emit()" role="button" tabindex="0" (keydown.enter)="toggle.emit()" (keydown.space)="toggle.emit(); $event.preventDefault()">
        <div class="card-icon">
          <i [class]="icon" aria-hidden="true"></i>
        </div>
        <h3 class="card-title">{{ title }}</h3>
        <button class="expand-button" [attr.aria-expanded]="expanded" [attr.aria-label]="expanded ? 'Collapse ' + title : 'Expand ' + title" type="button">
          <i class="fa-solid fa-chevron-down" aria-hidden="true"></i>
        </button>
      </div>

      @if (expanded) {
        <div class="card-content" role="region" [attr.aria-label]="title + ' content'">
          <ng-content></ng-content>
        </div>
      }
    </div>
  `,
  styleUrls: ['./settings-card.component.css']
})
export class SettingsCardComponent {
  @Input() title = '';
  @Input() icon = '';
  @Input() expanded = false;
  @Output() toggle = new EventEmitter<void>();
}