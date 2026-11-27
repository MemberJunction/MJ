import { Component, ChangeDetectorRef, NgZone, OnDestroy, OnInit, AfterViewInit, ViewContainerRef, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity } from '@memberjunction/core-entities';
import { TransactionGroupBase } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { ProfileDialogService } from '../shell/services/profile-dialog.service';
import {
  BuildNotificationUrl,
  FormatRelativeNotificationTime,
  GetNotificationTypeDisplay,
  GetSortedNotificationTypes,
  IsNotificationClickable as IsNotificationClickableHelper,
  MarkNotificationAsRead,
  NavigateToNotificationTarget,
  NotificationUrlInfo,
} from './notification-action.helpers';

/**
 * Radio button filter options for notification read status
 */
type ReadFilterOption = 'All' | 'Unread' | 'Read';

/** How a notification's Message should be rendered. */
export type NotificationMessageKind = 'html' | 'markdown' | 'text';
type MessageKind = NotificationMessageKind;

/** Result of classifying and normalizing a notification message for preview and expanded rendering. */
export interface ClassifiedNotificationMessage {
  Kind: NotificationMessageKind;
  Body: string;
  Preview: string;
  Expandable: boolean;
}

interface MarkdownSegment {
  text: string;
  isCode: boolean;
  fenced: boolean;
}

/**
 * Render-ready view model for one notification. Built once per data/filter change
 * (never inside template bindings): the Message is classified (full HTML document /
 * HTML fragment / Markdown / plain text), reduced to a sanitary body + plain-text
 * preview, and the time-relative label is SNAPSHOT here — computing relative time in
 * the template throws NG0100 at minute boundaries.
 */
interface NotificationVM {
  N: MJUserNotificationEntity;
  Kind: MessageKind;
  /** Rich body: extracted+stripped HTML fragment (html), normalized markdown (markdown), or normalized plain text (text). */
  Body: string;
  /** Plain-text excerpt for the collapsed card. */
  Preview: string;
  /** True when there is more to see than the collapsed preview. */
  Expandable: boolean;
  /** Snapshot "2h ago" label (refreshed on a timer, never computed in the template). */
  Relative: string;
  Clickable: boolean;
}

/** One day-bucket of notifications ("Today", "Yesterday", ...). */
interface NotificationGroup {
  Key: string;
  Label: string;
  Items: NotificationVM[];
}

/**
 * Type-filter value for notifications with no NotificationTypeID. Not a UUID, so it cannot
 * collide with a real type ID.
 */
export const NO_NOTIFICATION_TYPE_FILTER = '__no-type__';

/**
 * Whether a notification's type matches the Type dropdown's selection: `null` (All Types)
 * matches everything, {@link NO_NOTIFICATION_TYPE_FILTER} matches untyped notifications,
 * and any other value matches that type ID.
 */
export function MatchesNotificationTypeFilter(notificationTypeId: string | null | undefined, filter: string | null): boolean {
  if (filter == null) {
    return true;
  }
  if (filter === NO_NOTIFICATION_TYPE_FILTER) {
    return !notificationTypeId;
  }
  return UUIDsEqual(notificationTypeId, filter);
}

/** Collapsed-preview cap (characters of plain text). */
const PREVIEW_MAX_CHARS = 240;

/** How often the snapshot relative-time labels refresh. */
const RELATIVE_REFRESH_MS = 60_000;

function collapseWhitespaceValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function excerptValue(text: string): string {
  return text.length > PREVIEW_MAX_CHARS ? `${text.substring(0, PREVIEW_MAX_CHARS - 1)}…` : text;
}

/**
 * Single-pass decoder for legacy Nunjucks-escaped HTML entities in non-HTML notification text.
 * Decoding in one regex pass ensures `&amp;quot;` becomes `&quot;` rather than double-decoding to `"`.
 */
function decodeSafeHtmlEntities(text: string): string {
  return text.replace(/&(amp|quot|#39|#x27);/gi, (match, entity: string) => {
    switch (entity.toLowerCase()) {
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case '#39':
      case '#x27':
        return "'";
      default:
        return match;
    }
  });
}

