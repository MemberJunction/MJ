import {
  Component, EventEmitter, Input, Output, ElementRef, ViewChild, AfterViewChecked, OnInit, OnDestroy,
  ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MarkdownModule } from '@memberjunction/ng-markdown';
import { Subscription } from 'rxjs';
import { RealtimeSessionState, RealtimeThreadItem } from './realtime-session-state';
import { RealtimeDelegationCardComponent } from './realtime-delegation-card.component';
import { ParsedDelegationArtifact } from '@memberjunction/realtime-runtime';

function isBlank(c: string): boolean {
  return c === ' ' || c === '\t';
}

/** Index just past the spaces and tabs starting at `from`. */
function skipBlanks(text: string, from: number): number {
  let i = from;
  while (i < text.length && isBlank(text[i])) {
    i++;
  }
  return i;
}

/** Index past an optional `—` and the whitespace after it (the `(?:—\s*)?` of a pattern). */
function skipEmDash(text: string, at: number): number {
  if (text[at] !== '—') {
    return at;
  }
  let i = at + 1;
  while (i < text.length && /\s/.test(text[i])) {
    i++;
  }
  return i;
}

/** What a {@link replaceAfterBlankRuns} tail matched: the text to write and where the match ends. */
interface BlankRunTail {
  Replacement: string;
  End: number;
}

/**
 * Replace each run of spaces or tabs that `tail` accepts, together with what `tail` matched after it,
 * left to right. This is `.replace(/[ \t]+<tail>/g, …)` for a tail that cannot start with a space or
 * tab, scanned once: the regex retries from every position inside a long run of spaces with no tail
 * after it, which is quadratic (CodeQL js/polynomial-redos). A match can only start where a run
 * starts, since starting later reaches the same run end.
 */
function replaceAfterBlankRuns(text: string, tail: (text: string, at: number) => BlankRunTail | null): string {
  let out = '';
  let copied = 0;
  let i = 0;
  while (i < text.length) {
    if (!isBlank(text[i])) {
      i++;
      continue;
    }
    const runStart = i;
    i = skipBlanks(text, i);
    const match = tail(text, i);
    if (match) {
      out += text.slice(copied, runStart) + match.Replacement;
      copied = match.End;
      i = match.End;
    }
  }
  return out + text.slice(copied);
}

/** `(?:—\s*)?(#{1,6}[ \t]+)` → a blank line, then the hashes and their spaces. */
function headingTail(text: string, at: number): BlankRunTail | null {
  const start = skipEmDash(text, at);
  let hashEnd = start;
  while (hashEnd < text.length && text[hashEnd] === '#') {
    hashEnd++;
  }
  const hashes = hashEnd - start;
  if (hashes < 1 || hashes > 6 || !isBlank(text[hashEnd] ?? '')) {
    return null;
  }
  const end = skipBlanks(text, hashEnd);
  return { Replacement: '\n\n' + text.slice(start, end), End: end };
}

/** `(?:—\s*)?(---|___|\*\*\*)[ \t]*` → the rule on its own paragraph. */
function ruleTail(text: string, at: number): BlankRunTail | null {
  const start = skipEmDash(text, at);
  const rule = ['---', '___', '***'].find((r) => text.startsWith(r, start));
  if (!rule) {
    return null;
  }
  return { Replacement: `\n\n${rule}\n\n`, End: skipBlanks(text, start + rule.length) };
}

/** `-[ \t]+(?=[A-Za-z0-9\*])` → a new `- ` list line. */
function bulletTail(text: string, at: number): BlankRunTail | null {
  if (text[at] !== '-') {
    return null;
  }
  const end = skipBlanks(text, at + 1);
  if (end === at + 1 || !/[A-Za-z0-9*]/.test(text[end] ?? '')) {
    return null;
  }
  return { Replacement: '\n- ', End: end };
}

