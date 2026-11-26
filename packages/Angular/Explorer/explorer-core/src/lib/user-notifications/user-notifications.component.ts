import { Component, ChangeDetectorRef, NgZone, OnDestroy, OnInit, AfterViewInit, inject } from '@angular/core';
import { SharedService, NavigationService } from '@memberjunction/ng-shared';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity, MJUserRoutineEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { CompositeKey, TransactionGroupBase } from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ApplicationManager, NavItem } from '@memberjunction/ng-base-application';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ConversationUtility, MentionContent, SpecialContentToken } from '@memberjunction/ai-core-plus';
import { TourSessionGuideMode, TourSignals } from '@memberjunction/tours-runtime';

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
 * Configuration for record-type resource navigation
 */
interface RecordResourceConfig {
  Entity?: string;
}

/**
 * Configuration for conversation-type resource navigation
 */
interface ConversationResourceConfig {
  type: 'conversation';
  conversationId?: string;
  messageId?: string;
  artifactId?: string;
  versionNumber?: string;
  taskId?: string;
}

/**
 * Configuration for agent-request-type resource navigation
 */
interface AgentRequestResourceConfig {
  type: 'agent-request';
  requestId: string;
}

/**
 * Configuration written by the User Routine dispatcher for a routine run. `conversationId` is
 * the routine's own conversation, where the run's reply lives; older notifications lack it.
 */
interface UserRoutineResourceConfig {
  type: 'UserRoutine';
  routineId: string;
  runId?: string;
  conversationId?: string;
}

/**
 * Configuration written by tour notifications ("What's new" / "Start Tour For User")
 * so clicking the notification launches the target guided tour.
 */
interface TourResourceConfig {
  type: 'tour';
  tourKey: string;
  guideMode?: TourSessionGuideMode;
  startAtStepKey?: string;
}

/**
 * Result of parsing a notification URL
 */
interface NotificationUrlInfo {
  urlParts: string[];
  queryString: string;
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

function isRecordMentionToken(token: SpecialContentToken): token is SpecialContentToken & { content: MentionContent } {
  return token.mode === 'mention' && 'type' in token.content && token.content.type === 'record';
}

function resolveRecordLinkLabel(content: MentionContent): string {
  const explicitName = (content.name ?? '').trim();
  return explicitName || content.entityName || 'record';
}

function endsWithRecordTitle(prefix: string, label: string): boolean {
  if (!label) {
    return false;
  }
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trailingTitlePattern = new RegExp(`(?:^|[\\s(\\[\\"'*_\`>:])${escapedLabel}[*_\`"'\\]]*[ \\t]*$`, 'i');
  return trailingTitlePattern.test(prefix);
}

/**
 * Converts `@{"_mode":...}` tokens into readable plain text via `ConversationUtility.ToPlainText`,
 * omitting duplicate `record` mention pills that immediately follow the same record title.
 */
function replaceMentionTokens(text: string): string {
  if (!text) {
    return '';
  }
  const tokens = ConversationUtility.ParseSpecialContent(text);
  if (tokens.length === 0) {
    return text;
  }

  let deduplicated = '';
  let cursor = 0;
  for (const token of tokens) {
    deduplicated += text.slice(cursor, token.startIndex);
    cursor = token.endIndex;

    if (isRecordMentionToken(token)) {
      const label = resolveRecordLinkLabel(token.content);
      if (endsWithRecordTitle(deduplicated, label)) {
        const nextChar = text[token.endIndex] ?? '';
        if (nextChar === '' || /^[\s.,;:!?)\]}'"]/.test(nextChar)) {
          deduplicated = deduplicated.replace(/[ \t]+$/, '');
        }
        continue;
      }
    }
    deduplicated += token.originalText;
  }
  deduplicated += text.slice(cursor);

  return ConversationUtility.ToPlainText(deduplicated);
}

function cleanNonHtmlMessage(text: string): string {
  const segments = splitMarkdownCodeSegments(text);
  return segments
    .map(seg => (seg.isCode ? seg.text : replaceMentionTokens(decodeSafeHtmlEntities(seg.text))))
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
      return replaceMentionTokens(stripped);
    })
    .join('');
  return collapseWhitespaceValue(rendered);
}

