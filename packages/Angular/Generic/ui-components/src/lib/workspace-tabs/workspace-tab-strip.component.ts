import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDropList, CdkDrag, CdkDragDrop } from '@angular/cdk/drag-drop';
import { MJWorkspaceTab } from './workspace-tabs.types';
import { MJWorkspaceTipDirective } from './workspace-tip.directive';
import { MJTabListDirective, MJTabListRequest } from '../tabs/tab-list.directive';

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
 *  - tabs size to their text up to `--mj-tab-max`, then ellipsize; the inline unsaved-dot pushes the label;
 *  - the tab body keeps the default arrow cursor (like browser tabs);
 *  - the full label shows via the reusable `mjTip` tooltip when a tab is truncated (delayed, non-interactive);
 *  - drag-reorder via CDK, emitted as intent for the host to apply to its store.
 *
 * **Appearance and keyboard behaviour are NOT owned here.** The look comes from the global
 * `.mj-tabs*` chrome in `tabs.scss`, and the ARIA tabs keyboard contract from `mjTabList` — both
 * shared with `mj-tabstrip`, so the two strips cannot drift apart visually or behaviourally even
 * though they keep different state models.
 */
@Component({
  standalone: true,
  selector: 'mj-workspace-tab-strip',
  imports: [CommonModule, CdkDropList, CdkDrag, MJWorkspaceTipDirective, MJTabListDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mj-tabs mj-tabs__bar">
      <div
        class="mj-tabs__list"
        mjTabList
        (TabActivateRequested)="onActivateRequested($event)"
        (TabCloseRequested)="onCloseRequested($event)"
        cdkDropList
        cdkDropListOrientation="horizontal"
        (cdkDropListDropped)="onDrop($event)">
        @for (tab of Tabs; track tab.Id) {
          <!-- role="tab" sits on the FOCUSABLE element, not on a wrapper around one. tabindex is
               owned by mjTabList (roving), so it is deliberately not bound here. The accessible
               name folds in the unsaved/rejected state, because those are conveyed visually by a
               dot and a colour that a screen reader cannot see. -->
          <div
            class="mj-tabs__tab"
            cdkDrag
            [class.mj-tabs__tab--active]="tab.Id === ActiveId"
            [class.mj-tabs__tab--rejected]="tab.Status === 'rejected'"
            [class.mj-tabs__tab--complete]="tab.Status === 'complete'"
            role="tab"
            [attr.aria-selected]="tab.Id === ActiveId"
            [attr.aria-label]="tabAccessibleName(tab)"
            (click)="TabSelected.emit(tab.Id)">
            @if (tab.Icon) {
              <i [class]="tab.Icon" class="mj-tabs__icon" aria-hidden="true"></i>
            }
            @if (tab.Status === 'rejected') {
              <i class="fa-solid fa-triangle-exclamation mj-tabs__status-icon" aria-hidden="true"></i>
            }
            <span class="mj-tabs__label" [mjTip]="tab.Label">{{ tab.Label }}</span>
            @if (tab.Dirty) {
              <!-- Inline dot (no reserved slot): it PUSHES the label, so the ellipsis shifts left on
                   a capped tab and a short tab grows by the dot's width. Silent to assistive tech —
                   the state is already in the tab's accessible name. -->
              <span class="mj-tabs__dirty" aria-hidden="true">&bull;</span>
            }
            <!-- tabindex="-1": the TAB is the focus stop and Delete closes it, so a second stop per
                 tab would double the length of the strip in the page tab order. -->
            <button
              type="button"
              class="mj-tabs__close"
              tabindex="-1"
              [attr.aria-label]="'Close ' + tab.Label"
              (click)="onCloseClick($event, tab.Id)">
              <i class="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        }
      </div>
      @if (ShowNewTab) {
        <button type="button" class="mj-tabs__new" (click)="NewTabRequested.emit()" [attr.aria-label]="NewTabLabel">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span>{{ NewTabLabel }}</span>
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

  /**
   * The tab's accessible name. The dirty dot and the rejected colour/icon are the only signals for
   * those states, and neither survives being read aloud — so they are spelled out here instead.
   */
  public tabAccessibleName(tab: MJWorkspaceTab): string {
    const parts = [tab.Label];
    if (tab.Status === 'rejected') parts.push('(rejected)');
    if (tab.Dirty) parts.push('(unsaved changes)');
    return parts.join(' ');
  }

  /** Keyboard arrow/Home/End/Enter from `mjTabList` — map the position back onto our id. */
  public onActivateRequested(request: MJTabListRequest): void {
    const tab = this.Tabs[request.Index];
    if (tab) {
      this.TabSelected.emit(tab.Id);
    }
  }

  /** Delete/Backspace on a focused tab — the APG close gesture for a closeable tab. */
  public onCloseRequested(request: MJTabListRequest): void {
    const tab = this.Tabs[request.Index];
    if (tab) {
      this.TabClosed.emit(tab.Id);
    }
  }

  /** The close button sits inside the tab, so its click would otherwise also select the tab. */
  public onCloseClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.TabClosed.emit(id);
  }
}
