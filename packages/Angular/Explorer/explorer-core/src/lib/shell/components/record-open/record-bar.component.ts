import { Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Mobile record bar — the records region's chrome below the shell breakpoint,
 * where the golden-layout tab strip is unusable (one tab fits, the rest are
 * unreachable). Shows the ACTIVE record (entity type icon tinted with its
 * app color + title) and the open-record count; the whole bar is one button
 * that opens the record switcher sheet.
 *
 * Dumb by design: tab-container computes every input from the workspace
 * configuration (it already tracks active tab, app colors, and type icons
 * for the strip) — the bar renders and emits, nothing more.
 */
@Component({
  selector: 'mj-record-bar',
  standalone: true,
  templateUrl: './record-bar.component.html',
  styleUrls: ['./record-bar.component.css']
})
export class RecordBarComponent {
  /** Active record's title */
  @Input() Title = '';
  /** Active record's entity TYPE icon (FontAwesome classes) */
  @Input() Icon = 'fa-regular fa-file-lines';
  /** Active record's app color (runtime data — binds as an inline style) */
  @Input() Color = '';
  /** Open record count (region + docked — matches the switcher sheet rows) */
  @Input() Count = 0;

  /** The bar was tapped — open the record switcher */
  @Output() SwitcherRequested = new EventEmitter<void>();

  OnBarClick(): void {
    this.SwitcherRequested.emit();
  }
}
