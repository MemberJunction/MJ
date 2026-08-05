import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { MJWorkspaceTab } from './workspace-tabs.types';
import { MJWorkspaceTipDirective } from './workspace-tip.directive';

/** A drag-reorder request from the strip: move the tab at `previousIndex` to `currentIndex`. */
export interface MJTabReorder {
  previousIndex: number;
  currentIndex: number;
}

/**
 * `<mj-workspace-tab-strip>` — browser-style draft tabs, presentation over `MJWorkspaceTabStore`.
 *
 * Dumb by design: it renders the tabs it is handed and emits intent. The store holds the state
 * machine; the host owns what a tab's payload means. That split keeps it app-agnostic.
 *
 * **Browser-tab behavior lives HERE** so every consumer inherits it:
 *  - pinned new-tab button; the tab LIST scrolls horizontally *behind* it on overflow;
 *  - tabs size to their text up to `--ws-tab-max`, then ellipsize; the inline unsaved-dot pushes the label;
 *  - the tab body keeps the default arrow cursor (like browser tabs);
 *  - the full label shows via the reusable `mjTip` tooltip when a tab is truncated (delayed, non-interactive);
 *  - drag-reorder via CDK, emitted as intent for the host to apply to its store.
 */
@Component({
  standalone: true,
  selector: 'mj-workspace-tab-strip',
  imports: [CommonModule, CdkDropList, CdkDrag, MJWorkspaceTipDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-tabbar">
      <div
        class="ws-tabs"
        role="tablist"
        cdkDropList
        cdkDropListOrientation="horizontal"
        (cdkDropListDropped)="onDrop($event)">
        @for (tab of Tabs; track tab.Id) {
          <div
            class="ws-tab"
            cdkDrag
            [class.ws-tab--active]="tab.Id === ActiveId"
            [class.ws-tab--rejected]="tab.Status === 'rejected'"
            [class.ws-tab--complete]="tab.Status === 'complete'"
            role="tab"
            [attr.aria-selected]="tab.Id === ActiveId">
            <button type="button" class="ws-tab__select" (click)="TabSelected.emit(tab.Id)">
              @if (tab.Icon) {
                <i [class]="tab.Icon" aria-hidden="true"></i>
              }
              @if (tab.Status === 'rejected') {
                <i class="fa-solid fa-triangle-exclamation ws-tab__reject-icon" aria-hidden="true"></i>
              }
              <span class="ws-tab__label" [mjTip]="tab.Label">{{ tab.Label }}</span>
              @if (tab.Dirty) {
                <!-- Inline dot (no reserved slot): it PUSHES the label, so the ellipsis shifts left on a
                     capped tab and a short tab grows by the dot's width. -->
                <span class="ws-tab__dirty" aria-label="unsaved changes">&bull;</span>
              }
            </button>
            <button
              type="button"
              class="ws-tab__close"
              [attr.aria-label]="'Close ' + tab.Label"
              (click)="TabClosed.emit(tab.Id)">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        }
      </div>
      @if (ShowNewTab) {
        <button type="button" class="ws-tabs__new" (click)="NewTabRequested.emit()" [attr.aria-label]="NewTabLabel">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span class="ws-tabs__new-label">{{ NewTabLabel }}</span>
        </button>
      }
    </div>
  `,
  styleUrls: ['./workspace-tab-strip.component.css'],
})
export class MJWorkspaceTabStripComponent {
  @Input() Tabs: MJWorkspaceTab[] = [];
  @Input() ActiveId: string | null = null;
  @Input() ShowNewTab = true;
  @Input() NewTabLabel = 'New';

  @Output() TabSelected = new EventEmitter<string>();
  @Output() TabClosed = new EventEmitter<string>();
  @Output() NewTabRequested = new EventEmitter<void>();
  @Output() TabReordered = new EventEmitter<MJTabReorder>();

  /** CDK drop — emit the reorder intent; the host applies it to the store (the strip stays dumb). */
  public onDrop(event: CdkDragDrop<MJWorkspaceTab[]>): void {
    if (event.previousIndex !== event.currentIndex) {
      this.TabReordered.emit({ previousIndex: event.previousIndex, currentIndex: event.currentIndex });
    }
  }
}