function findFencedBlockEnd(text: string, start: number): number | null {
  const lineEndIdx = text.indexOf('\n', start);
  const firstLine = lineEndIdx === -1 ? text.slice(start) : text.slice(start, lineEndIdx);
  const openMatch = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/.exec(firstLine.replace(/\r$/, ''));
  if (!openMatch) {
    return null;
  }
  const fence = openMatch[1];
  const fenceChar = fence[0];
  const infoString = openMatch[2];
  if (fenceChar === '`' && infoString.includes('`')) {
    return null;
  }
  if (lineEndIdx === -1) {
    return text.length;
  }
  const closePattern = new RegExp(`^[ \\t]{0,3}${fenceChar}{${fence.length},}[ \\t]*$`);
  let cursor = lineEndIdx + 1;
  while (cursor < text.length) {
    const nextNewline = text.indexOf('\n', cursor);
    const rawLine = nextNewline === -1 ? text.slice(cursor) : text.slice(cursor, nextNewline);
    if (closePattern.test(rawLine.replace(/\r$/, ''))) {
      return nextNewline === -1 ? text.length : nextNewline + 1;
    }
    if (nextNewline === -1) {
      return text.length;
    }
    cursor = nextNewline + 1;
  }
  return text.length;
}

function findInlineCodeEnd(text: string, start: number, tickCount: number): number | null {
  let j = start + tickCount;
  while (j < text.length) {
    if (text[j] === '\n') {
      const blankMatch = /^\n[ \t]*\r?\n/.exec(text.slice(j));
      if (blankMatch) {
        return null;
      }
    }
    if (text[j] === '`') {
      let run = 0;
      while (j + run < text.length && text[j + run] === '`') {
        run++;
      }
      if (run === tickCount) {
        return j + run;
      }
      j += run;
      continue;
    }
    j++;
  }
  return null;
}

function splitMarkdownCodeSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let proseStart = 0;
  let i = 0;

  const flushProse = (end: number): void => {
    if (end > proseStart) {
      segments.push({ text: text.slice(proseStart, end), isCode: false, fenced: false });
    }
  };

  while (i < text.length) {
    const atLineStart = i === 0 || text[i - 1] === '\n';
    if (atLineStart) {
      const fenceEnd = findFencedBlockEnd(text, i);
      if (fenceEnd !== null) {
        flushProse(i);
        segments.push({ text: text.slice(i, fenceEnd), isCode: true, fenced: true });
        i = fenceEnd;
        proseStart = i;
        continue;
      }
    }
    if (text[i] === '`') {
      let tickCount = 0;
      while (i + tickCount < text.length && text[i + tickCount] === '`') {
        tickCount++;
      }
      const inlineEnd = findInlineCodeEnd(text, i, tickCount);
      if (inlineEnd !== null) {
        flushProse(i);
        segments.push({ text: text.slice(i, inlineEnd), isCode: true, fenced: false });
        i = inlineEnd;
        proseStart = i;
        continue;
      }
      i += tickCount;
      continue;
    }
    i++;
  }

  flushProse(text.length);
  return segments;
}

function cleanNonHtmlMessage(text: string): string {
  const segments = splitMarkdownCodeSegments(text);
  return segments
    .map(seg => (seg.isCode ? seg.text : ConversationUtility.CleanMentions(decodeSafeHtmlEntities(seg.text))))
    .join('');
}

