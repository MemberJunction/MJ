import { Component, Input, HostBinding } from '@angular/core';

export type MjProgressBarType = 'value' | 'infinite';

/**
 * mj-progress-bar — Progress indicator. Replaces `<kendo-progressbar>`.
 */
@Component({
  selector: 'mj-progress-bar',
  standalone: true,
  template: `
    @if (Type === 'infinite') {
      <div class="mj-progress-bar mj-progress-bar--infinite" role="progressbar" aria-label="Loading">
        <div class="mj-progress-bar-indeterminate"></div>
      </div>
    } @else {
      <progress class="mj-progress-bar" [attr.value]="ClampedValue" max="100"
        role="progressbar" [attr.aria-valuenow]="ClampedValue" aria-valuemin="0" aria-valuemax="100">
        {{ ClampedValue }}%
      </progress>
    }
  `
})
export class MJProgressBarComponent {
  @Input() Value: number = 0;
  @Input() Type: MjProgressBarType = 'value';
  @HostBinding('class.mj-progress-bar-host') readonly hostClass = true;
  get ClampedValue(): number { return Math.max(0, Math.min(100, this.Value)); }
}
