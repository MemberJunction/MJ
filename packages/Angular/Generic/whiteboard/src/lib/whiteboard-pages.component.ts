import { AfterViewChecked, Component, ElementRef, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WhiteboardPageInfo, WhiteboardState } from './whiteboard-state';

/**
 * The PAGE STRIP (`mj-realtime-whiteboard-pages`) — a compact, OneNote-style floating
 * row of page chips on the board's bottom-left, hosted by the board surface so every
 * consumer (live host, read-only snapshot viewer) gets page navigation for free.
 *
 * Interactions:
 *  - click a chip → {@link WhiteboardState.SwitchPage};
 *  - double-click a chip → inline rename (input swap; Enter commits via
 *    {@link WhiteboardState.RenamePage}, Esc cancels);
 *  - the per-chip "×" (shown on hover when more than one page exists) →
 *    {@link WhiteboardState.RemovePage};
 *  - the trailing "+" → {@link WhiteboardState.AddPage} (auto-named "Page N").
 *
 * ReadOnly mode (artifact viewer / session review): chips still SWITCH pages — flipping
 * through a saved board is navigation, not mutation — but add / rename / delete are
 * hidden/disabled. All mutations go through the shared {@link WhiteboardState} engine,
 * so the cancelable Page* before/after events and undo behave exactly as for the agent's
 * page tools.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-pages',
  imports: [CommonModule],
  templateUrl: './whiteboard-pages.component.html',
  styleUrl: './whiteboard-pages.component.css'
})
export class RealtimeWhiteboardPagesComponent implements AfterViewChecked {
  /** Shared board state engine (owned by the integration layer, passed via the board). */
  @Input({ required: true }) State!: WhiteboardState;
  /** Read-only mode: page switching stays available; add / rename / delete do not. */
  @Input() ReadOnly = false;

  /** ID of the page being renamed inline, or null when no rename is in flight. */
  public RenamingID: string | null = null;

  private pendingFocus = false;
  private elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The board's ordered page list (re-read every CD pass — cheap snapshots). */
  public get Pages(): WhiteboardPageInfo[] {
    return this.State.Pages;
  }

  /** Whether the delete affordance renders (never on the last page, never read-only). */
  public get CanDelete(): boolean {
    return !this.ReadOnly && this.State.Pages.length > 1;
  }

  ngAfterViewChecked(): void {
    if (this.pendingFocus) {
      this.pendingFocus = false;
      const input = this.elementRef.nativeElement.querySelector<HTMLInputElement>('.wb-page-rename');
      input?.focus();
      input?.select();
    }
  }

  /** Click a chip → switch to that page (no-op when it is already active). */
  public OnChipClick(page: WhiteboardPageInfo): void {
    if (!page.Active) {
      this.State.SwitchPage(page.ID, 'user');
    }
  }

  /** Double-click a chip → swap it for the inline rename input (not in read-only). */
  public OnChipDblClick(event: Event, page: WhiteboardPageInfo): void {
    event.stopPropagation();
    if (this.ReadOnly) {
      return;
    }
    this.RenamingID = page.ID;
    this.pendingFocus = true;
  }

  /** Enter commits the rename, Esc cancels; keys never leak to the board shortcuts. */
  public OnRenameKeydown(event: KeyboardEvent, value: string): void {
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.CommitRename(value);
    }
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.RenamingID = null; // cancel — the input unmounts; its blur finds no rename in flight
    }
  }

  /** Commit the inline rename (blur or Enter). Empty input keeps the previous name. */
  public CommitRename(value: string): void {
    const id = this.RenamingID;
    this.RenamingID = null;
    if (id && value.trim().length > 0) {
      this.State.RenamePage(id, value, 'user');
    }
  }

  /** The "+" button → add an auto-named page (the engine switches to it). */
  public OnAddPage(): void {
    if (!this.ReadOnly) {
      this.State.AddPage(undefined, 'user');
    }
  }

  /** The per-chip "×" → remove the page (the engine guards the last page). */
  public OnDeletePage(event: Event, page: WhiteboardPageInfo): void {
    event.stopPropagation();
    if (!this.ReadOnly) {
      this.State.RemovePage(page.ID, 'user');
    }
  }
}