/**
 * Classifies a notification `Message` for rendering and normalizes non-HTML previews and
 * Markdown bodies (`&amp;`/`&#39;`/`&#x27;`/`&quot;` single-pass decode outside code blocks
 * and `@{"_mode":"mention",...}` conversion with adjacent record title deduplication).
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
    const body = doc.body?.innerHTML?.trim() ?? '';
    const text = collapseWhitespaceValue(replaceMentionTokens(doc.body?.textContent ?? ''));
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
    if (this.relativeTimer != null) {
      clearInterval(this.relativeTimer);
    }
  }

  private loadNotificationTypes() {
    // Get notification types from UserInfoEngine cache, sorted client-side
    // UserInfoEngine is auto-configured via @RegisterForStartup()
    this.NotificationTypes = [...UserInfoEngine.Instance.NotificationTypes].sort((a, b) => {
      const priorityA = a.Priority ?? 999;
      const priorityB = b.Priority ?? 999;
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return a.Name.localeCompare(b.Name);
    });
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
    const baseKey = `${all.length}|${unreadCount}|${all[0]?.ID ?? ''}|${all[all.length - 1]?.ID ?? ''}`;
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
    if (!value) {
      return '';
    }
    const ms = Date.now() - new Date(value).getTime();
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return days < 7 ? `${days}d ago` : '';
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
  // Clickability + navigation (unchanged behavior)
  // ========================================================================

  public IsNotificationClickable(notification: MJUserNotificationEntity): boolean {
    // Check for special types navigated via NavigationService (not a URL)
    if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      const config = SafeJSONParse<AgentRequestResourceConfig>(notification.ResourceConfiguration);
      if (config && config.type?.trim().toLowerCase() === 'agent-request' && config.requestId) {
        return true;
      }
      const typeName = SafeJSONParse<{ type?: string }>(notification.ResourceConfiguration)?.type?.trim().toLowerCase();
      if (typeName === 'meet-room') {
        return true;
      }
      if (this.parseUserRoutineConfig(notification)) {
        return true;
      }
      if (this.parseTourConfig(notification)) {
        return true;
      }
    }

    const info = this.NotificationUrl(notification);
    return (info !== null && info.urlParts && info.urlParts.length > 0);
  }

  /** @deprecated Use {@link IsNotificationClickable}. */
  public isNotificationClickable(notification: MJUserNotificationEntity): boolean {
    return this.IsNotificationClickable(notification);
  }

  public NotificationUrl(notification: MJUserNotificationEntity): NotificationUrlInfo {
    const url: string[] = [];
    let queryString = '';
    if (notification.ResourceRecordID && notification.ResourceRecordID.length > 0 &&
        notification.ResourceTypeID && notification.ResourceTypeID.length > 0) {
      // we have a resource here, like a Report, Dashboard, etc
      // we can generate a url to navigate to it
      const rt = this.SharedService.ResourceTypeByID(notification.ResourceTypeID);
      let routeSegment: string | null | undefined;
      if (rt)
        routeSegment = this.SharedService.mapResourceTypeNameToRouteSegment(rt.Name);

      if (rt && routeSegment && routeSegment.trim().length > 0) {
        url.push('resource');
        url.push(routeSegment);
        url.push(notification.ResourceRecordID.toString());
        if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
          if (rt.Name.trim().toLowerCase() === 'records') {
            // special handling for records
            const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration);
            if (config && config.Entity)
              queryString = `Entity=${config.Entity}`;
          }
          else
            queryString = notification.ResourceConfiguration;
        }
      }
    }
    else if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      // we do NOT have a resource type or resource record id, but we do have a ResourceConfiguration
      // string, which means we might have information on how to navigate to what we want if we parse the config
      // HOME screen stuff is done this way

      const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
      if (config && config.type?.trim().toLowerCase() === 'conversation') {
        url.push('chat');
        // Build query string with conversation and artifact navigation
        const queryParams: string[] = [];
        if (config.conversationId) queryParams.push(`conversationId=${config.conversationId}`);
        if (config.messageId) queryParams.push(`messageId=${config.messageId}`);
        if (config.artifactId) queryParams.push(`artifactId=${config.artifactId}`);
        if (config.versionNumber) queryParams.push(`versionNumber=${config.versionNumber}`);
        if (config.taskId) queryParams.push(`taskId=${config.taskId}`);
        queryString = queryParams.join('&');
      }
    }

    return { urlParts: url, queryString };
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
    if (notification) {
      const notificationId = notification.ID;
      notification.Unread = !bRead;
      let notificationEntity: MJUserNotificationEntity;
      if (notification instanceof MJUserNotificationEntity) {
        // the passed in param truly is a MJUserNotificationEntity or subclass, so just use it, saves a DB round trip
        notificationEntity = notification;
      }
      else {
        // the passed in param is just a plain object, so we need to load the entity
        const md = this.ProviderToUse;
        notificationEntity = await md.GetEntityObject<MJUserNotificationEntity>('MJ: User Notifications');
        await notificationEntity.Load(notificationId);
        notificationEntity.Unread = !bRead;
      }

      // part of a transaction group, if so, add it as that will defer the actual network traffic/save
      if (transGroup) {
        notificationEntity.TransactionGroup = transGroup;
        await notificationEntity.Save()
        return true;
      }
      else {
        // Save the notification (not part of transaction group)
        await notificationEntity.Save();
        // Update the observables so badge count refreshes immediately
        MJNotificationService.UpdateNotificationObservables();
        return true;
      }
    }
    else {
      return false;
    }
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
    // Use transaction group for batching - all saves are queued and sent in one round-trip
    const md = this.ProviderToUse;
    const transGroup = await md.CreateTransactionGroup();

    // Queue all saves. A grouped Save() runs validation and pre-save hooks before it joins the
    // group, so wait for every one to be queued; submitting earlier sends an empty group that
    // reports success and persists nothing. A grouped Save() resolves once queued, not once sent.
    const queued: Promise<boolean>[] = [];
    for (const notification of this.AllNotifications) {
      if (notification.Unread && bRead || !notification.Unread && !bRead) {
        queued.push(this.MarkAsRead(notification, bRead, transGroup));
      }
    }
    await Promise.all(queued);

    // Submit transaction group - this is where the actual network call happens
    if (!await transGroup.Submit())
      this.SharedService.CreateSimpleNotification('Unable to mark all notifications as read', 'error', 5000);
    else
      SharedService.RefreshUserNotifications();
  }

  /** @deprecated Use {@link MarkAll}. */
  public async markAll(bRead: boolean) {
    return this.MarkAll(bRead);
  }

  NotificationClicked(notification: MJUserNotificationEntity): void {
    if (this.IsNotificationClickable(notification)) {
      // also mark this as read when we click it
      this.MarkAsRead(notification, true, null);

      // Check for special navigation types that use NavigationService (not router)
      if (this.navigateToAgentRequest(notification)) {
        return;
      }
      if (this.navigateToConversation(notification)) {
        return;
      }
      if (this.navigateToMeetRoom(notification)) {
        return;
      }
      if (this.navigateToUserRoutine(notification)) {
        return;
      }
      if (this.navigateToTour(notification)) {
        return;
      }
      if (this.navigateToHandoffConsole(notification)) {
        return;
      }
      if (this.navigateToMeeting(notification)) {
        return;
      }

      this.navigateToResource(notification);
    }
  }

  /** @deprecated Use {@link NotificationClicked}. */
  notificationClicked(notification: MJUserNotificationEntity): void {
    return this.NotificationClicked(notification);
  }

  /**
   * Opens the Meet app's Live Room in JOIN mode for a `meet-room` invite notification (the
   * `{ type:'meet-room', room }` ResourceConfiguration), mirroring {@link navigateToConversation}.
   * Returns `false` (not handled) when the config isn't a meet-room invite or the Meet app is absent.
   */
  private navigateToMeetRoom(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }
    const config = SafeJSONParse<{ type?: string; room?: string }>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'meet-room') {
      return false;
    }
    const meetApp = this.appManager.GetAppByName('Meet');
    if (!meetApp) {
      return false;
    }
    const navConfig: Record<string, string> = {};
    if (config.room) {
      navConfig['room'] = config.room;
    }
    this.navigationService.OpenNavItemByName('Live Room', navConfig, meetApp.ID);
    return true;
  }

  /**
   * Opens the Conversation Console for a `handoff-offer` notification (the `{ type:'handoff-offer', offerId, room }`
   * ResourceConfiguration the server sends when an AI agent offers a conversation to this person). The nav item is built here
   * rather than looked up, so it works without an application metadata row; it lands in the Meet app when present, otherwise
   * in whichever app the person is in. Returns `false` (not handled) for any other notification or when there is no app to host it.
   */
  private navigateToHandoffConsole(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }
    const config = SafeJSONParse<{ type?: string; offerId?: string }>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'handoff-offer') {
      return false;
    }
    const app = this.appManager.GetAppByName('Meet') ?? this.appManager.GetActiveApp();
    if (!app) {
      return false;
    }
    const consoleItem: NavItem = {
      Label: 'Conversation Console',
      Icon: 'fa-solid fa-headset',
      ResourceType: 'Custom',
      DriverClass: 'HumanHandoffConsoleResource',
      Configuration: config.offerId ? { offer: config.offerId } : {},
    };
    this.navigationService.OpenNavItem(app.ID, consoleItem, app.GetColor());
    return true;
  }

  /**
   * Opens the Meet app's Meetings resource for a `meeting` or `meeting-invitation` notification (the
   * `{ type:'meeting', meetingId }` ResourceConfiguration), or when NotificationType is 'Meeting Invitation'.
   * Returns `false` (not handled) when the config isn't a meeting invite or the Meet app is absent.
   */
  private navigateToMeeting(notification: MJUserNotificationEntity): boolean {
    let meetingId: string | undefined;
    if (notification.ResourceConfiguration && notification.ResourceConfiguration.trim().length > 0) {
      const config = SafeJSONParse<{ type?: string; meetingId?: string }>(notification.ResourceConfiguration);
      if (
        config &&
        (config.type?.trim().toLowerCase() === 'meeting' ||
          config.type?.trim().toLowerCase() === 'meeting-invitation')
      ) {
        meetingId = config.meetingId;
      }
    }
    const typeName = notification.NotificationType?.trim();
    if (!meetingId && typeName !== 'Meeting Invitation') {
      return false;
    }
    const app = this.appManager.GetAppByName('Meet') ?? this.appManager.GetActiveApp();
    if (!app) {
      return false;
    }
    const meetingItem: NavItem = {
      Label: 'Meetings',
      Icon: 'fa-solid fa-users',
      ResourceType: 'Custom',
      DriverClass: 'MeetingsResource',
      Configuration: meetingId ? { meeting: meetingId } : {},
    };
    this.navigationService.OpenNavItem(app.ID, meetingItem, app.GetColor());
    return true;
  }

  /**
   * Navigate to a resource-based notification using NavigationService methods.
   * Routes to the correct resource based on the notification's ResourceType.
   */
  private navigateToResource(notification: MJUserNotificationEntity): void {
    if (!notification.ResourceRecordID || !notification.ResourceTypeID) return;

    const rt = this.SharedService.ResourceTypeByID(notification.ResourceTypeID);
    if (!rt) return;

    const recordId = notification.ResourceRecordID.toString();
    const rtName = rt.Name.trim().toLowerCase();

    switch (rtName) {
      case 'records': {
        const config = SafeJSONParse<RecordResourceConfig>(notification.ResourceConfiguration || '');
        if (config?.Entity) {
          const key = new CompositeKey();
          key.SimpleLoadFromURLSegment(recordId);
          this.navigationService.OpenEntityRecord(config.Entity, key);
        }
        break;
      }
      case 'user views':
      case 'mj: user views':
        this.navigationService.OpenView(recordId, 'View');
        break;
      case 'dashboards':
        this.navigationService.OpenDashboard(recordId, 'Dashboard');
        break;
      default:
        console.warn(`[UserNotifications] Unhandled resource type for navigation: ${rt.Name}`);
        break;
    }
  }

  /**
   * Handle navigation to an agent request via NavigationService.
   * Returns true if the notification was an agent-request type and navigation was attempted.
   */
  private navigateToAgentRequest(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }

    const config = SafeJSONParse<AgentRequestResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'agent-request' || !config.requestId) {
      return false;
    }

    // Try the AI app first (has dedicated Agent Requests nav item)
    const aiApp = this.appManager.GetAppByName('AI');
    if (aiApp) {
      this.navigationService.OpenNavItemByName(
        'Agent Requests',
        { requestId: config.requestId },
        aiApp.ID
      );
      return true;
    }

    // Fallback: navigate to Chat app's Conversations with the request context
    const chatApp = this.appManager.GetAppByName('Chat');
    if (chatApp) {
      this.navigationService.OpenNavItemByName(
        'Conversations',
        { requestId: config.requestId },
        chatApp.ID
      );
      return true;
    }

    return false;
  }

  /**
   * Handle navigation to a conversation via NavigationService.
   * Returns true if the notification was a conversation type and navigation was attempted.
   */
  private navigateToConversation(notification: MJUserNotificationEntity): boolean {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return false;
    }

    const config = SafeJSONParse<ConversationResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'conversation') {
      return false;
    }

    const chatApp = this.appManager.GetAppByName('Chat');
    if (!chatApp) {
      return false;
    }

    const navConfig: Record<string, string> = {};
    if (config.conversationId) navConfig['conversationId'] = config.conversationId;
    if (config.messageId) navConfig['messageId'] = config.messageId;
    if (config.artifactId) navConfig['artifactId'] = config.artifactId;
    if (config.versionNumber) navConfig['versionNumber'] = config.versionNumber;
    if (config.taskId) navConfig['taskId'] = config.taskId;

    // The Chat tab is usually already open and gets reused; a reused tab reads its configuration
    // only at init, so the same values go in the query params, which it does react to.
    this.navigationService.OpenNavItemByName(
      'Conversations',
      navConfig,
      chatApp.ID,
      { queryParams: { ...navConfig } }
    );
    return true;
  }

  /** The tour config of a notification, or null when not a tour launch notification. */
  private parseTourConfig(notification: MJUserNotificationEntity): TourResourceConfig | null {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return null;
    }
    const config = SafeJSONParse<TourResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'tour' || !config.tourKey) {
      return null;
    }
    return config;
  }

  /** Launches a guided tour when a `{ type: 'tour', tourKey }` notification is clicked. */
  private navigateToTour(notification: MJUserNotificationEntity): boolean {
    const config = this.parseTourConfig(notification);
    if (!config) {
      return false;
    }
    TourSignals.Instance.Emit('core.tour.launchRequest', {
      tourKey: config.tourKey,
      mode: config.guideMode,
      startAtStepKey: config.startAtStepKey,
      launchSource: 'Notification',
    });
    return true;
  }

  /** The routine-run config of a notification, or null when it is not one (or names no routine). */
  private parseUserRoutineConfig(notification: MJUserNotificationEntity): UserRoutineResourceConfig | null {
    if (!notification.ResourceConfiguration || notification.ResourceConfiguration.trim().length === 0) {
      return null;
    }
    const config = SafeJSONParse<UserRoutineResourceConfig>(notification.ResourceConfiguration);
    if (!config || config.type?.trim().toLowerCase() !== 'userroutine' || !config.routineId) {
      return null;
    }
    return config;
  }

  /**
   * Opens what a routine run produced: its reply, in the routine's own conversation (the
   * `{ type:'UserRoutine', routineId, runId, conversationId? }` ResourceConfiguration). That
   * conversation is application-scoped, so the chat sidebar never lists it; the click deep-links
   * into the Chat app's Conversations item. A notification written before the config carried the
   * conversation reads it off the routine; a routine with no conversation opens in the Routines
   * app. Returns false (not handled) when the notification is not a routine run.
   */
  private navigateToUserRoutine(notification: MJUserNotificationEntity): boolean {
    const config = this.parseUserRoutineConfig(notification);
    if (!config) {
      return false;
    }
    void this.openUserRoutineOutput(config);
    return true;
  }

  private async openUserRoutineOutput(config: UserRoutineResourceConfig): Promise<void> {
    const conversationId = config.conversationId ?? await this.loadRoutineConversationId(config.routineId);
    const chatApp = conversationId ? this.appManager.GetAppByName('Chat') : null;
    if (conversationId && chatApp) {
      // Query params as well as configuration: an already-open Chat tab is reused and reacts
      // only to a query-param change (its configuration is read once, at init).
      await this.navigationService.OpenNavItemByName('Conversations', { conversationId }, chatApp.ID, { queryParams: { conversationId } });
      return;
    }
    const routinesApp = this.appManager.GetAppByName('Routines');
    if (routinesApp) {
      await this.navigationService.OpenNavItemByName('My Routines', { routine: config.routineId }, routinesApp.ID);
      return;
    }
    MJNotificationService.Instance.CreateSimpleNotification('The Routines app is not installed, so this routine cannot be opened', 'error', 4000);
  }

  /** The routine's ConversationID, or null when the routine cannot be read or has none. */
  private async loadRoutineConversationId(routineId: string): Promise<string | null> {
    const p = this.ProviderToUse;
    const routine = await p.GetEntityObject<MJUserRoutineEntity>('MJ: User Routines', p.CurrentUser);
    if (!await routine.Load(routineId)) {
      return null;
    }
    return routine.ConversationID ?? null;
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
    const type = this.GetNotificationType(notification.NotificationTypeID);
    return type?.Icon || 'fa-bell';
  }

  /** @deprecated Use {@link GetTypeIcon}. */
  public getTypeIcon(notification: MJUserNotificationEntity): string {
    return this.GetTypeIcon(notification);
  }

  public GetTypeColor(notification: MJUserNotificationEntity): string {
    const type = this.GetNotificationType(notification.NotificationTypeID);
    return type?.Color || 'var(--mj-text-muted)';
  }

  /** @deprecated Use {@link GetTypeColor}. */
  public getTypeColor(notification: MJUserNotificationEntity): string {
    return this.GetTypeColor(notification);
  }

  public GetTypeName(notification: MJUserNotificationEntity): string {
    const type = this.GetNotificationType(notification.NotificationTypeID);
    return type ? type.Name : 'Notification';
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