/**
 * The unified, chronological live thread for the call overlay: caption bubbles
 * interleaved with delegation cards exactly where they happened.
 *
 * PURELY PRESENTATIONAL over {@link RealtimeSessionState} — the overlay shell owns the
 * state object (which merges the service streams once) and passes it here AND to the
 * activity rail, so there is exactly one copy of the per-CallID merge logic.
 *
 * Also renders the EPHEMERAL narration "live note": indented, muted, italic text under
 * the ACTIVE working card (latest narration only — replaced, never accumulated).
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-session-thread',
  imports: [CommonModule, RealtimeDelegationCardComponent, MarkdownModule],
  templateUrl: './realtime-session-thread.component.html',
  styleUrl: './realtime-session-thread.component.css'
})
export class RealtimeSessionThreadComponent implements OnInit, AfterViewChecked, OnDestroy {
  @ViewChild('scrollAnchor') private scrollAnchor?: ElementRef<HTMLElement>;

  /** Display name of the agent (caption avatar / meta line). */
  @Input() AgentName = 'Sage';

  /**
   * Display name of the signed-in user for their turns — consistent with the main
   * chat's sender names, and ready for multi-user sessions where "You" stops meaning
   * anything. Hosts bind the current user's name; the default keeps old hosts working.
   */
  @Input() UserName = 'You';

  /** Shared live-session state, owned by the overlay shell. */
  @Input({ required: true }) State!: RealtimeSessionState;

  /** Whether to render caption bubbles (toggled by the controls' captions button). */
  @Input() ShowCaptions = true;

  /** Whether developer affordances on delegation cards are revealed (gear-gated). */
  @Input() DevMode = false;

  /** Whether inline markdown links in caption bubbles open in a new browser tab. Default true. */
  @Input() OpenLinksInNewTab = true;

  /** Re-emitted from a delegation card's dev "Open run" link (the delegated run's ID). */
  @Output() OpenRunRequested = new EventEmitter<string>();

  /** Re-emitted from a delegation card's "View" artifact chip (focuses the artifact's surface tab). */
  @Output() OpenArtifactRequested = new EventEmitter<ParsedDelegationArtifact>();

  /** Re-emitted from a WORKING delegation card's ✕ cancel affordance (the call's ID). */
  @Output() CancelRequested = new EventEmitter<string>();

  /** Item count at the last change notification, to auto-scroll only when the list grows. */
  private lastItemCount = 0;
  /** Drives auto-scroll: set whenever the list grows. */
  private pendingScroll = false;

  private changedSub?: Subscription;
  private cdr = inject(ChangeDetectorRef, { optional: true });

  ngOnInit(): void {
    this.changedSub = this.State.Changed$.subscribe(() => this.onStateChanged());
    this.lastItemCount = this.State.Items.length;
  }

  ngAfterViewChecked(): void {
    if (this.pendingScroll) {
      this.pendingScroll = false;
      this.scrollAnchor?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  ngOnDestroy(): void {
    this.changedSub?.unsubscribe();
  }

  /** track fn for the @for over thread items. */
  public TrackItem(index: number, item: RealtimeThreadItem): string {
    switch (item.Kind) {
      case 'delegation': return `d:${item.Card.CallID}`;
      case 'divider': return `s:${index}`;
      default: return `c:${index}`;
    }
  }

  /** True when the live narration note should render under THIS delegation item. */
  public ShowsLiveNote(item: RealtimeThreadItem): boolean {
    return item.Kind === 'delegation'
      && !item.Card.Done
      && this.State.Narration !== null
      && item.Card.CallID === this.State.ActiveCallId;
  }

  /** Set of item indices whose long text has been expanded by the user. */
  public ExpandedItems = new Set<number>();

  /**
   * Returns true when the caption text is considered a "long blob" (>280 chars or >4 lines)
   * that warrants height clamping and an expand/collapse toggle.
   */
  public IsLongText(text: string | null | undefined): boolean {
    if (!text) {
      return false;
    }
    return text.length > 280 || text.split('\n').length > 4;
  }

  /** Returns whether the caption item at the specified index is expanded. */
  public IsExpanded(index: number): boolean {
    return this.ExpandedItems.has(index);
  }

  /** Toggles expanded/collapsed state for the caption item at the given index. */
  public ToggleExpanded(index: number, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    if (this.ExpandedItems.has(index)) {
      this.ExpandedItems.delete(index);
    } else {
      this.ExpandedItems.add(index);
    }
    this.cdr?.markForCheck();
  }

  /**
   * Prepares text for markdown rendering, restoring structure (headings, horizontal rules,
   * bullet items) if newlines were stripped by single-line input paste or speech-to-text.
   */
  public FormatMarkdownText(text: string | null | undefined): string {
    if (!text) {
      return '';
    }
    let cleaned = text;
    // Restore newlines before markdown headings on same line: "Title ### Heading" -> "Title\n\n### Heading"
    // Each step scans by index rather than with `/[ \t]+…/g`, which is quadratic on a long run of
    // spaces (CodeQL js/polynomial-redos); see replaceAfterBlankRuns.
    cleaned = replaceAfterBlankRuns(cleaned, headingTail);
    // Restore newlines around horizontal rules on same line: "Text --- ##" -> "Text\n\n---\n\n##"
    cleaned = replaceAfterBlankRuns(cleaned, ruleTail);
    // Restore newlines before bullet items on same line: "around: - Item 1 - Item 2" -> "around:\n- Item 1\n- Item 2"
    cleaned = replaceAfterBlankRuns(cleaned, bulletTail);
    return cleaned;
  }

  /** Marks for check on every state change; auto-scrolls when the thread grew. */
  private onStateChanged(): void {
    if (this.State.Items.length > this.lastItemCount) {
      this.pendingScroll = true;
    }
    this.lastItemCount = this.State.Items.length;
    this.cdr?.markForCheck();
  }
}
