import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { WhiteboardSyncCoordinator, type SyncableBoard } from '../lib/whiteboard-sync';

/** A fake board: ToJSON returns a counter-stamped snapshot; LoadFromJSON emits Changed$ (like the real one). */
class FakeBoard implements SyncableBoard {
  public readonly Changed$ = new Subject<unknown>();
  public loaded: string | null = null;
  private version = 0;

  public ToJSON(): string {
    return `snapshot-${this.version}`;
  }
  public LoadFromJSON(json: string): boolean {
    this.loaded = json;
    this.version++;
    this.Changed$.next('load'); // the real WhiteboardState emits on load — this is what must NOT echo
    return true;
  }
  public LocalEdit(): void {
    this.version++;
    this.Changed$.next('edit');
  }
}

describe('WhiteboardSyncCoordinator', () => {
  let board: FakeBoard;
  let snapshots: string[];
  let coordinator: WhiteboardSyncCoordinator;

  beforeEach(() => {
    vi.useFakeTimers();
    board = new FakeBoard();
    snapshots = [];
    coordinator = new WhiteboardSyncCoordinator(board, 300, (json) => snapshots.push(json));
    coordinator.Start();
  });

  afterEach(() => {
    coordinator.Dispose();
    vi.useRealTimers();
  });

  it('debounces a burst of local edits into one outbound snapshot', () => {
    board.LocalEdit();
    board.LocalEdit();
    board.LocalEdit();
    expect(snapshots).toHaveLength(0); // nothing yet — still within debounce
    vi.advanceTimersByTime(300);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatch(/^snapshot-/);
  });

  it('applies a remote snapshot WITHOUT echoing it back out', async () => {
    coordinator.ApplyRemote('remote-board');
    expect(board.loaded).toBe('remote-board');
    // Let the echo-suppression microtask resolve, then flush the debounce window.
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    expect(snapshots).toHaveLength(0); // the load's Changed$ emission was suppressed
  });

  it('resumes broadcasting local edits after a remote apply', async () => {
    coordinator.ApplyRemote('remote-board');
    await Promise.resolve(); // clear applyingRemote
    board.LocalEdit();
    vi.advanceTimersByTime(300);
    expect(snapshots).toHaveLength(1);
  });

  it('ignores empty remote snapshots', () => {
    coordinator.ApplyRemote('');
    expect(board.loaded).toBeNull();
  });
});
