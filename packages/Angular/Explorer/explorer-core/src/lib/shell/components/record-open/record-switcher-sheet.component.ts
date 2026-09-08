import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MJBottomSheetComponent } from '@memberjunction/ng-ui-components';

/**
 * One row of the mobile record switcher. Built by tab-container from the
 * workspace configuration — region records AND workspace-docked records
 * (docked/region composition is a desktop concept; on mobile they are one
 * list).
 */
export interface RecordSwitcherEntry {
  TabId: string;
  Title: string;
  /** Entity TYPE icon (FontAwesome classes, via ResolveRecordTypeIcon) */
  Icon: string;
  /** App color (runtime data — binds as an inline style) */
  Color: string;
  /** Origin breadcrumb text ("Data Explorer › Data") or null when unknown */
  OriginLabel: string | null;
  IsActive: boolean;
}

/**
 * Mobile record switcher — a bottom sheet listing every open record: entity
 * icon in app color, title, origin subtitle; tap to activate, ✕ to close.
 * Opened from the record bar and the nav drawer's Records pill.
 *
 * Dumb by design: entries arrive as inputs; activation and close intents
 * emit back to tab-container, which owns the workspace/golden-layout
 * plumbing (close routes through the SAME path as the tab context menu).
 */
@Component({
  selector: 'mj-record-switcher-sheet',
  standalone: true,
  imports: [MJBottomSheetComponent],
  templateUrl: './record-switcher-sheet.component.html',
  styleUrls: ['./record-switcher-sheet.component.css']
})
export class RecordSwitcherSheetComponent {
  @Input() Entries: RecordSwitcherEntry[] = [];

  @Input() Visible = false;
  @Output() VisibleChange = new EventEmitter<boolean>();

  /** Row tapped — activate this record */
  @Output() ActivateRequested = new EventEmitter<string>();
  /** Row's ✕ tapped — close this record (sheet stays open) */
  @Output() CloseRequested = new EventEmitter<string>();

  OnSheetVisibleChange(visible: boolean): void {
    this.Visible = visible;
    this.VisibleChange.emit(visible);
  }

  OnRowClick(entry: RecordSwitcherEntry): void {
    this.ActivateRequested.emit(entry.TabId);
  }

  OnCloseClick(event: MouseEvent, entry: RecordSwitcherEntry): void {
    event.stopPropagation();
    this.CloseRequested.emit(entry.TabId);
  }
}
