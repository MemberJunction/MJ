import { Component, Input, HostBinding, ElementRef, ViewChild, Output, EventEmitter } from '@angular/core';

/**
 * mj-splitter — Resizable split layout. Replaces `<kendo-splitter>`.
 *
 * @example
 * ```html
 * <mj-splitter Orientation="horizontal">
 *   <mj-splitter-pane Size="30%">Left</mj-splitter-pane>
 *   <mj-splitter-pane>Right</mj-splitter-pane>
 * </mj-splitter>
 * ```
 */
@Component({
  selector: 'mj-splitter',
  standalone: true,
  template: `
    <div class="mj-splitter" [class.mj-splitter--vertical]="Orientation === 'vertical'"
      [class.mj-splitter--horizontal]="Orientation === 'horizontal'">
      <ng-content></ng-content>
    </div>
  `
})
export class MjSplitterComponent {
  @Input() Orientation: 'horizontal' | 'vertical' = 'horizontal';
  @HostBinding('class.mj-splitter-host') readonly hostClass = true;
}

/**
 * mj-splitter-pane — A pane within mj-splitter. Replaces `<kendo-splitter-pane>`.
 */
@Component({
  selector: 'mj-splitter-pane',
  standalone: true,
  template: `<ng-content></ng-content>`,
  host: {
    'class': 'mj-splitter-pane',
    '[style.flex-basis]': 'Size || null',
    '[style.min-width]': 'Min || null',
    '[style.max-width]': 'Max || null',
    '[style.flex-grow]': 'Size ? "0" : "1"',
    '[style.flex-shrink]': 'Size ? "0" : "1"',
  }
})
export class MjSplitterPaneComponent {
  @Input() Size: string | null = null;
  @Input() Min: string | null = null;
  @Input() Max: string | null = null;
  @Input() Collapsible = false;
}
