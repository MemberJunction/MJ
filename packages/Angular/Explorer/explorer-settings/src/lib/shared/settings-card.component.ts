import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  standalone: false,
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
  @Input() Title = '';

  /** @deprecated Use {@link Title}. */
  @Input() set title(value: SettingsCardComponent['Title']) {
    this.Title = value;
  }
  /** @deprecated Use {@link Title}. */
  get title(): SettingsCardComponent['Title'] {
    return this.Title;
  }
  @Input() Icon = '';

  /** @deprecated Use {@link Icon}. */
  @Input() set icon(value: SettingsCardComponent['Icon']) {
    this.Icon = value;
  }
  /** @deprecated Use {@link Icon}. */
  get icon(): SettingsCardComponent['Icon'] {
    return this.Icon;
  }
  @Input() Expanded = false;

  /** @deprecated Use {@link Expanded}. */
  @Input() set expanded(value: SettingsCardComponent['Expanded']) {
    this.Expanded = value;
  }
  /** @deprecated Use {@link Expanded}. */
  get expanded(): SettingsCardComponent['Expanded'] {
    return this.Expanded;
  }
  @Output() Toggle = new EventEmitter<void>();

  /**
   * @deprecated Use {@link Toggle}.
   *
   * The same emitter under the old binding name, so a template still binding
   * (toggle) keeps working. Must stay AFTER Toggle: class fields
   * initialise in order, and the other way round this captures undefined.
   */
  @Output() toggle = this.Toggle;
}