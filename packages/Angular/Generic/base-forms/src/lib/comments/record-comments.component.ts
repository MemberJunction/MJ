import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    ElementRef,
    EventEmitter,
    HostListener,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    ViewChild,
    inject
} from '@angular/core';
import { BaseEntity, IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import {
    AnchoredCommentRollup,
    ConversationAnchorMetadata,
    ConversationAnchorType,
    MJConversationDetailEntity,
    MJConversationEntity,
    ParseConversationAnchorMetadata
} from '@memberjunction/core-entities';
import { EscapeHTML, EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { Subscription } from 'rxjs';
import { FormNavigationEvent } from '../types/navigation-events';
import {
    FormCommentAnchorNavigationRequest,
    FormCommentAnchorTarget,
    FormRecordCommentsCoordinatorService
} from './form-record-comments-coordinator.service';

/**
 * Candidate user or AI agent shown in the `@mention` autocomplete menu inside the comment composer.
 */
export interface CommentMentionCandidate {
    Type: 'user' | 'agent';
    ID: string;
    Name: string;
    Subtitle: string | null;
}

/**
 * Plain-text segment of a parsed comment message.
 */
export interface RecordCommentMessageTextSegment {
    Kind: 'text';
    Text: string;
}

/**
 * Interactive `@mention` chip segment of a parsed comment message, linked to `MJ: Users` or `MJ: AI Agents`.
 */
export interface RecordCommentMessageMentionSegment {
    Kind: 'mention';
    MentionType: 'user' | 'agent';
    ID: string | null;
    Name: string;
    EntityName: 'MJ: Users' | 'MJ: AI Agents';
}

export type RecordCommentMessageSegment =
    | RecordCommentMessageTextSegment
    | RecordCommentMessageMentionSegment;

/**
 * View-model for a single anchored comment thread rendered in `<mj-record-comments>`.
 */
export interface RecordCommentThreadView {
    Conversation: MJConversationEntity;
    Metadata: ConversationAnchorMetadata | null;
    AnchorType: ConversationAnchorType;
    AnchorKey: string | null;
    AnchorBadgeLabel: string;
    AnchorIcon: string;
    SectionGroupKey: string;
    SectionGroupTitle: string;
    SectionGroupIcon: string;
    QuotedValue: string | null;
    CurrentLiveValue: string | null;
    HasValueChangedSinceComment: boolean;
    RestrictedFields: readonly string[];
    Messages: readonly MJConversationDetailEntity[];
}

/**
 * Group of anchored comment threads organized by form section / location in the side-rail drawer.
 */
export interface RecordCommentSectionGroup {
    GroupKey: string;
    GroupTitle: string;
    GroupIcon: string;
    Threads: readonly RecordCommentThreadView[];
}

const JSON_MENTION_REGEX = /@\{[^{}]+\}/g;

/**
 * Renders threaded, anchored record comments (`MJ: Conversations` + `MJ: Conversation Details`)
 * in either a right-hand slide-in `'drawer'` or an inline field/section-tethered `'popover'`.
 */
@Component({
    standalone: false,
    selector: 'mj-record-comments',
    templateUrl: './record-comments.component.html',
    styleUrls: ['./record-comments.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class MjRecordCommentsComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
    private readonly cdr = inject(ChangeDetectorRef);
    private readonly hostRef = inject(ElementRef<HTMLElement>);
    public readonly Coordinator = inject(FormRecordCommentsCoordinatorService, { optional: true });

    @Input() Record: BaseEntity | null = null;
    @Input() Mode: 'drawer' | 'popover' = 'drawer';
    @Input() IsOpen = false;
    @Input() WidthPx = 400;

    @Output() Close = new EventEmitter<void>();
    @Output() CommentCountChange = new EventEmitter<number>();
    @Output() RollupChange = new EventEmitter<AnchoredCommentRollup>();
    @Output() NavigateToAnchor = new EventEmitter<FormCommentAnchorNavigationRequest>();
    @Output() Navigate = new EventEmitter<FormNavigationEvent>();

    @ViewChild('newThreadTextarea') private newThreadTextarea?: ElementRef<HTMLTextAreaElement>;

    public NewThreadMessage = '';
    public IsSubmittingNewThread = false;
    public ReplyDraftByConversationId = new Map<string, string>();
    public SubmittingReplyConversationId: string | null = null;
    public ResolvingConversationId: string | null = null;
    public ErrorBannerMessage: string | null = null;
    public IsPopoverExpanded = false;
    public IsResizingDrawer = false;
    private drawerResizeCleanup: (() => void) | null = null;

    // @Mention autocomplete state
    public MentionCandidates: CommentMentionCandidate[] = [];
    public FilteredMentionCandidates: CommentMentionCandidate[] = [];
    public SelectedMentionsByContext = new Map<string, Map<string, CommentMentionCandidate>>();
    public ActiveMentionContext: {
        Target: 'new' | string; // 'new' or conversationId
        Query: string;
        TriggerIndex: number;
        SelectedIndex: number;
    } | null = null;
    private mentionCandidatesLoaded = false;

    // IME composition tracking (per modern-web-guidance `ime-safe-enter-submit`)
    private lastCompositionEndAt: number | null = null;

    private coordinatorSub: Subscription | null = null;

    public ngOnInit(): void {
        if (this.Coordinator) {
            this.coordinatorSub = this.Coordinator.Changed$.subscribe(() => {
                const rollup = this.Coordinator!.Rollup;
                this.CommentCountChange.emit(rollup.TotalOpenCount);
                this.RollupChange.emit(rollup);
                this.cdr.markForCheck();
            });
            if (this.Record) {
                this.Coordinator.BindRecord(this.Record, this.ProviderToUse);
            }
        }
    }

    public ngOnChanges(changes: SimpleChanges): void {
        if (changes['Record'] && this.Coordinator) {
            this.Coordinator.BindRecord(this.Record, this.ProviderToUse);
        }
        if (changes['IsOpen'] && this.IsOpen) {
            if (this.Coordinator && !this.Coordinator.IsLoaded && !this.Coordinator.IsLoading) {
                void this.Coordinator.LoadForRecord(this.Record, this.ProviderToUse);
            }
            setTimeout(() => {
                this.newThreadTextarea?.nativeElement?.focus();
            }, 40);
        }
    }

    public ngOnDestroy(): void {
        this.coordinatorSub?.unsubscribe();
        this.coordinatorSub = null;
        this.drawerResizeCleanup?.();
        this.drawerResizeCleanup = null;
    }

    public get CanUserPostComments(): boolean {
        const entityInfo = this.Record?.EntityInfo;
        if (!entityInfo) return true;
        if (entityInfo.AllowRecordComments === false) return false;
        const user = this.Coordinator?.CurrentUser ?? this.ProviderToUse?.CurrentUser;
        if (!user) return true;
        return entityInfo.CanUserComment(user);
    }

    @HostListener('document:keydown.escape', ['$event'])
    public OnEscapeKey(event: Event): void {
        if (this.ActiveMentionContext) {
            this.ActiveMentionContext = null;
            event.stopPropagation();
            this.cdr.markForCheck();
            return;
        }
        if (this.Mode === 'popover' && this.PopoverTarget) {
            this.OnClose();
            event.stopPropagation();
        }
    }

    public get PopoverTarget(): FormCommentAnchorTarget | null {
        return this.Coordinator?.ActivePopoverTarget ?? null;
    }

    public get PopoverStyle(): Record<string, string> {
        const rect = this.PopoverTarget?.AnchorRect;
        const cardWidth = this.IsPopoverExpanded ? 560 : 400;
        const cardMaxHeight = this.IsPopoverExpanded ? 640 : 480;
        if (!rect || typeof window === 'undefined') {
            return {
                top: '96px',
                right: '24px',
                width: `${cardWidth}px`
            };
        }
        const viewportW = window.innerWidth || 1280;
        const viewportH = window.innerHeight || 800;

        let left = rect.left;
        if (left + cardWidth + 16 > viewportW) {
            left = Math.max(16, viewportW - cardWidth - 16);
        }
        let top = rect.bottom + 8;
        if (top + cardMaxHeight > viewportH && rect.top - cardMaxHeight - 8 > 16) {
            top = Math.max(16, rect.top - Math.min(cardMaxHeight, 340) - 8);
        } else if (top + 280 > viewportH) {
            top = Math.max(16, viewportH - Math.min(cardMaxHeight, viewportH - 32));
        }
        return {
            top: `${Math.round(top)}px`,
            left: `${Math.round(left)}px`,
            width: `${cardWidth}px`
        };
    }

    public OnTogglePopoverExpand(): void {
        this.IsPopoverExpanded = !this.IsPopoverExpanded;
        this.cdr.markForCheck();
    }

    public OnDrawerResizeStart(event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window === 'undefined') return;

        this.IsResizingDrawer = true;
        const onMouseMove = (moveEvent: MouseEvent) => {
            const viewportW = window.innerWidth || 1280;
            const desiredWidth = viewportW - moveEvent.clientX;
            this.WidthPx = Math.max(340, Math.min(860, Math.round(desiredWidth)));
            this.cdr.markForCheck();
        };
        const onMouseUp = () => {
            this.IsResizingDrawer = false;
            this.drawerResizeCleanup?.();
            this.drawerResizeCleanup = null;
            this.cdr.markForCheck();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        this.drawerResizeCleanup = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }

    public get StatusFilter(): 'open' | 'resolved' | 'all' {
        return this.Coordinator?.DrawerStatusFilter ?? 'open';
    }

    public get TargetFilter(): FormCommentAnchorTarget | null {
        return this.Mode === 'popover'
            ? this.PopoverTarget
            : (this.Coordinator?.DrawerTargetFilter ?? null);
    }

    public get OpenCount(): number {
        return this.Coordinator?.Rollup.TotalOpenCount ?? 0;
    }

    public get ResolvedCount(): number {
        return this.Coordinator?.Rollup.TotalResolvedCount ?? 0;
    }

    public get IsLoading(): boolean {
        return this.Coordinator?.IsLoading ?? false;
    }

    public get VisibleThreads(): RecordCommentThreadView[] {
        const coordinator = this.Coordinator;
        if (!coordinator) return [];

        const statusFilter = this.Mode === 'popover' ? 'open' : this.StatusFilter;
        const targetFilter = this.TargetFilter;

        const out: RecordCommentThreadView[] = [];
        for (const conv of coordinator.Conversations) {
            if (!conv.AnchorType) continue;
            if (statusFilter === 'open' && conv.IsResolved) continue;
            if (statusFilter === 'resolved' && !conv.IsResolved) continue;

            const meta = ParseConversationAnchorMetadata(conv.AnchorMetadataObject ?? conv.AnchorMetadata);
            if (targetFilter) {
                if (!this.matchesTargetFilter(conv, meta, targetFilter)) {
                    continue;
                }
            }

            out.push(this.buildThreadView(conv, meta, coordinator.GetDetailsForConversation(conv.ID)));
        }

        return out;
    }

    /**
     * Organizes `VisibleThreads` into logical section groups (`Details / Model Overview`,
     * `System Metadata`, `Record Comments`, etc.) so the side-rail drawer shows all record
     * comments clearly organized in one place.
     */
    public get GroupedVisibleThreads(): RecordCommentSectionGroup[] {
        const threads = this.VisibleThreads;
        if (threads.length === 0) return [];

        const groupsByKey = new Map<string, { GroupKey: string; GroupTitle: string; GroupIcon: string; Threads: RecordCommentThreadView[] }>();
        for (const thread of threads) {
            const key = thread.SectionGroupKey;
            let group = groupsByKey.get(key);
            if (!group) {
                group = {
                    GroupKey: key,
                    GroupTitle: thread.SectionGroupTitle,
                    GroupIcon: thread.SectionGroupIcon,
                    Threads: []
                };
                groupsByKey.set(key, group);
            }
            group.Threads.push(thread);
        }

        return Array.from(groupsByKey.values());
    }

    public OnStatusFilterChange(status: 'open' | 'resolved' | 'all'): void {
        this.Coordinator?.SetDrawerStatusFilter(status);
    }

    public OnClearTargetFilter(): void {
        this.Coordinator?.SetDrawerTargetFilter(null);
    }

    public OnSwitchPopoverToDrawer(): void {
        this.IsPopoverExpanded = false;
        this.Coordinator?.SetDrawerOpen(true, null);
    }

    public OnClose(): void {
        if (this.Mode === 'popover') {
            this.Coordinator?.ClosePopover();
        } else {
            this.Coordinator?.SetDrawerOpen(false);
        }
        this.Close.emit();
    }

    public OnRefresh(): void {
        void this.Coordinator?.LoadForRecord(this.Record, this.ProviderToUse, true);
    }

    public OnAnchorBadgeClick(thread: RecordCommentThreadView): void {
        const req: FormCommentAnchorNavigationRequest = {
            AnchorType: thread.AnchorType,
            AnchorKey: thread.AnchorKey,
            SectionKey: thread.Metadata?.sectionKey ?? (thread.AnchorType === 'Section' ? thread.AnchorKey : null),
            GroupKey: thread.Metadata?.groupKey ?? (thread.AnchorType === 'Group' ? thread.AnchorKey : null)
        };
        this.Coordinator?.RequestNavigateToAnchor(req);
        this.NavigateToAnchor.emit(req);
        if (this.Mode === 'popover') {
            this.Coordinator?.ClosePopover();
        }
    }

    /**
     * Records the native `event.timeStamp` on `compositionend` per `ime-safe-enter-submit`
     * to prevent premature submission on Safari where `compositionend` fires before `keydown`.
     */
    public OnComposerCompositionEnd(event: CompositionEvent): void {
        this.lastCompositionEndAt = event.timeStamp;
    }

    /**
     * Handles keyboard navigation in `@mention` menu and IME-safe `Enter` (without `Shift`)
     * or `Cmd/Ctrl+Enter` submission in comment textareas.
     */
    public OnComposerKeydown(event: KeyboardEvent, contextKey: 'new' | string): void {
        if (this.ActiveMentionContext && this.ActiveMentionContext.Target === contextKey && this.FilteredMentionCandidates.length > 0) {
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                this.ActiveMentionContext.SelectedIndex =
                    (this.ActiveMentionContext.SelectedIndex + 1) % this.FilteredMentionCandidates.length;
                this.cdr.markForCheck();
                return;
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                this.ActiveMentionContext.SelectedIndex =
                    (this.ActiveMentionContext.SelectedIndex - 1 + this.FilteredMentionCandidates.length) %
                    this.FilteredMentionCandidates.length;
                this.cdr.markForCheck();
                return;
            }
            if (event.key === 'Enter' || event.key === 'Tab') {
                if (event.isComposing || event.keyCode === 229) {
                    return;
                }
                event.preventDefault();
                const chosen = this.FilteredMentionCandidates[this.ActiveMentionContext.SelectedIndex];
                if (chosen) {
                    this.InsertMentionCandidate(chosen, contextKey);
                }
                return;
            }
        }

        const isCmdOrCtrlEnter = event.key === 'Enter' && (event.metaKey || event.ctrlKey);
        const isPlainEnter = event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey;

        if (isCmdOrCtrlEnter || isPlainEnter) {
            event.preventDefault();

            if (isPlainEnter) {
                if (event.isComposing || event.keyCode === 229) {
                    return;
                }
                if (
                    this.lastCompositionEndAt !== null &&
                    Math.abs(event.timeStamp - this.lastCompositionEndAt) < 50
                ) {
                    return;
                }
            }

            if (contextKey === 'new') {
                void this.OnSubmitNewThread();
            } else {
                void this.OnSubmitReply(contextKey);
            }
        }
    }

    public OnNewThreadInput(event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.NewThreadMessage = textarea.value;
        this.updateMentionAutocomplete('new', textarea.value, textarea.selectionStart ?? textarea.value.length);
    }

    public OnReplyInput(conversationId: string, event: Event): void {
        const textarea = event.target as HTMLTextAreaElement;
        this.ReplyDraftByConversationId.set(NormalizeUUID(conversationId), textarea.value);
        this.updateMentionAutocomplete(conversationId, textarea.value, textarea.selectionStart ?? textarea.value.length);
    }

    public GetReplyDraft(conversationId: string): string {
        return this.ReplyDraftByConversationId.get(NormalizeUUID(conversationId)) ?? '';
    }

    public InsertMentionCandidate(candidate: CommentMentionCandidate, contextKey: 'new' | string): void {
        const active = this.ActiveMentionContext;
        if (!active) return;

        const normKey = contextKey === 'new' ? 'new' : NormalizeUUID(contextKey);
        let contextMap = this.SelectedMentionsByContext.get(normKey);
        if (!contextMap) {
            contextMap = new Map<string, CommentMentionCandidate>();
            this.SelectedMentionsByContext.set(normKey, contextMap);
        }
        contextMap.set(candidate.Name.trim().toLowerCase(), candidate);

        const displayToken = `@${candidate.Name} `;
        const currentText = contextKey === 'new' ? this.NewThreadMessage : this.GetReplyDraft(contextKey);
        const before = currentText.slice(0, active.TriggerIndex);
        const after = currentText.slice(active.TriggerIndex + 1 + active.Query.length);
        const updated = `${before}${displayToken}${after}`;

        if (contextKey === 'new') {
            this.NewThreadMessage = updated;
        } else {
            this.ReplyDraftByConversationId.set(normKey, updated);
        }
        this.ActiveMentionContext = null;
        this.cdr.markForCheck();
    }

    /**
     * Returns the list of mentioned users/agents currently present in the draft for `contextKey`,
     * used to render interactive tagged chips right inside the composer.
     */
    public GetDraftMentions(contextKey: 'new' | string): CommentMentionCandidate[] {
        const normKey = contextKey === 'new' ? 'new' : NormalizeUUID(contextKey);
        const text = (contextKey === 'new' ? this.NewThreadMessage : this.GetReplyDraft(contextKey)).toLowerCase();
        if (!text.includes('@')) return [];

        const candidatesByName = new Map<string, CommentMentionCandidate>();
        const contextMap = this.SelectedMentionsByContext.get(normKey);
        if (contextMap) {
            for (const [k, v] of contextMap.entries()) {
                candidatesByName.set(k, v);
            }
        }
        for (const cand of this.MentionCandidates ?? []) {
            const key = cand.Name.trim().toLowerCase();
            if (!candidatesByName.has(key)) {
                candidatesByName.set(key, cand);
            }
        }

        const matched: CommentMentionCandidate[] = [];
        for (const [nameLower, cand] of candidatesByName.entries()) {
            if (nameLower && text.includes(`@${nameLower}`)) {
                matched.push(cand);
            }
        }
        return matched;
    }

    /**
     * Removes a tagged mention chip from the composer draft.
     */
    public RemoveDraftMention(candidate: CommentMentionCandidate, contextKey: 'new' | string): void {
        const normKey = contextKey === 'new' ? 'new' : NormalizeUUID(contextKey);
        this.SelectedMentionsByContext.get(normKey)?.delete(candidate.Name.trim().toLowerCase());

        const currentText = contextKey === 'new' ? this.NewThreadMessage : this.GetReplyDraft(contextKey);
        const escapedName = candidate.Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const cleaned = currentText.replace(new RegExp(`@${escapedName}\\s?`, 'gi'), '').trimStart();

        if (contextKey === 'new') {
            this.NewThreadMessage = cleaned;
        } else {
            this.ReplyDraftByConversationId.set(normKey, cleaned);
        }
        this.cdr.markForCheck();
    }

    /**
     * Converts human-readable `@Name` mentions in a composer draft into canonical
     * `@{"type":"user"|"agent","id":"...","name":"..."}` wire tokens before saving.
     */
    public SerializeMentionsForWire(rawText: string, contextKey: 'new' | string): string {
        if (!rawText || !rawText.includes('@')) {
            return rawText;
        }
        const normKey = contextKey === 'new' ? 'new' : NormalizeUUID(contextKey);
        const candidatesByName = new Map<string, CommentMentionCandidate>();
        const contextMap = this.SelectedMentionsByContext.get(normKey);
        if (contextMap) {
            for (const [k, v] of contextMap.entries()) {
                candidatesByName.set(k, v);
            }
        }
        for (const cand of this.MentionCandidates ?? []) {
            const key = cand.Name.trim().toLowerCase();
            if (!candidatesByName.has(key)) {
                candidatesByName.set(key, cand);
            }
        }
        if (candidatesByName.size === 0) {
            return rawText;
        }

        const sortedCandidates = Array.from(candidatesByName.values()).sort(
            (a, b) => b.Name.length - a.Name.length
        );

        let serialized = rawText;
        for (const cand of sortedCandidates) {
            const escapedName = cand.Name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`@${escapedName}(?=$|[\\s.,!?;:)])`, 'gi');
            const wireToken = `@{"type":"${cand.Type}","id":"${cand.ID}","name":${JSON.stringify(cand.Name)}}`;
            serialized = serialized.replace(pattern, wireToken);
        }
        return serialized;
    }

    public async OnSubmitNewThread(): Promise<void> {
        const rawText = this.NewThreadMessage.trim();
        if (!rawText || this.IsSubmittingNewThread || !this.Coordinator) {
            return;
        }
        const text = this.SerializeMentionsForWire(rawText, 'new');

        this.IsSubmittingNewThread = true;
        this.ErrorBannerMessage = null;
        this.cdr.markForCheck();

        try {
            const target = this.TargetFilter;
            const anchorType: ConversationAnchorType = target?.AnchorType ?? 'Record';
            const anchorKey = target?.AnchorKey ?? null;
            const metadata: ConversationAnchorMetadata = {
                anchorDisplayName: target?.Label || this.Record?.EntityInfo?.DisplayNameOrName || 'Record Comment',
                fieldName: anchorType === 'Field' ? (anchorKey ?? undefined) : undefined,
                sectionKey: target?.SectionKey,
                sectionDisplayName: target?.SectionDisplayName,
                groupKey: target?.GroupKey,
                groupDisplayName: target?.GroupDisplayName,
                quotedValue: target?.QuotedValue
            };

            await this.Coordinator.StartAnchoredThread({
                AnchorType: anchorType,
                AnchorKey: anchorKey,
                AnchorMetadata: metadata,
                Message: text,
                Name: target?.Label ? `${target.Label} Comment` : undefined
            });
            this.NewThreadMessage = '';
            this.SelectedMentionsByContext.delete('new');
            this.ActiveMentionContext = null;
        } catch (error) {
            this.ErrorBannerMessage = error instanceof Error ? error.message : String(error);
        } finally {
            this.IsSubmittingNewThread = false;
            this.cdr.markForCheck();
        }
    }

    public async OnSubmitReply(conversationId: string): Promise<void> {
        const normId = NormalizeUUID(conversationId);
        const rawText = (this.ReplyDraftByConversationId.get(normId) ?? '').trim();
        if (!rawText || this.SubmittingReplyConversationId || !this.Coordinator) {
            return;
        }
        const text = this.SerializeMentionsForWire(rawText, normId);

        this.SubmittingReplyConversationId = conversationId;
        this.ErrorBannerMessage = null;
        this.cdr.markForCheck();

        try {
            await this.Coordinator.PostReply(conversationId, text);
            this.ReplyDraftByConversationId.delete(normId);
            this.SelectedMentionsByContext.delete(normId);
            this.ActiveMentionContext = null;
        } catch (error) {
            this.ErrorBannerMessage = error instanceof Error ? error.message : String(error);
        } finally {
            this.SubmittingReplyConversationId = null;
            this.cdr.markForCheck();
        }
    }

    public async OnToggleResolve(thread: RecordCommentThreadView, event: Event): Promise<void> {
        event.stopPropagation();
        if (this.ResolvingConversationId || !this.Coordinator) return;

        const convId = thread.Conversation.ID;
        this.ResolvingConversationId = convId;
        this.ErrorBannerMessage = null;
        this.cdr.markForCheck();

        try {
            await this.Coordinator.ToggleResolved(convId, !thread.Conversation.IsResolved);
        } catch (error) {
            this.ErrorBannerMessage = error instanceof Error ? error.message : String(error);
        } finally {
            this.ResolvingConversationId = null;
            this.cdr.markForCheck();
        }
    }

    /**
     * Relays record navigation events emitted by clickable `@mention` chips (`[mjRecordLink]`)
     * to the parent `<mj-record-form-container>` and closes the inline popover when active.
     */
    public OnMentionRecordNavigate(event: FormNavigationEvent): void {
        this.Navigate.emit(event);
        if (this.Mode === 'popover') {
            this.Coordinator?.ClosePopover();
        }
    }

    /**
     * Parses a comment message into strongly-typed text and `@mention` segments so the template
     * can render interactive `[mjRecordLink]` chips for tagged users (`MJ: Users`) and agents (`MJ: AI Agents`).
     */
    public ParseMessageSegments(rawMessage: string | null | undefined): RecordCommentMessageSegment[] {
        const text = (rawMessage ?? '').trim();
        if (!text) return [];

        let lastIndex = 0;
        const segments: RecordCommentMessageSegment[] = [];
        for (const match of text.matchAll(JSON_MENTION_REGEX)) {
            const matchIdx = match.index ?? 0;
            if (matchIdx > lastIndex) {
                segments.push({
                    Kind: 'text',
                    Text: text.slice(lastIndex, matchIdx)
                });
            }
            const token = match[0];
            try {
                const parsed = JSON.parse(token.slice(1)) as { type?: string; id?: string; name?: string };
                const name = typeof parsed?.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'User';
                const kind = parsed?.type === 'agent' ? 'agent' : 'user';
                const id = typeof parsed?.id === 'string' && parsed.id.trim() ? parsed.id.trim() : null;
                segments.push({
                    Kind: 'mention',
                    MentionType: kind,
                    ID: id,
                    Name: name,
                    EntityName: kind === 'agent' ? 'MJ: AI Agents' : 'MJ: Users'
                });
            } catch {
                segments.push({
                    Kind: 'text',
                    Text: token
                });
            }
            lastIndex = matchIdx + token.length;
        }
        if (lastIndex < text.length) {
            segments.push({
                Kind: 'text',
                Text: text.slice(lastIndex)
            });
        }
        return segments;
    }

    /**
     * Renders a message body as safe HTML with `@mention` tokens styled as pill badges.
     */
    public FormatMessageHtml(rawMessage: string | null | undefined): string {
        const segments = this.ParseMessageSegments(rawMessage);
        if (segments.length === 0) return '';

        return segments
            .map((seg) => {
                if (seg.Kind === 'mention') {
                    const idAttr = seg.ID ? ` data-mention-id="${EscapeHTML(seg.ID)}"` : '';
                    const entityAttr = ` data-entity-name="${EscapeHTML(seg.EntityName)}"`;
                    return `<span class="mj-record-comments__mention-pill mj-record-comments__mention-pill--${seg.MentionType}"${idAttr}${entityAttr}>@${EscapeHTML(seg.Name)}</span>`;
                }
                return EscapeHTML(seg.Text).replace(/\n/g, '<br>');
            })
            .join('');
    }

    public FormatAuthorInitials(detail: MJConversationDetailEntity): string {
        if (detail.Role === 'AI') {
            return 'AI';
        }
        const name = (detail.User || 'User').trim();
        const words = name.split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    public FormatRelativeTime(value: Date | string | null | undefined): string {
        if (!value) return '';
        const date = value instanceof Date ? value : new Date(String(value));
        if (isNaN(date.getTime())) return '';
        const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
        if (diffSec < 45) return 'Just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    private matchesTargetFilter(
        conv: MJConversationEntity,
        meta: ConversationAnchorMetadata | null,
        target: FormCommentAnchorTarget
    ): boolean {
        const targetKeyLower = (target.AnchorKey ?? '').trim().toLowerCase();
        if (target.AnchorType === 'Field') {
            if (conv.AnchorType !== 'Field') return false;
            const convField = (conv.AnchorKey || meta?.fieldName || '').trim().toLowerCase();
            return convField === targetKeyLower;
        }
        if (target.AnchorType === 'Section') {
            if (conv.AnchorType === 'Section' && (conv.AnchorKey ?? '').trim().toLowerCase() === targetKeyLower) {
                return true;
            }
            return (meta?.sectionKey ?? '').trim().toLowerCase() === targetKeyLower;
        }
        if (target.AnchorType === 'Group') {
            if (conv.AnchorType === 'Group' && (conv.AnchorKey ?? '').trim().toLowerCase() === targetKeyLower) {
                return true;
            }
            return (meta?.groupKey ?? '').trim().toLowerCase() === targetKeyLower;
        }
        return conv.AnchorType === target.AnchorType;
    }

    private buildThreadView(
        conv: MJConversationEntity,
        meta: ConversationAnchorMetadata | null,
        messages: readonly MJConversationDetailEntity[]
    ): RecordCommentThreadView {
        const anchorType = conv.AnchorType ?? 'Record';
        const anchorKey = conv.AnchorKey ?? null;
        const badgeLabel = this.resolveAnchorBadgeLabel(anchorType, anchorKey, meta);
        const icon = this.resolveAnchorIcon(anchorType);
        const sectionGroup = this.resolveSectionGroup(anchorType, anchorKey, meta);

        const quotedValue = meta?.quotedValue ?? null;
        let currentLiveValue: string | null = null;
        let hasValueChanged = false;

        if (anchorType === 'Field' && (anchorKey || meta?.fieldName) && this.Record) {
            const fieldName = (anchorKey || meta?.fieldName || '').trim();
            const field = this.Record.Fields.find((f) => f.Name.toLowerCase() === fieldName.toLowerCase());
            if (field) {
                currentLiveValue = field.Value != null && String(field.Value).trim() !== ''
                    ? String(field.Value).trim()
                    : '(empty)';
                if (quotedValue != null && quotedValue.trim() !== currentLiveValue) {
                    hasValueChanged = true;
                }
            }
        }

        return {
            Conversation: conv,
            Metadata: meta,
            AnchorType: anchorType,
            AnchorKey: anchorKey,
            AnchorBadgeLabel: badgeLabel,
            AnchorIcon: icon,
            SectionGroupKey: sectionGroup.GroupKey,
            SectionGroupTitle: sectionGroup.GroupTitle,
            SectionGroupIcon: sectionGroup.GroupIcon,
            QuotedValue: quotedValue,
            CurrentLiveValue: currentLiveValue,
            HasValueChangedSinceComment: hasValueChanged,
            RestrictedFields: meta?.restrictedFields ?? [],
            Messages: messages
        };
    }

    private resolveSectionGroup(
        anchorType: ConversationAnchorType,
        anchorKey: string | null,
        meta: ConversationAnchorMetadata | null
    ): { GroupKey: string; GroupTitle: string; GroupIcon: string } {
        if (meta?.sectionDisplayName || meta?.sectionKey) {
            const title = (
                meta.sectionDisplayName ||
                (anchorType === 'Section' ? meta.anchorDisplayName : undefined) ||
                meta.sectionKey ||
                'Section'
            ).trim();
            const key = (meta.sectionKey || title).trim().toLowerCase().replace(/\s+/g, '');
            return {
                GroupKey: `section:${key}`,
                GroupTitle: title,
                GroupIcon: key.includes('system') ? 'fa-solid fa-database' : 'fa-solid fa-layer-group'
            };
        }
        if (anchorType === 'Section') {
            const title = (meta?.anchorDisplayName || meta?.sectionDisplayName || anchorKey || 'Section').trim();
            const key = (anchorKey || title).toLowerCase().replace(/\s+/g, '');
            return {
                GroupKey: `section:${key}`,
                GroupTitle: title,
                GroupIcon: key.includes('system') ? 'fa-solid fa-database' : 'fa-solid fa-layer-group'
            };
        }
        if (anchorType === 'Field') {
            const fName = (anchorKey || meta?.fieldName || '').trim();
            if (fName.startsWith('__mj_') || fName.toLowerCase() === 'id') {
                return {
                    GroupKey: 'section:systemmetadata',
                    GroupTitle: 'System Metadata',
                    GroupIcon: 'fa-solid fa-database'
                };
            }
            const fInfo = this.Record?.EntityInfo?.Fields.find(
                (f) => f.Name.toLowerCase() === fName.toLowerCase()
            );
            const category = fInfo?.Category?.trim();
            if (category) {
                return {
                    GroupKey: `section:${category.toLowerCase()}`,
                    GroupTitle: category,
                    GroupIcon: 'fa-solid fa-layer-group'
                };
            }
            return {
                GroupKey: 'section:details',
                GroupTitle: 'Details',
                GroupIcon: 'fa-solid fa-circle-info'
            };
        }
        if (anchorType === 'Group') {
            const title = (meta?.groupDisplayName || anchorKey || 'Section Group').trim();
            return {
                GroupKey: `group:${title.toLowerCase()}`,
                GroupTitle: title,
                GroupIcon: 'fa-solid fa-table-columns'
            };
        }
        return {
            GroupKey: 'record:general',
            GroupTitle: 'General Record Comments',
            GroupIcon: 'fa-regular fa-comment-dots'
        };
    }

    private resolveAnchorBadgeLabel(
        anchorType: ConversationAnchorType,
        anchorKey: string | null,
        meta: ConversationAnchorMetadata | null
    ): string {
        if (meta?.anchorDisplayName) {
            return meta.anchorDisplayName;
        }
        if (anchorType === 'Field') {
            const fName = anchorKey || meta?.fieldName || 'Field';
            const fInfo = this.Record?.EntityInfo?.Fields.find(
                (f) => f.Name.toLowerCase() === fName.toLowerCase()
            );
            return fInfo?.DisplayNameOrName || fName;
        }
        if (anchorType === 'Section') {
            return meta?.sectionDisplayName || anchorKey || 'Section';
        }
        if (anchorType === 'Group') {
            return meta?.groupDisplayName || anchorKey || 'Tab';
        }
        return 'Record';
    }

    private resolveAnchorIcon(anchorType: ConversationAnchorType): string {
        switch (anchorType) {
            case 'Field':
                return 'fa-regular fa-pen-to-square';
            case 'Section':
                return 'fa-solid fa-layer-group';
            case 'Group':
                return 'fa-solid fa-table-columns';
            case 'Contribution':
                return 'fa-solid fa-table-list';
            case 'DocBlock':
                return 'fa-solid fa-paragraph';
            case 'SlideRegion':
                return 'fa-solid fa-chalkboard';
            case 'SheetRange':
                return 'fa-solid fa-table-cells';
            case 'Record':
            default:
                return 'fa-regular fa-comment-dots';
        }
    }

    private updateMentionAutocomplete(
        targetKey: 'new' | string,
        text: string,
        cursorPosition: number
    ): void {
        const upToCursor = text.slice(0, cursorPosition);
        const match = /(?:^|\s)@([a-zA-Z0-9_.\- ]{0,24})$/.exec(upToCursor);
        if (!match) {
            if (this.ActiveMentionContext?.Target === targetKey) {
                this.ActiveMentionContext = null;
                this.cdr.markForCheck();
            }
            return;
        }

        const query = match[1];
        const triggerIndex = upToCursor.lastIndexOf('@');
        this.ActiveMentionContext = {
            Target: targetKey,
            Query: query,
            TriggerIndex: triggerIndex,
            SelectedIndex: 0
        };

        if (!this.mentionCandidatesLoaded) {
            void this.loadMentionCandidates();
        } else {
            this.filterMentionCandidates(query);
        }
    }

    private async loadMentionCandidates(): Promise<void> {
        this.mentionCandidatesLoaded = true;
        const provider: IMetadataProvider | null = this.ProviderToUse;
        if (!provider) return;

        try {
            const rv = RunView.FromMetadataProvider(provider);
            const [usersResult, agentsResult] = await rv.RunViews([
                {
                    EntityName: 'MJ: Users',
                    ExtraFilter: `IsActive=1`,
                    Fields: ['ID', 'Name', 'Email'],
                    OrderBy: 'Name ASC',
                    MaxRows: 50,
                    ResultType: 'simple'
                },
                {
                    EntityName: 'MJ: AI Agents',
                    ExtraFilter: `Status='Active' AND (IsRestricted IS NULL OR IsRestricted=0)`,
                    Fields: ['ID', 'Name', 'Description'],
                    OrderBy: 'Name ASC',
                    MaxRows: 25,
                    ResultType: 'simple'
                }
            ]);

            const list: CommentMentionCandidate[] = [];
            if (usersResult?.Success && Array.isArray(usersResult.Results)) {
                for (const u of usersResult.Results as Array<{ ID: string; Name?: string; Email?: string }>) {
                    if (u.ID && u.Name) {
                        list.push({
                            Type: 'user',
                            ID: u.ID,
                            Name: u.Name,
                            Subtitle: u.Email ?? null
                        });
                    }
                }
            }
            if (agentsResult?.Success && Array.isArray(agentsResult.Results)) {
                for (const a of agentsResult.Results as Array<{ ID: string; Name?: string; Description?: string }>) {
                    if (a.ID && a.Name) {
                        list.push({
                            Type: 'agent',
                            ID: a.ID,
                            Name: a.Name,
                            Subtitle: 'AI Agent'
                        });
                    }
                }
            }
            this.MentionCandidates = list;
            if (this.ActiveMentionContext) {
                this.filterMentionCandidates(this.ActiveMentionContext.Query);
            }
            this.cdr.markForCheck();
        } catch (error) {
            LogError(
                `MjRecordCommentsComponent.loadMentionCandidates failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        }
    }

    private filterMentionCandidates(query: string): void {
        const q = query.trim().toLowerCase();
        this.FilteredMentionCandidates = this.MentionCandidates.filter(
            (c) =>
                !q ||
                c.Name.toLowerCase().includes(q) ||
                (c.Subtitle?.toLowerCase().includes(q) ?? false)
        ).slice(0, 6);
        this.cdr.markForCheck();
    }
}