function unwrapInlineCode(segment: string): string {
  const match = /^(`+)([\s\S]*?)\1$/.exec(segment);
  if (!match) {
    return segment;
  }
  let inner = match[2];
  if (inner.length >= 2 && inner.startsWith(' ') && inner.endsWith(' ') && inner.trim().length > 0) {
    inner = inner.slice(1, -1);
  }
  return inner;
}

function findLinkLabelEnd(text: string, openBracket: number, lineEnd: number): { start: number; closeBracket: number } {
  let start = openBracket;
  for (let k = openBracket + 1; k < lineEnd; k++) {
    const ch = text[k];
    if (ch === '[') {
      // Outer '[' cannot form a single-bracket link label; jump directly to the inner '['.
      start = k;
    } else if (ch === ']') {
      return { start, closeBracket: k };
    }
  }
  return { start, closeBracket: -1 };
}

function findBalancedParenEnd(text: string, openParen: number, lineEnd: number): number {
  let depth = 1;
  for (let k = openParen + 1; k < lineEnd; k++) {
    const ch = text[k];
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return k;
      }
    }
  }
  return -1;
}

/**
 * Linear-time O(n) single-pass scanner/replacer for Markdown links `[label](url)` —
 * caches `lineEnd` per line and advances a strictly monotonic cursor so pathological
 * `[` or `[a](` sequences never rescan overlapping suffixes.
 */
function processMarkdownLinks(text: string, mode: 'detect'): boolean;
function processMarkdownLinks(text: string, mode: 'strip'): string;
function processMarkdownLinks(text: string, mode: 'detect' | 'strip'): boolean | string {
  let out = '';
  let cursor = 0;
  let lineEnd = -1;
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '[') {
      i++;
      continue;
    }
    if (i > lineEnd) {
      const nl = text.indexOf('\n', i + 1);
      lineEnd = nl === -1 ? text.length : nl;
    }
    const { start, closeBracket } = findLinkLabelEnd(text, i, lineEnd);
    if (closeBracket === -1) {
      i = lineEnd;
      continue;
    }
    if (closeBracket <= start + 1 || text[closeBracket + 1] !== '(') {
      i = closeBracket + 1;
      continue;
    }
    const closeParen = findBalancedParenEnd(text, closeBracket + 1, lineEnd);
    if (closeParen === -1) {
      // No closing ')' before lineEnd; advance past the scanned suffix so it is never rescanned.
      i = lineEnd;
      continue;
    }
    if (mode === 'detect') {
      if (closeParen > closeBracket + 2) {
        return true;
      }
      i = closeParen + 1;
      continue;
    }
    out += text.slice(cursor, start);
    out += text.slice(start + 1, closeBracket);
    cursor = closeParen + 1;
    i = cursor;
  }
  return mode === 'detect' ? false : out + text.slice(cursor);
}

function stripMarkdownSyntaxOutsideTokens(text: string): string {
  const stripChunk = (chunk: string): string =>
    processMarkdownLinks(chunk, 'strip')
      .replace(/(^|\s)#{1,6}(?=\s|$)/g, '$1')
      .replace(/(^|\s)>+(?=\s|$)/g, '$1')
      .replace(/\*+/g, '')
      .replace(/(^|[^\w])_+|_+(?=[^\w]|$)/g, '$1');

  const tokens = ConversationUtility.ParseSpecialContent(text);
  if (tokens.length === 0) {
    return stripChunk(text);
  }
  let out = '';
  let cursor = 0;
  for (const token of tokens) {
    out += stripChunk(text.slice(cursor, token.startIndex));
    out += token.originalText;
    cursor = token.endIndex;
  }
  out += stripChunk(text.slice(cursor));
  return out;
}

/**
 * Strips Markdown formatting for collapsed notification previews while:
 *  - Decoding legacy `&amp;`, `&#39;`, `&#x27;`, `&quot;` entities once in prose
 *  - Preserving inline code content without decoding/double-decoding and dropping fenced code blocks
 *  - Converting `@{"_mode":"mention",...}` tokens into readable text with adjacent record title deduplication
 */
export function StripNotificationMarkdown(text: string): string {
  if (!text) {
    return '';
  }
  const segments = splitMarkdownCodeSegments(text);
  const rendered = segments
    .map(seg => {
      if (seg.fenced) {
        return ' ';
      }
      if (seg.isCode) {
        return unwrapInlineCode(seg.text);
      }
      const decoded = decodeSafeHtmlEntities(seg.text);
      const stripped = stripMarkdownSyntaxOutsideTokens(decoded);
      return ConversationUtility.CleanMentions(stripped);
    })
    .join('');
  return collapseWhitespaceValue(rendered);
}

/**
 * Classifies a notification `Message` for rendering and normalizes non-HTML previews,
 * Markdown bodies (`&amp;`/`&#39;`/`&#x27;`/`&quot;` single-pass decode outside code blocks
 * and `@{"_mode":"mention",...}` conversion with adjacent record title deduplication), and
 * HTML notification bodies via {@link ConversationUtility.CleanHtmlMentions}.
 */
export function ClassifyNotificationMessage(message: string): ClassifiedNotificationMessage {
  const trimmed = (message ?? '').trim();
  const nonCodeText = splitMarkdownCodeSegments(trimmed)
    .filter(seg => !seg.isCode)
    .map(seg => seg.text)
    .join(' ');
  const looksHtml = /^<!doctype\s|^<html[\s>]/i.test(trimmed) || /<\/?[a-z][^<>]*>/i.test(nonCodeText);
  if (looksHtml) {
    const doc = new DOMParser().parseFromString(trimmed, 'text/html');
    for (const el of Array.from(doc.querySelectorAll('style, script, link, meta, title'))) {
      el.remove();
    }
    const rawBody = doc.body?.innerHTML?.trim() ?? '';
    const body = ConversationUtility.CleanHtmlMentions(rawBody);
    const cleanedDoc = body !== rawBody
      ? new DOMParser().parseFromString(body, 'text/html')
      : doc;
    const text = collapseWhitespaceValue(ConversationUtility.CleanMentions(cleanedDoc.body?.textContent ?? ''));
    return { Kind: 'html', Body: body, Preview: excerptValue(text), Expandable: true };
  }

  const looksMarkdown =
    /^#{1,6}\s/m.test(trimmed) ||
    /\*\*[^*]+\*\*/.test(trimmed) ||
    /^[ \t]*[-*][ \t]+/m.test(trimmed) ||
    trimmed.includes('```') ||
    /^[ \t]*~~~/m.test(trimmed) ||
    processMarkdownLinks(trimmed, 'detect');
  if (looksMarkdown) {
    const body = cleanNonHtmlMessage(trimmed);
    const preview = excerptValue(StripNotificationMarkdown(trimmed));
    return { Kind: 'markdown', Body: body, Preview: preview, Expandable: true };
  }

  const cleanedText = collapseWhitespaceValue(cleanNonHtmlMessage(trimmed));
  return {
    Kind: 'text',
    Body: cleanedText,
    Preview: cleanedText,
    Expandable: cleanedText.length > PREVIEW_MAX_CHARS,
  };
}

@Component({
  standalone: false,
  selector: 'app-user-notifications',
  templateUrl: './user-notifications.component.html',
  styleUrls: ['./user-notifications.component.css']
})
export class UserNotificationsComponent extends BaseAngularComponent implements OnInit, AfterViewInit, OnDestroy {
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone, { optional: true });
  private profileDialogService = inject(ProfileDialogService, { optional: true });
  private viewContainerRef = inject(ViewContainerRef, { optional: true });

  public get CanOpenPreferences(): boolean {
    return Boolean(this.profileDialogService && this.viewContainerRef);
  }

  public OpenNotificationPreferences(): void {
    if (this.profileDialogService && this.viewContainerRef) {
      this.profileDialogService.Open(this.viewContainerRef);
    }
  }

  public RadioSelected: ReadFilterOption = 'All';

  /** @deprecated Use {@link RadioSelected}. */
  public get radioSelected(): ReadFilterOption {
    return this.RadioSelected;
  }
  /** @deprecated Use {@link RadioSelected}. */
  public set radioSelected(value: ReadFilterOption) {
    this.RadioSelected = value;
  }
  public CurrentFilter: string = '';

  /** @deprecated Use {@link CurrentFilter}. */
  public get currentFilter(): string {
    return this.CurrentFilter;
  }
  /** @deprecated Use {@link CurrentFilter}. */
  public set currentFilter(value: string) {
    this.CurrentFilter = value;
  }
  public NotificationTypes: MJUserNotificationTypeEntity[] = [];

  /** @deprecated Use {@link NotificationTypes}. */
  public get notificationTypes(): MJUserNotificationTypeEntity[] {
    return this.NotificationTypes;
  }
  /** @deprecated Use {@link NotificationTypes}. */
  public set notificationTypes(value: MJUserNotificationTypeEntity[]) {
    this.NotificationTypes = value;
  }
  public SelectedTypeFilter: string | null = null;

  /** Dropdown value for the "Other (no type)" option. */
  public readonly NoTypeFilter = NO_NOTIFICATION_TYPE_FILTER;

  /** @deprecated Use {@link SelectedTypeFilter}. */
  public get selectedTypeFilter(): string | null {
    return this.SelectedTypeFilter;
  }
  /** @deprecated Use {@link SelectedTypeFilter}. */
  public set selectedTypeFilter(value: string | null) {
    this.SelectedTypeFilter = value;
  }
  public LoadingTypes: boolean = true;

  /** @deprecated Use {@link LoadingTypes}. */
  public get loadingTypes(): boolean {
    return this.LoadingTypes;
  }
  /** @deprecated Use {@link LoadingTypes}. */
  public set loadingTypes(value: boolean) {
    this.LoadingTypes = value;
  }

  /** IDs of cards currently expanded to their full rendered content. */
  public Expanded = new Set<string>();

  private groups: NotificationGroup[] = [];
  private groupsKey = '';
  private vmCache = new Map<string, NotificationVM>();
  private relativeTimer: ReturnType<typeof setInterval> | null = null;
  private readonly destroy$ = new Subject<void>();
  private cacheVersion = 0;

  constructor (
    public SharedService: SharedService,
    private navigationService: NavigationService,
    private appManager: ApplicationManager
  ) {
    super();
  }

  /** @deprecated Use {@link SharedService}. */
  public get sharedService(): SharedService {
    return this.SharedService;
  }
  /** @deprecated Use {@link SharedService}. */
  public set sharedService(value: SharedService) {
    this.SharedService = value;
  }

  async ngOnInit() {
    this.loadNotificationTypes();
    MJNotificationService.Notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.invalidateCaches();
        this.cdr.markForCheck();
      });
    // Refresh the snapshot relative-time labels between change-detection passes.
    // Run outside NgZone so the 60s timer only triggers Angular CD when a label actually changes.
    const startTimer = () => {
      this.relativeTimer = setInterval(() => {
        let anyChanged = false;
        for (const vm of this.vmCache.values()) {
          const next = this.relativeTime(vm.N.__mj_CreatedAt);
          if (vm.Relative !== next) {
            vm.Relative = next;
            anyChanged = true;
          }
        }
        this.groupsKey = ''; // day buckets can shift at midnight
        if (anyChanged) {
          if (this.ngZone) {
            this.ngZone.run(() => this.cdr.markForCheck());
          } else {
            this.cdr.markForCheck();
          }
        }
      }, RELATIVE_REFRESH_MS);
    };
    if (this.ngZone) {
      this.ngZone.runOutsideAngular(startTimer);
    } else {
      startTimer();
    }
  }

  ngAfterViewInit(): void {
    this.SharedService.InvokeManualResize(); // make sure the notifications component is sized correctly
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.relativeTimer != null) {
      clearInterval(this.relativeTimer);
    }
  }

  private invalidateCaches(): void {
    this.cacheVersion = (this.cacheVersion ?? 0) + 1;
    this.notificationsToShowKey = '';
    this.unreadNotificationsKey = '';
    this.readNotificationsKey = '';
    this.groupsKey = '';
  }

  private loadNotificationTypes() {
    this.NotificationTypes = GetSortedNotificationTypes();
    this.LoadingTypes = false;
  }

  // ========================================================================
  // Data shaping (filter → view models → day groups)
  // ========================================================================

  private notificationsToShowCache: MJUserNotificationEntity[] = [];
  private notificationsToShowKey = '';
  private unreadNotificationsCache: MJUserNotificationEntity[] = [];
  private unreadNotificationsKey = '';
  private readNotificationsCache: MJUserNotificationEntity[] = [];
  private readNotificationsKey = '';

  private computeAllNotificationsSignature(): { all: MJUserNotificationEntity[]; unreadCount: number; baseKey: string } {
    const all = this.AllNotifications;
    let unreadCount = 0;
    for (let i = 0; i < all.length; i++) {
      if (all[i].Unread) unreadCount++;
    }
    const baseKey = `${this.cacheVersion ?? 0}|${all.length}|${unreadCount}|${all[0]?.ID ?? ''}|${all[all.length - 1]?.ID ?? ''}`;
    return { all, unreadCount, baseKey };
  }

  public get NotificationsToShow(): MJUserNotificationEntity[] {
    const { all, baseKey } = this.computeAllNotificationsSignature();
    const key = `${baseKey}|${this.RadioSelected}|${this.SelectedTypeFilter ?? ''}|${this.CurrentFilter}`;
    if (key === this.notificationsToShowKey) {
      return this.notificationsToShowCache;
    }

    let temp: MJUserNotificationEntity[] = [];
    switch (this.RadioSelected) {
      case 'All':
        temp = all;
        break;
      case 'Unread':
        temp = all.filter(n => n.Unread);
        break;
      case 'Read':
        temp = all.filter(n => !n.Unread);
        break;
    }

    // Apply type filter if selected
    if (this.SelectedTypeFilter != null) {
      const typeFilter = this.SelectedTypeFilter;
      temp = temp.filter(n => MatchesNotificationTypeFilter(n.NotificationTypeID, typeFilter));
    }

    // Apply text filter if it is not empty
    const filterLower = this.CurrentFilter.trim().toLowerCase();
    if (filterLower.length > 0) {
      // check for inclusion of filter value in title or message
      temp = temp.filter(n => n.Title?.toLowerCase().includes(filterLower) ||
                              n.Message?.toLowerCase().includes(filterLower)
                        );
    }

    this.notificationsToShowKey = key;
    this.notificationsToShowCache = temp;
    return temp;
  }

  /**
   * The filtered notifications as render-ready day groups. Memoized on a composite
   * key of the inputs BEFORE filtering `AllNotifications`, so the getter stays $O(1)$
   * across change-detection passes and the (time-sensitive) VM snapshots never rebuild mid-pass.
   */
  public get Groups(): NotificationGroup[] {
    const { baseKey } = this.computeAllNotificationsSignature();
    const key = `${baseKey}|${this.RadioSelected}|${this.SelectedTypeFilter ?? ''}|${this.CurrentFilter}`;
    if (key !== this.groupsKey) {
      this.groups = this.buildGroups(this.NotificationsToShow);
      this.groupsKey = key;
    }
    return this.groups;
  }

  private buildGroups(list: MJUserNotificationEntity[]): NotificationGroup[] {
    const groups: NotificationGroup[] = [];
    let current: NotificationGroup | null = null;
    for (const n of list) {
      const label = this.dayLabel(n.__mj_CreatedAt);
      if (!current || current.Label !== label) {
        current = { Key: `${label}-${n.ID}`, Label: label, Items: [] };
        groups.push(current);
      }
      current.Items.push(this.vmFor(n));
    }
    return groups;
  }

  private vmFor(n: MJUserNotificationEntity): NotificationVM {
    const cached = this.vmCache.get(n.ID);
    if (cached && cached.N.Message === n.Message) {
      cached.N = n;
      cached.Clickable = this.IsNotificationClickable(n);
      return cached;
    }
    const { kind, body, preview, expandable } = this.classifyMessage(n.Message ?? '');
    const vm: NotificationVM = {
      N: n,
      Kind: kind,
      Body: body,
      Preview: preview,
      Expandable: expandable,
      Relative: this.relativeTime(n.__mj_CreatedAt),
      Clickable: this.IsNotificationClickable(n),
    };
    this.vmCache.set(n.ID, vm);
    return vm;
  }

  /**
   * Classifies a notification Message for rendering:
   *  - Full HTML documents (e.g. templated email bodies) and HTML fragments →
   *    parsed with DOMParser, chrome elements (style/script/link/meta/title) removed,
   *    and the body markup kept for a SANITIZED [innerHTML] binding (Angular's
   *    default sanitizer strips scripts/event handlers on bind).
   *  - Markdown-looking text → rendered through mj-markdown when expanded, with
   *    legacy entities decoded and `@{"_mode":"mention",...}` tokens normalized.
   *  - Everything else → plain text with entities decoded and mentions converted.
   */
  private classifyMessage(message: string): { kind: MessageKind; body: string; preview: string; expandable: boolean } {
    const classified = ClassifyNotificationMessage(message);
    return {
      kind: classified.Kind,
      body: classified.Body,
      preview: classified.Preview,
      expandable: classified.Expandable,
    };
  }

  /** Light de-noising of markdown syntax for the plain-text preview. */
  private stripMarkdown(text: string): string {
    return StripNotificationMarkdown(text);
  }

  /** Compact "just now / 5m ago / 3h ago / 2d ago" label. NEVER call from templates (NG0100) — snapshot only. */
  private relativeTime(value: Date | string | null | undefined): string {
    return FormatRelativeNotificationTime(value);
  }

  private dayLabel(value: Date | string | null | undefined): string {
    if (!value) {
      return 'Earlier';
    }
    const d = new Date(value);
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    return 'Earlier';
  }

  // ========================================================================
  // Expand / collapse
  // ========================================================================

  public IsExpanded(vm: NotificationVM): boolean {
    return this.Expanded.has(vm.N.ID);
  }

  public ToggleExpanded(vm: NotificationVM, event: Event): void {
    event.stopPropagation();
    if (this.Expanded.has(vm.N.ID)) {
      this.Expanded.delete(vm.N.ID);
    } else {
      this.Expanded.add(vm.N.ID);
      // Reading the full content is reading — mark it as such.
      if (vm.N.Unread) {
        void this.MarkAsRead(vm.N, true, null);
      }
    }
    this.cdr.markForCheck();
  }

  // ========================================================================
  // Clickability + navigation (delegated to notification-action.helpers)
  // ========================================================================

  public IsNotificationClickable(notification: MJUserNotificationEntity): boolean {
    return IsNotificationClickableHelper(notification, this.SharedService);
  }

  /** @deprecated Use {@link IsNotificationClickable}. */
  public isNotificationClickable(notification: MJUserNotificationEntity): boolean {
    return this.IsNotificationClickable(notification);
  }

  public NotificationUrl(notification: MJUserNotificationEntity): NotificationUrlInfo {
    return BuildNotificationUrl(notification, this.SharedService);
  }

  /** @deprecated Use {@link NotificationUrl}. */
  public notificationUrl(notification: MJUserNotificationEntity): NotificationUrlInfo {
    return this.NotificationUrl(notification);
  }

  public get AllNotifications(): MJUserNotificationEntity[] {
    return SharedService.UserNotifications;
  }

  public get UnreadNotifications(): MJUserNotificationEntity[] {
    const { all, baseKey } = this.computeAllNotificationsSignature();
    if (baseKey !== this.unreadNotificationsKey) {
      this.unreadNotificationsKey = baseKey;
      this.unreadNotificationsCache = all.filter(n => n.Unread);
    }
    return this.unreadNotificationsCache;
  }

  public get ReadNotifications(): MJUserNotificationEntity[] {
    const { all, baseKey } = this.computeAllNotificationsSignature();
    if (baseKey !== this.readNotificationsKey) {
      this.readNotificationsKey = baseKey;
      this.readNotificationsCache = all.filter(n => !n.Unread);
    }
    return this.readNotificationsCache;
  }

  SelectReadOption(option: ReadFilterOption): void {
    this.RadioSelected = option;
    this.cdr?.markForCheck();
  }

  /** @deprecated Use {@link SelectReadOption}. */
  selectReadOption(option: ReadFilterOption): void {
    return this.SelectReadOption(option);
  }

  OnFilterChanged(value: string): void {
    this.CurrentFilter = value;
  }

  /** @deprecated Use {@link OnFilterChanged}. */
  onFilterChanged(value: string): void {
    return this.OnFilterChanged(value);
  }

  async MarkAsRead(notification: MJUserNotificationEntity, bRead: boolean, transGroup: TransactionGroupBase | null): Promise<boolean> {
    const saved = await MarkNotificationAsRead(notification, bRead, transGroup, this.ProviderToUse);
    if (!transGroup) {
      if (!saved) {
        this.SharedService?.CreateSimpleNotification(
          bRead ? 'Unable to mark notification as read' : 'Unable to mark notification as unread',
          'error',
          5000
        );
      }
      this.invalidateCaches();
      this.cdr?.markForCheck();
    }
    return saved;
  }

  /** @deprecated Use {@link MarkAsRead}. */
  async markAsRead(notification: MJUserNotificationEntity, bRead: boolean, transGroup: TransactionGroupBase | null): Promise<boolean> {
    return this.MarkAsRead(notification, bRead, transGroup);
  }

  public async MarkAllAsRead() {
    await this.MarkAll(true);
  }

  /** @deprecated Use {@link MarkAllAsRead}. */
  public async markAllAsRead() {
    return this.MarkAllAsRead();
  }

  public async MarkAllAsUnread() {
    await this.MarkAll(false);
  }

  /** @deprecated Use {@link MarkAllAsUnread}. */
  public async markAllAsUnread() {
    return this.MarkAllAsUnread();
  }

  public async MarkAll(bRead: boolean) {
    const targets = this.AllNotifications.filter(
      notification => (notification.Unread && bRead) || (!notification.Unread && !bRead)
    );
    if (targets.length === 0) {
      return;
    }

    // Use transaction group for batching - all saves are queued and sent in one round-trip
    const md = this.ProviderToUse;
    const transGroup = await md.CreateTransactionGroup();
    const previousUnread = new Map<MJUserNotificationEntity, boolean>(
      targets.map(n => [n, n.Unread])
    );

    try {
      // Queue all saves. A grouped Save() runs validation and pre-save hooks before it joins the
      // group, so wait for every one to be queued; submitting earlier sends an empty group that
      // reports success and persists nothing. A grouped Save() resolves once queued, not once sent.
      await Promise.all(targets.map(notification => this.MarkAsRead(notification, bRead, transGroup)));

      // Submit transaction group - this is where the actual network call happens
      if (!await transGroup.Submit()) {
        for (const [notification, prev] of previousUnread) {
          notification.Unread = prev;
        }
        this.SharedService.CreateSimpleNotification(
          bRead ? 'Unable to mark all notifications as read' : 'Unable to mark all notifications as unread',
          'error',
          5000
        );
      } else {
        SharedService.RefreshUserNotifications();
      }
    } finally {
      // Always detach the completed/failed TransactionGroup from every cached entity so
      // subsequent single-item Read/Unread toggles persist immediately instead of enqueuing
      // into a finished group.
      for (const notification of targets) {
        notification.TransactionGroup = null;
      }
      MJNotificationService.UpdateNotificationObservables();
      this.invalidateCaches();
      this.cdr?.markForCheck();
    }
  }

  /** @deprecated Use {@link MarkAll}. */
  public async markAll(bRead: boolean) {
    return this.MarkAll(bRead);
  }

  NotificationClicked(notification: MJUserNotificationEntity): void {
    if (this.IsNotificationClickable(notification)) {
      // also mark this as read when we click it
      this.MarkAsRead(notification, true, null);

      NavigateToNotificationTarget(notification, {
        SharedService: this.SharedService,
        NavigationService: this.navigationService,
        AppManager: this.appManager,
        Provider: this.ProviderToUse,
      });
    }
  }

  /** @deprecated Use {@link NotificationClicked}. */
  notificationClicked(notification: MJUserNotificationEntity): void {
    return this.NotificationClicked(notification);
  }

  public GetNotificationType(typeId: string | null): MJUserNotificationTypeEntity | null {
    if (!typeId) return null;
    return this.NotificationTypes.find(t => UUIDsEqual(t.ID, typeId)) || null;
  }

  /** @deprecated Use {@link GetNotificationType}. */
  public getNotificationType(typeId: string | null): MJUserNotificationTypeEntity | null {
    return this.GetNotificationType(typeId);
  }

  public GetTypeIcon(notification: MJUserNotificationEntity): string {
    return GetNotificationTypeDisplay(notification.NotificationTypeID, this.NotificationTypes).Icon;
  }

  /** @deprecated Use {@link GetTypeIcon}. */
  public getTypeIcon(notification: MJUserNotificationEntity): string {
    return this.GetTypeIcon(notification);
  }

  public GetTypeColor(notification: MJUserNotificationEntity): string {
    return GetNotificationTypeDisplay(notification.NotificationTypeID, this.NotificationTypes).Color;
  }

  /** @deprecated Use {@link GetTypeColor}. */
  public getTypeColor(notification: MJUserNotificationEntity): string {
    return this.GetTypeColor(notification);
  }

  public GetTypeName(notification: MJUserNotificationEntity): string {
    return GetNotificationTypeDisplay(notification.NotificationTypeID, this.NotificationTypes).Name;
  }

  /** @deprecated Use {@link GetTypeName}. */
  public getTypeName(notification: MJUserNotificationEntity): string {
    return this.GetTypeName(notification);
  }

  public OnTypeFilterChange(typeId: string | null): void {
    this.SelectedTypeFilter = typeId;
  }

  /** @deprecated Use {@link OnTypeFilterChange}. */
  public onTypeFilterChange(typeId: string | null): void {
    return this.OnTypeFilterChange(typeId);
  }
}
