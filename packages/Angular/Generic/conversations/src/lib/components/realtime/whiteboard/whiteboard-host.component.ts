import {
  ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output,
  ViewChild, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { WhiteboardState } from './whiteboard-state';
import { ApplyWhiteboardAgentTool, WHITEBOARD_TOOL_NAMES, WhiteboardToolResult } from './whiteboard-tools';
import { RealtimeWhiteboardBoardComponent, WhiteboardAgentPresence } from './whiteboard-board.component';
import { RealtimeWhiteboardToolbarComponent, WhiteboardTool, WHITEBOARD_PEN_COLORS } from './whiteboard-toolbar.component';
import { RealtimeWhiteboardZoomComponent } from './whiteboard-zoom.component';
import { RealtimeWhiteboardAgentSeesPopoverComponent } from './whiteboard-agent-sees-popover.component';

/** Debounce window for the perception feed (the popover's "debounce 750 ms" stat). */
const SCENE_DELTA_DEBOUNCE_MS = 750;
/** How long the agent-action toast stays up (coalescing further actions while visible). */
const TOAST_MS = 6000;
/** How long the presence cursor lingers after the agent's last board action. */
const PRESENCE_MS = 4200;

/**
 * LIVE WHITEBOARD host (`mj-realtime-whiteboard-host`): board header (title / saved chip /
 * ownership legend / "What [Agent] sees" popover / Focus toggle), the board surface with its
 * floating toolbar + zoom cluster, the agent action toast with Undo, and the status footer —
 * everything EXCEPT the overlay/tab chrome, which the session shell owns.
 *
 * Integration contract:
 *  - `State` is created by the integration layer (channel state of record) and passed in;
 *  - `SceneDelta` emits the debounced (750 ms), coalesced scene-delta JSON on user changes —
 *    the perception feed the integration pipes into the live agent context;
 *  - `ApplyAgentTool(toolName, argsJson)` executes one agent channel tool
 *    (`Whiteboard.AddNote` … see `WHITEBOARD_TOOL_DEFINITIONS`) with the violet pop-in,
 *    toast and presence-cursor garnish, returning the result JSON for the tool round-trip;
 *  - `AgentUndo` fires when the user clicks Undo on the agent-action toast;
 *  - `FocusModeChange` asks the shell to collapse/restore the call rail ("Focus board").
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-whiteboard-host',
  imports: [
    CommonModule,
    RealtimeWhiteboardBoardComponent,
    RealtimeWhiteboardToolbarComponent,
    RealtimeWhiteboardZoomComponent,
    RealtimeWhiteboardAgentSeesPopoverComponent
  ],
  templateUrl: './whiteboard-host.component.html',
  styleUrl: './whiteboard-host.component.css'
})
export class RealtimeWhiteboardHostComponent implements OnInit, OnDestroy {
  /** Shared board state engine, owned by the integration layer. */
  @Input({ required: true }) State!: WhiteboardState;
  /** Display name of the session's agent (legend, chips, popover, toast). */
  @Input() AgentName = 'Agent';
  /** Board title shown in the header. */
  @Input() BoardTitle = 'Whiteboard';
  /** Persistence chip text (e.g. "Saved to session · v14"). */
  @Input() SavedLabel = 'Saved to session';

  /** Debounced (750 ms), coalesced scene-delta JSON — the live perception feed. */
  @Output() SceneDelta = new EventEmitter<string>();
  /** The user clicked Undo on the agent-action toast (the undo itself already applied). */
  @Output() AgentUndo = new EventEmitter<void>();
  /** Focus-board toggle — the session shell collapses/restores the call rail. */
  @Output() FocusModeChange = new EventEmitter<boolean>();

  @ViewChild(RealtimeWhiteboardBoardComponent) public Board?: RealtimeWhiteboardBoardComponent;

  // tool state (host-owned; toolbar + keyboard drive it, board consumes it)
  public Tool: WhiteboardTool = 'select';
  public PenColor: string = WHITEBOARD_PEN_COLORS[0];
  public PenWidth = 4;
  public ShapeKind: 'rect' | 'ellipse' | 'diamond' = 'rect';

  // header state
  public SeesOpen = false;
  public FocusMode = false;

  // agent garnish state
  public AgentPresence: WhiteboardAgentPresence | null = null;
  public ToastText: string | null = null;
  private toastPhrases: string[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;

  // perception feed state
  public LastDeltaJson = '';
  private lastDeltaToken = 0;
  private lastDeltaAt: number | null = null;
  private deltaTimer: ReturnType<typeof setTimeout> | null = null;

  // "synced n s ago" ticker
  public NowTick = Date.now();
  private ticker: ReturnType<typeof setInterval> | null = null;

  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe((change) => {
      // perception feed: user edits (and scene replacements like undo) schedule a delta
      if (change.Author === 'user' || change.Op === 'replace') {
        this.scheduleSceneDelta();
      }
      this.cdr.markForCheck();
    });
    this.ticker = setInterval(() => {
      this.NowTick = Date.now();
      this.cdr.markForCheck();
    }, 1000);
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer);
    }
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    if (this.presenceTimer) {
      clearTimeout(this.presenceTimer);
    }
    if (this.ticker) {
      clearInterval(this.ticker);
    }
  }

  // ────────────────────────────────────────────── AGENT tool entry point

  /**
   * Execute one agent whiteboard tool (author `'agent'`, one undo batch), with the UI
   * garnish: presence cursor glides to the mutation point, the new item pops in violet,
   * and the action toast (with Undo) appears. Returns the result JSON string that the
   * integration layer feeds back to the realtime model as the `tool_response`.
   */
  public ApplyAgentTool(toolName: string, argsJson: string): string {
    const resultJson = ApplyWhiteboardAgentTool(this.State, toolName, argsJson);
    let result: WhiteboardToolResult | null = null;
    try {
      result = JSON.parse(resultJson) as WhiteboardToolResult;
    }
    catch {
      result = null;
    }
    if (result?.success) {
      this.showAgentPresence(result.itemId);
      this.pushToastPhrase(RealtimeWhiteboardHostComponent.toolPhrase(toolName));
    }
    this.cdr.markForCheck();
    return resultJson;
  }

  // ────────────────────────────────────────────── header actions

  public ToggleSees(event: Event): void {
    event.stopPropagation();
    this.SeesOpen = !this.SeesOpen;
  }

  @HostListener('document:click')
  public CloseSees(): void {
    if (this.SeesOpen) {
      this.SeesOpen = false;
    }
  }

  public ToggleFocus(): void {
    this.FocusMode = !this.FocusMode;
    this.FocusModeChange.emit(this.FocusMode);
  }

  // ────────────────────────────────────────────── toast

  public OnToastUndo(event: Event): void {
    event.stopPropagation();
    // The agent's tool call ran as ONE undo batch, so a single Undo reverts it whole.
    this.State.Undo();
    this.hideToast();
    this.AgentUndo.emit();
  }

  // ────────────────────────────────────────────── keyboard shortcuts

  @HostListener('document:keydown', ['$event'])
  public OnKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.State.Redo();
      }
      else {
        this.State.Undo();
      }
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.State.Redo();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    switch (event.key) {
      case 'Escape':
        this.Tool = 'select';
        this.Board?.CancelTransient();
        this.State.Select(null);
        break;
      case 'Delete':
      case 'Backspace':
        if (this.State.SelectedID) {
          event.preventDefault();
          this.State.RemoveItem(this.State.SelectedID, 'user');
        }
        break;
      default: {
        const tool = RealtimeWhiteboardHostComponent.toolForKey(event.key);
        if (tool) {
          this.Tool = tool;
        }
        break;
      }
    }
  }

  // ────────────────────────────────────────────── status footer / popover bindings

  public get ElementCount(): number {
    return this.State.ElementCount;
  }

  public get UserCount(): number {
    return this.State.CountByAuthor('user');
  }

  public get AgentCount(): number {
    return this.State.CountByAuthor('agent');
  }

  public get CurrentSeq(): number {
    return this.State.CurrentSeq;
  }

  /** "2 s ago" style age of the last emitted delta (the ticker keeps it fresh). */
  public get LastDeltaLabel(): string {
    if (this.lastDeltaAt == null) {
      return '—';
    }
    const seconds = Math.max(0, Math.round((this.NowTick - this.lastDeltaAt) / 1000));
    if (seconds < 60) {
      return `${seconds} s ago`;
    }
    return `${Math.floor(seconds / 60)} min ago`;
  }

  public get SceneDeltaDebounceMs(): number {
    return SCENE_DELTA_DEBOUNCE_MS;
  }

  // ────────────────────────────────────────────── internals

  private scheduleSceneDelta(): void {
    if (this.deltaTimer) {
      clearTimeout(this.deltaTimer);
    }
    this.deltaTimer = setTimeout(() => {
      this.deltaTimer = null;
      this.emitSceneDelta();
    }, SCENE_DELTA_DEBOUNCE_MS);
  }

  private emitSceneDelta(): void {
    const delta = this.State.BuildSceneDelta(this.lastDeltaToken);
    this.lastDeltaToken = this.State.CurrentSeq;
    this.lastDeltaAt = Date.now();
    this.LastDeltaJson = JSON.stringify(delta, null, 2);
    this.SceneDelta.emit(JSON.stringify(delta));
    this.cdr.markForCheck();
  }

  private showAgentPresence(itemId: string | undefined): void {
    let x = 480;
    let y = 220;
    const item = itemId ? this.State.GetItem(itemId) : undefined;
    if (item) {
      const b = this.State.ItemBounds(item);
      x = b.X + b.W + 14;
      y = b.Y + b.H / 2 - 13;
    }
    this.AgentPresence = { Active: true, X: x, Y: y, Label: `${this.AgentName} is drawing…` };
    if (this.presenceTimer) {
      clearTimeout(this.presenceTimer);
    }
    this.presenceTimer = setTimeout(() => {
      this.AgentPresence = null;
      this.cdr.markForCheck();
    }, PRESENCE_MS);
  }

  private pushToastPhrase(phrase: string): void {
    if (!this.ToastText) {
      this.toastPhrases = [];
    }
    if (!this.toastPhrases.includes(phrase)) {
      this.toastPhrases.push(phrase);
    }
    const joined = this.toastPhrases.length > 1
      ? `${this.toastPhrases.slice(0, -1).join(', ')} & ${this.toastPhrases[this.toastPhrases.length - 1]}`
      : this.toastPhrases[0];
    this.ToastText = `${this.AgentName} ${joined} · just now`;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.hideToast(), TOAST_MS);
  }

  private hideToast(): void {
    this.ToastText = null;
    this.toastPhrases = [];
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.cdr.markForCheck();
  }

  private static toolPhrase(toolName: string): string {
    switch (toolName) {
      case WHITEBOARD_TOOL_NAMES.AddNote: return 'added a note';
      case WHITEBOARD_TOOL_NAMES.AddShape: return 'added a shape';
      case WHITEBOARD_TOOL_NAMES.AddText: return 'added a label';
      case WHITEBOARD_TOOL_NAMES.DrawConnector: return 'added a connector';
      case WHITEBOARD_TOOL_NAMES.Highlight: return 'highlighted a region';
      case WHITEBOARD_TOOL_NAMES.MoveItem: return 'moved an item';
      case WHITEBOARD_TOOL_NAMES.RemoveItem: return 'removed an item';
      default: return 'updated the board';
    }
  }

  private static toolForKey(key: string): WhiteboardTool | null {
    switch (key.toLowerCase()) {
      case 'v': return 'select';
      case 'h': return 'pan';
      case 'p': return 'pen';
      case 'r': return 'shape';
      case 's': return 'sticky';
      case 't': return 'text';
      case 'i': return 'image';
      case 'c': return 'connector';
      case 'e': return 'eraser';
      default: return null;
    }
  }
}
