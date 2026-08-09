import { MJWorkspaceTab, MJWorkspaceTabState } from './workspace-tabs.types';

/**
 * The pure, framework-free state machine behind `<mj-workspace-tab-strip>`.
 *
 * Deliberately extracted from the component so the tab semantics are exhaustively unit-testable in
 * isolation (see `__tests__/workspace-tab-store.test.ts`); the Angular shell around it stays thin.
 * No Angular, no DB, no app types — synchronous and total.
 *
 * v1 semantics: session-scoped only. Nothing here touches persistence.
 */
export class MJWorkspaceTabStore<TState = unknown> {
  private tabs: MJWorkspaceTab<TState>[] = [];
  private activeId: string | null = null;

  /** Current tabs, in strip order. Returns a copy — callers must not mutate internal state. */
  public get Tabs(): MJWorkspaceTab<TState>[] {
    return [...this.tabs];
  }

  public get ActiveId(): string | null {
    return this.activeId;
  }

  public get ActiveTab(): MJWorkspaceTab<TState> | null {
    return this.tabs.find((t) => t.Id === this.activeId) ?? null;
  }

  public get Count(): number {
    return this.tabs.length;
  }

  /** True when any tab holds unsaved edits — the "you'll lose work" signal for the host. */
  public get HasDirtyTabs(): boolean {
    return this.tabs.some((t) => t.Dirty === true);
  }

  /**
   * Add a tab and make it active. An existing tab with the same Id is NOT duplicated — it is
   * activated instead (re-opening the same draft focuses it, which is what a user means).
   */
  public Open(tab: MJWorkspaceTab<TState>): MJWorkspaceTab<TState> {
    const existing = this.tabs.find((t) => t.Id === tab.Id);
    if (existing) {
      this.activeId = existing.Id;
      return existing;
    }
    this.tabs.push(tab);
    this.activeId = tab.Id;
    return tab;
  }

  public Activate(id: string): boolean {
    if (!this.tabs.some((t) => t.Id === id)) return false;
    this.activeId = id;
    return true;
  }

  /**
   * Close a tab. When the closed tab was active, activation falls to its NEIGHBOUR — the tab to its
   * right, else the one to its left, else null. (Closing the tab you're looking at should land you
   * somewhere sensible, not on nothing.)
   */
  public Close(id: string): boolean {
    const index = this.tabs.findIndex((t) => t.Id === id);
    if (index === -1) return false;

    const wasActive = this.activeId === id;
    this.tabs.splice(index, 1);

    if (wasActive) {
      const neighbour = this.tabs[index] ?? this.tabs[index - 1] ?? null;
      this.activeId = neighbour ? neighbour.Id : null;
    }
    return true;
  }

  /** Replace a tab's host-owned payload. Marks the tab dirty unless told otherwise. */
  public UpdateState(id: string, state: TState, markDirty = true): boolean {
    const tab = this.tabs.find((t) => t.Id === id);
    if (!tab) return false;
    tab.State = state;
    if (markDirty) tab.Dirty = true;
    return true;
  }

  /** Move a tab through its lifecycle. Clears the rejection reason on any non-rejected state. */
  public SetStatus(id: string, status: MJWorkspaceTabState, rejectionReason: string | null = null): boolean {
    const tab = this.tabs.find((t) => t.Id === id);
    if (!tab) return false;
    tab.Status = status;
    tab.RejectionReason = status === 'rejected' ? rejectionReason : null;
    return true;
  }

  /** Mark a tab saved/clean without touching its payload. */
  public MarkClean(id: string): boolean {
    const tab = this.tabs.find((t) => t.Id === id);
    if (!tab) return false;
    tab.Dirty = false;
    return true;
  }

  /**
   * Move a tab from one position to another (drag-reorder). Active tab + payloads are untouched — only
   * strip ORDER changes. Out-of-range or no-op indices return false and change nothing.
   */
  public Reorder(fromIndex: number, toIndex: number): boolean {
    const n = this.tabs.length;
    if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= n || toIndex < 0 || toIndex >= n) return false;
    const [moved] = this.tabs.splice(fromIndex, 1);
    this.tabs.splice(toIndex, 0, moved);
    return true;
  }

  /** Drop every tab (session end / explicit discard-all). */
  public Clear(): void {
    this.tabs = [];
    this.activeId = null;
  }
}
