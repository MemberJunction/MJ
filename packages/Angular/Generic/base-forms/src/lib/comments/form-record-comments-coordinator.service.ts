import { Injectable, OnDestroy } from '@angular/core';
import { BaseEntity, EntityInfo, IMetadataProvider, LogError, UserInfo } from '@memberjunction/core';
import {
    AnchoredCommentRollup,
    BUILT_IN_COMMENT_TYPE_IDS,
    COMMENT_TYPE_CODES,
    ComputeAnchoredCommentCounts,
    ConversationAnchorMetadata,
    ConversationAnchorType,
    ConversationEngine,
    IsConversationHiddenByFieldSecurity,
    MJCommentEntity,
    MJCommentTypeEntity,
    MJConversationDetailEntity,
    MJConversationEntity,
    MJFieldSuggestionEntity,
    ParseConversationAnchorMetadata
} from '@memberjunction/core-entities';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { Observable, Subject } from 'rxjs';
import { FormRecordRefreshCoordinator } from '../form-record-refresh.coordinator';

/**
 * Viewport rectangle used to tether the inline anchored comment popover to a field or section trigger button.
 */
export interface CommentPopoverAnchorRect {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
}

/**
 * Target specification when opening an inline anchored comment popover or filtering the comments drawer.
 */
export interface FormCommentAnchorTarget {
    AnchorType: ConversationAnchorType;
    AnchorKey: string | null;
    Label: string;
    QuotedValue?: string;
    SectionKey?: string;
    SectionDisplayName?: string;
    GroupKey?: string;
    GroupDisplayName?: string;
    AnchorRect?: CommentPopoverAnchorRect;
    /** Optional comment-type code (`'all'`, `'COMMENT'`, `'FIELD_SUGGESTION'`, etc.) pre-selected when opening from a typed badge. */
    PreferredTypeFilter?: string | null;
}

/**
 * Request emitted when the user clicks an anchor badge inside the Record Comments drawer
 * to jump to, expand, and highlight the target field, section, or rail group on the form.
 */
export interface FormCommentAnchorNavigationRequest {
    AnchorType: ConversationAnchorType;
    AnchorKey: string | null;
    SectionKey?: string | null;
    GroupKey?: string | null;
}

const EMPTY_ROLLUP: AnchoredCommentRollup = {
    TotalOpenCount: 0,
    TotalResolvedCount: 0,
    RecordLevelOpenCount: 0,
    ByField: new Map(),
    BySection: new Map(),
    ByGroup: new Map(),
    ByContribution: new Map(),
    OpenNoteCount: 0,
    OpenSuggestionCount: 0,
    ByFieldSuggestions: new Map(),
    ByFieldByType: new Map()
};

/**
 * Per-form coordinator service (provided by `<mj-record-form-container>`) that manages
 * anchored conversations, notes, and field suggestions across the record as a whole, its
 * `<mj-form-field>` instances, `<mj-collapsible-panel>` sections, and left-nav rail groups.
 */
@Injectable()
export class FormRecordCommentsCoordinatorService implements OnDestroy {
    private readonly _changed$ = new Subject<void>();
    private readonly _navigateToAnchor$ = new Subject<FormCommentAnchorNavigationRequest>();

    /** Emits whenever comment threads, details, counts, drawer state, or popover state change. */
    public get Changed$(): Observable<void> {
        return this._changed$.asObservable();
    }

    /** Emits when the user clicks an anchor badge to scroll/expand/highlight a target on the form. */
    public get NavigateToAnchor$(): Observable<FormCommentAnchorNavigationRequest> {
        return this._navigateToAnchor$.asObservable();
    }

    private _record: BaseEntity | null = null;
    private _provider: IMetadataProvider | null = null;
    private _refreshCoordinator: FormRecordRefreshCoordinator | null = null;
    private _conversations: MJConversationEntity[] = [];
    private _detailsByConversationId = new Map<string, MJConversationDetailEntity[]>();
    private _commentsByConversationId = new Map<string, MJCommentEntity>();
    private _suggestionsByConversationId = new Map<string, MJFieldSuggestionEntity>();
    private _commentTypeCodeByConversationId = new Map<string, string>();
    private _rollup: AnchoredCommentRollup = EMPTY_ROLLUP;
    private _isLoading = false;
    private _isLoaded = false;
    private _loadGeneration = 0;

    private _isDrawerOpen = false;
    private _drawerStatusFilter: 'open' | 'resolved' | 'all' = 'open';
    private _drawerTypeFilter = 'all';
    private _popoverTypeFilter = 'all';
    private _drawerTargetFilter: FormCommentAnchorTarget | null = null;
    private _activePopoverTarget: FormCommentAnchorTarget | null = null;

    public get Record(): BaseEntity | null {
        return this._record;
    }

    public get Provider(): IMetadataProvider | null {
        return this._provider;
    }

    public get Conversations(): readonly MJConversationEntity[] {
        return this._conversations;
    }

    public get DetailsByConversationId(): ReadonlyMap<string, MJConversationDetailEntity[]> {
        return this._detailsByConversationId;
    }

    public get CommentsByConversationId(): ReadonlyMap<string, MJCommentEntity> {
        return this._commentsByConversationId;
    }

    public get SuggestionsByConversationId(): ReadonlyMap<string, MJFieldSuggestionEntity> {
        return this._suggestionsByConversationId;
    }

    public get CommentTypeCodeByConversationId(): ReadonlyMap<string, string> {
        return this._commentTypeCodeByConversationId;
    }

    public get Rollup(): AnchoredCommentRollup {
        return this._rollup;
    }

    public get IsLoading(): boolean {
        return this._isLoading;
    }

    public get IsLoaded(): boolean {
        return this._isLoaded;
    }

    public get IsDrawerOpen(): boolean {
        return this._isDrawerOpen;
    }

    public get DrawerStatusFilter(): 'open' | 'resolved' | 'all' {
        return this._drawerStatusFilter;
    }

    public get DrawerTypeFilter(): string {
        return this._drawerTypeFilter;
    }

    public get PopoverTypeFilter(): string {
        return this._popoverTypeFilter;
    }

    public get DrawerTargetFilter(): FormCommentAnchorTarget | null {
        return this._drawerTargetFilter;
    }

    public get ActivePopoverTarget(): FormCommentAnchorTarget | null {
        return this._activePopoverTarget;
    }

    public get CurrentUser(): UserInfo | null {
        return this._provider?.CurrentUser ?? null;
    }

    public get EntityInfo(): EntityInfo | null {
        return this._record?.EntityInfo ?? null;
    }

    /**
     * Connects the host container's {@link FormRecordRefreshCoordinator} so accepting a
     * field suggestion broadcasts live field refreshes across open `<mj-form-field>` controls.
     */
    public BindRefreshCoordinator(refreshCoordinator: FormRecordRefreshCoordinator | null): void {
        this._refreshCoordinator = refreshCoordinator;
    }

    /**
     * Binds the coordinator to the active record and provider. Resets cached state if the
     * record identity changed.
     */
    public BindRecord(record: BaseEntity | null, provider: IMetadataProvider | null): void {
        const prevEntityId = this._record?.EntityInfo?.ID ?? null;
        const prevRecordId = this.getSerializedRecordId(this._record);
        const nextEntityId = record?.EntityInfo?.ID ?? null;
        const nextRecordId = this.getSerializedRecordId(record);

        this._record = record;
        this._provider = provider;

        if (prevEntityId !== nextEntityId || prevRecordId !== nextRecordId) {
            this._conversations = [];
            this._detailsByConversationId.clear();
            this._commentsByConversationId.clear();
            this._suggestionsByConversationId.clear();
            this._commentTypeCodeByConversationId.clear();
            this._rollup = EMPTY_ROLLUP;
            this._isLoaded = false;
            this._activePopoverTarget = null;
            this._drawerTargetFilter = null;
            this._drawerTypeFilter = 'all';
            this._popoverTypeFilter = 'all';
            this.notifyChanged();
        }
    }

    /**
     * Loads all anchored conversations, their `MJ: Comments` / `MJ: Field Suggestions` subtype rows,
     * and their detail messages for the bound record, applying RLS and FLS filtering for the current user.
     */
    public async LoadForRecord(
        record?: BaseEntity | null,
        provider?: IMetadataProvider | null,
        forceRefresh = false
    ): Promise<AnchoredCommentRollup> {
        if (record !== undefined || provider !== undefined) {
            this.BindRecord(record ?? this._record, provider ?? this._provider);
        }

        const activeRecord = this._record;
        const activeProvider = this._provider;
        const currentUser = activeProvider?.CurrentUser ?? null;
        const linkedEntityId = activeRecord?.EntityInfo?.ID ?? null;
        const linkedRecordId = this.getSerializedRecordId(activeRecord);

        if (!activeRecord?.IsSaved || !activeProvider || !currentUser || !linkedEntityId || !linkedRecordId) {
            this._conversations = [];
            this._detailsByConversationId.clear();
            this._commentsByConversationId.clear();
            this._suggestionsByConversationId.clear();
            this._commentTypeCodeByConversationId.clear();
            this._rollup = EMPTY_ROLLUP;
            this._isLoaded = false;
            this.notifyChanged();
            return this._rollup;
        }

        if (this._isLoaded && !forceRefresh) {
            return this._rollup;
        }

        const generation = ++this._loadGeneration;
        this._isLoading = true;
        this.notifyChanged();

        try {
            const conversations = await ConversationEngine.Instance.LoadAnchoredConversations(
                linkedEntityId,
                linkedRecordId,
                currentUser,
                {
                    includeResolved: true,
                    provider: activeProvider,
                    bypassCache: forceRefresh
                }
            );
            if (generation !== this._loadGeneration) {
                return this._rollup;
            }

            const visibleConversations = conversations.filter(
                (c) =>
                    !IsConversationHiddenByFieldSecurity(
                        activeRecord.EntityInfo,
                        currentUser,
                        c.AnchorType,
                        c.AnchorKey,
                        c.AnchorMetadataObject ?? c.AnchorMetadata
                    )
            );
            const visibleIds = visibleConversations.map((c) => c.ID);
            const emptyCommentsBundle = {
                CommentsByConversationId: new Map<string, MJCommentEntity>(),
                SuggestionsByConversationId: new Map<string, MJFieldSuggestionEntity>(),
                CommentTypeCodeByConversationId: new Map<string, string>()
            };
            const loadCommentsPromise =
                typeof ConversationEngine.Instance.LoadAnchoredCommentsAndSuggestions === 'function'
                    ? ConversationEngine.Instance.LoadAnchoredCommentsAndSuggestions(
                          visibleIds,
                          currentUser,
                          activeProvider,
                          forceRefresh
                      )
                    : Promise.resolve(emptyCommentsBundle);

            const [detailsMap, commentsBundle] = await Promise.all([
                ConversationEngine.Instance.LoadAnchoredConversationDetails(
                    visibleIds,
                    currentUser,
                    activeProvider,
                    forceRefresh
                ),
                loadCommentsPromise
            ]);
            if (generation !== this._loadGeneration) {
                return this._rollup;
            }

            this._conversations = visibleConversations;
            this._detailsByConversationId = detailsMap;
            this._commentsByConversationId = commentsBundle.CommentsByConversationId;
            this._suggestionsByConversationId = commentsBundle.SuggestionsByConversationId;
            this._commentTypeCodeByConversationId = commentsBundle.CommentTypeCodeByConversationId;
            this._rollup = ComputeAnchoredCommentCounts(
                this._conversations,
                currentUser,
                activeRecord.EntityInfo,
                this._commentTypeCodeByConversationId
            );
            this._isLoaded = true;
        } catch (error) {
            LogError(
                `FormRecordCommentsCoordinatorService.LoadForRecord failed: ${
                    error instanceof Error ? error.message : String(error)
                }`
            );
        } finally {
            if (generation === this._loadGeneration) {
                this._isLoading = false;
                this.notifyChanged();
            }
        }

        return this._rollup;
    }

    /**
     * Returns the total number of open anchored threads (notes + suggestions) on a specific field (`FieldName`).
     */
    public GetFieldOpenCommentCount(fieldName: string | null | undefined): number {
        const key = (fieldName ?? '').trim().toLowerCase();
        if (!key) return 0;
        return this._rollup.ByField.get(key) ?? 0;
    }

    /**
     * Returns the number of open `FIELD_SUGGESTION` threads targeting `fieldName`.
     */
    public GetFieldOpenSuggestionCount(fieldName: string | null | undefined): number {
        const key = (fieldName ?? '').trim().toLowerCase();
        if (!key) return 0;
        return this._rollup.ByFieldSuggestions?.get(key) ?? 0;
    }

    /**
     * Returns the number of open non-suggestion note threads targeting `fieldName`.
     */
    public GetFieldOpenNoteCount(fieldName: string | null | undefined): number {
        return Math.max(0, this.GetFieldOpenCommentCount(fieldName) - this.GetFieldOpenSuggestionCount(fieldName));
    }

    /**
     * Returns open thread counts targeting `fieldName`, keyed by uppercase `CommentType.Code`.
     */
    public GetFieldOpenCountByType(fieldName: string | null | undefined): ReadonlyMap<string, number> {
        const key = (fieldName ?? '').trim().toLowerCase();
        if (!key) return new Map();
        return this._rollup.ByFieldByType?.get(key) ?? new Map();
    }

    /**
     * Returns the loaded `MJ: Comments` subtype row for `conversationId`, if present.
     */
    public GetCommentForConversation(conversationId: string): MJCommentEntity | null {
        return this._commentsByConversationId.get(NormalizeUUID(conversationId)) ?? null;
    }

    /**
     * Returns the loaded `MJ: Field Suggestions` subtype row for `conversationId`, if present.
     */
    public GetSuggestionForConversation(conversationId: string): MJFieldSuggestionEntity | null {
        return this._suggestionsByConversationId.get(NormalizeUUID(conversationId)) ?? null;
    }

    /**
     * Returns the normalized uppercase `CommentType.Code` for `conversationId`
     * (defaulting to `'COMMENT'` for plain anchored comments).
     */
    public GetCommentTypeCodeForConversation(conversationId: string): string {
        const normId = NormalizeUUID(conversationId);
        const mapped = this._commentTypeCodeByConversationId.get(normId);
        if (mapped) {
            return mapped.trim().toUpperCase();
        }
        if (this._suggestionsByConversationId.has(normId)) {
            return COMMENT_TYPE_CODES.FIELD_SUGGESTION;
        }
        const comment = this._commentsByConversationId.get(normId);
        if (comment && UUIDsEqual(comment.CommentTypeID, BUILT_IN_COMMENT_TYPE_IDS.FIELD_SUGGESTION)) {
            return COMMENT_TYPE_CODES.FIELD_SUGGESTION;
        }
        return COMMENT_TYPE_CODES.COMMENT;
    }

    /**
     * Resolves the cached `MJ: Comment Types` metadata row for `conversationId`, when available.
     */
    public GetCommentTypeForConversation(conversationId: string): MJCommentTypeEntity | null {
        const comment = this.GetCommentForConversation(conversationId);
        if (comment?.CommentTypeID && typeof ConversationEngine.Instance.CommentTypeByID === 'function') {
            const byId = ConversationEngine.Instance.CommentTypeByID(comment.CommentTypeID);
            if (byId) {
                return byId;
            }
        }
        const code = this.GetCommentTypeCodeForConversation(conversationId);
        if (typeof ConversationEngine.Instance.CommentTypeByCode === 'function') {
            return ConversationEngine.Instance.CommentTypeByCode(code) ?? null;
        }
        return null;
    }

    /**
     * Returns all anchored threads (open + optionally resolved) targeting a specific field.
     */
    public GetFieldThreads(
        fieldName: string | null | undefined,
        includeResolved = true
    ): MJConversationEntity[] {
        const key = (fieldName ?? '').trim().toLowerCase();
        if (!key) return [];
        return this._conversations.filter((c) => {
            if (!includeResolved && c.IsResolved) return false;
            if (c.AnchorType !== 'Field') return false;
            const meta = ParseConversationAnchorMetadata(c.AnchorMetadataObject ?? c.AnchorMetadata);
            const candidate = (c.AnchorKey || meta?.fieldName || '').trim().toLowerCase();
            return candidate === key;
        });
    }

    /**
     * Returns the number of open comment threads belonging to a section:
     * threads anchored directly to `sectionKey` (`AnchorType === 'Section'`) OR whose
     * `AnchorMetadataObject.sectionKey` matches `sectionKey`, plus any open `Field` threads
     * whose field name is in `ownedFieldNames` (and wasn't already counted via `sectionKey`).
     */
    public GetSectionOpenCommentCount(
        sectionKey: string | null | undefined,
        ownedFieldNames?: readonly string[]
    ): number {
        const secKey = (sectionKey ?? '').trim();
        if (!secKey && (!ownedFieldNames || ownedFieldNames.length === 0)) {
            return 0;
        }

        const secLower = secKey.toLowerCase();
        const ownedFieldSet = new Set((ownedFieldNames ?? []).map((f) => f.trim().toLowerCase()));
        let count = 0;

        for (const conv of this._conversations) {
            if (conv.IsResolved || !conv.AnchorType) continue;
            const meta = ParseConversationAnchorMetadata(conv.AnchorMetadataObject ?? conv.AnchorMetadata);
            if (
                secLower &&
                ((conv.AnchorType === 'Section' && (conv.AnchorKey ?? '').trim().toLowerCase() === secLower) ||
                    (meta?.sectionKey ?? '').trim().toLowerCase() === secLower)
            ) {
                count++;
                continue;
            }
            if (conv.AnchorType === 'Field' && ownedFieldSet.size > 0) {
                const fKey = (conv.AnchorKey || meta?.fieldName || '').trim().toLowerCase();
                if (fKey && ownedFieldSet.has(fKey)) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Returns the number of open comment threads belonging to a left-nav rail group (`groupKey`),
     * including threads anchored directly to `groupKey` (`AnchorType === 'Group'`) or to any of
     * its `sectionKeys`.
     */
    public GetGroupOpenCommentCount(
        groupKey: string | null | undefined,
        sectionKeys?: readonly string[]
    ): number {
        const gLower = (groupKey ?? '').trim().toLowerCase();
        const secSet = new Set((sectionKeys ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
        if (!gLower && secSet.size === 0) {
            return 0;
        }

        let count = 0;
        for (const conv of this._conversations) {
            if (conv.IsResolved || !conv.AnchorType) continue;
            const meta = ParseConversationAnchorMetadata(conv.AnchorMetadataObject ?? conv.AnchorMetadata);
            if (
                gLower &&
                ((conv.AnchorType === 'Group' && (conv.AnchorKey ?? '').trim().toLowerCase() === gLower) ||
                    (meta?.groupKey ?? '').trim().toLowerCase() === gLower)
            ) {
                count++;
                continue;
            }
            if (secSet.size > 0) {
                const secKey =
                    conv.AnchorType === 'Section'
                        ? (conv.AnchorKey ?? '').trim().toLowerCase()
                        : (meta?.sectionKey ?? '').trim().toLowerCase();
                if (secKey && secSet.has(secKey)) {
                    count++;
                }
            }
        }

        return count;
    }

    /**
     * Returns all messages (`MJ: Conversation Details`) for a given conversation ID.
     */
    public GetDetailsForConversation(conversationId: string): readonly MJConversationDetailEntity[] {
        return this._detailsByConversationId.get(NormalizeUUID(conversationId)) ?? [];
    }

    /**
     * Creates a new anchored comment thread on the current record and posts its initial message.
     */
    public async StartAnchoredThread(params: {
        AnchorType: ConversationAnchorType;
        AnchorKey?: string | null;
        AnchorMetadata?: ConversationAnchorMetadata | null;
        Message: string;
        Name?: string;
    }): Promise<MJConversationEntity | null> {
        const record = this._record;
        const provider = this._provider;
        const currentUser = provider?.CurrentUser ?? null;
        const linkedEntityId = record?.EntityInfo?.ID ?? null;
        const linkedRecordId = this.getSerializedRecordId(record);

        if (!record?.IsSaved || !provider || !currentUser || !linkedEntityId || !linkedRecordId) {
            return null;
        }

        const { Conversation, InitialDetail } = await ConversationEngine.Instance.CreateAnchoredConversation(
            {
                name: params.Name,
                linkedEntityId,
                linkedRecordId,
                anchorType: params.AnchorType,
                anchorKey: params.AnchorKey ?? null,
                anchorMetadata: params.AnchorMetadata ?? null,
                initialMessage: params.Message,
                provider
            },
            currentUser
        );

        this._conversations = [Conversation, ...this._conversations];
        this._detailsByConversationId.set(
            NormalizeUUID(Conversation.ID),
            InitialDetail ? [InitialDetail] : []
        );
        this.recomputeRollup();
        this.notifyChanged();
        return Conversation;
    }

    /**
     * Appends a new reply message (`MJ: Conversation Details`) to an existing anchored thread.
     */
    public async PostReply(
        conversationId: string,
        messageText: string
    ): Promise<MJConversationDetailEntity | null> {
        const provider = this._provider;
        const currentUser = provider?.CurrentUser ?? null;
        const text = messageText.trim();
        if (!provider || !currentUser || !text) {
            return null;
        }

        const detail = await provider.GetEntityObject<MJConversationDetailEntity>(
            'MJ: Conversation Details',
            currentUser
        );
        detail.NewRecord();
        detail.ConversationID = conversationId;
        detail.UserID = currentUser.ID;
        detail.Role = 'User';
        detail.Message = text;

        const saved = await detail.Save();
        if (!saved) {
            throw new Error(
                detail.LatestResult?.CompleteMessage ||
                    detail.LatestResult?.Message ||
                    'Failed to post reply'
            );
        }

        const normId = NormalizeUUID(conversationId);
        const existing = this._detailsByConversationId.get(normId) ?? [];
        this._detailsByConversationId.set(normId, [...existing, detail]);
        this.notifyChanged();
        return detail;
    }

    /**
     * Resolves or re-opens an anchored conversation thread.
     */
    public async ToggleResolved(
        conversationId: string,
        isResolved: boolean
    ): Promise<MJConversationEntity | null> {
        const provider = this._provider;
        const currentUser = provider?.CurrentUser ?? null;
        if (!provider || !currentUser) {
            return null;
        }

        const updated = await ConversationEngine.Instance.SetConversationResolved(
            conversationId,
            isResolved,
            currentUser,
            provider
        );

        const idx = this._conversations.findIndex((c) => UUIDsEqual(c.ID, conversationId));
        if (idx >= 0) {
            const copy = [...this._conversations];
            copy[idx] = updated;
            this._conversations = copy;
        }
        this.recomputeRollup();
        this.notifyChanged();
        return updated;
    }

    /**
     * Accepts a pending `MJ: Field Suggestions` row as the current user, reloads the open
     * target record so live form fields reflect the accepted value immediately, and refreshes
     * the record's anchored comments and rollups.
     */
    public async AcceptFieldSuggestion(suggestionId: string): Promise<MJFieldSuggestionEntity | null> {
        const provider = this._provider;
        const currentUser = provider?.CurrentUser ?? null;
        if (!provider || !currentUser) {
            return null;
        }

        const updated = await ConversationEngine.Instance.AcceptFieldSuggestion(
            suggestionId,
            currentUser,
            provider
        );

        this.applyDisposedSuggestionOptimistically(updated, suggestionId, 'Accepted', currentUser.ID);

        const activeRecord = this._record;
        if (activeRecord?.IsSaved && activeRecord.PrimaryKey && !activeRecord.Dirty) {
            const changedField = (updated.AnchorKey ?? '').trim();
            const changedSet = new Set<string>();
            if (changedField) {
                changedSet.add(changedField);
                changedSet.add(changedField.toLowerCase());
            }
            let reloaded = false;
            if (typeof activeRecord.InnerLoad === 'function') {
                try {
                    reloaded = await activeRecord.InnerLoad(activeRecord.PrimaryKey);
                } catch (reloadError) {
                    LogError(
                        `FormRecordCommentsCoordinatorService.AcceptFieldSuggestion: target record reload failed after suggestion accept succeeded: ${
                            reloadError instanceof Error ? reloadError.message : String(reloadError)
                        }`
                    );
                }
            }
            if (reloaded && this._refreshCoordinator) {
                if (changedSet.size > 0) {
                    this._refreshCoordinator.NotifyRemoteUpdate(activeRecord, changedSet);
                } else {
                    this._refreshCoordinator.Notify(activeRecord);
                }
            }
        }

        try {
            await this.LoadForRecord(this._record, provider, true);
        } catch (refreshError) {
            LogError(
                `FormRecordCommentsCoordinatorService.AcceptFieldSuggestion: comments refresh failed after suggestion accept succeeded: ${
                    refreshError instanceof Error ? refreshError.message : String(refreshError)
                }`
            );
        }
        return updated;
    }

    /**
     * Rejects a pending `MJ: Field Suggestions` row as the current user and refreshes
     * the record's anchored comments and rollups.
     */
    public async RejectFieldSuggestion(suggestionId: string): Promise<MJFieldSuggestionEntity | null> {
        const provider = this._provider;
        const currentUser = provider?.CurrentUser ?? null;
        if (!provider || !currentUser) {
            return null;
        }

        const updated = await ConversationEngine.Instance.RejectFieldSuggestion(
            suggestionId,
            currentUser,
            provider
        );

        this.applyDisposedSuggestionOptimistically(updated, suggestionId, 'Rejected', currentUser.ID);

        try {
            await this.LoadForRecord(this._record, provider, true);
        } catch (refreshError) {
            LogError(
                `FormRecordCommentsCoordinatorService.RejectFieldSuggestion: comments refresh failed after suggestion reject succeeded: ${
                    refreshError instanceof Error ? refreshError.message : String(refreshError)
                }`
            );
        }
        return updated;
    }

    private applyDisposedSuggestionOptimistically(
        updated: MJFieldSuggestionEntity,
        fallbackSuggestionId: string,
        outcome: NonNullable<MJFieldSuggestionEntity['Outcome']>,
        actingUserId: string
    ): void {
        const normId = NormalizeUUID(updated.ID || fallbackSuggestionId);
        this._suggestionsByConversationId.set(normId, updated);
        this._commentTypeCodeByConversationId.set(normId, COMMENT_TYPE_CODES.FIELD_SUGGESTION);

        const now = updated.ResolvedAt ?? new Date();
        const resolvedBy = updated.ResolvedByUserID ?? actingUserId;
        const acceptedAnchorKey = outcome === 'Accepted' ? (updated.AnchorKey ?? '').trim().toLowerCase() : '';

        for (const conv of this._conversations) {
            const convNormId = NormalizeUUID(conv.ID);
            if (convNormId === normId) {
                conv.IsResolved = true;
                conv.ResolvedByUserID = resolvedBy;
                conv.ResolvedAt = now;
                continue;
            }
            if (acceptedAnchorKey) {
                const sibling = this._suggestionsByConversationId.get(convNormId);
                if (
                    sibling &&
                    sibling.Outcome === null &&
                    (sibling.AnchorKey ?? '').trim().toLowerCase() === acceptedAnchorKey
                ) {
                    sibling.Outcome = 'Superseded';
                    conv.IsResolved = true;
                    conv.ResolvedByUserID = resolvedBy;
                    conv.ResolvedAt = now;
                }
            }
        }

        this.recomputeRollup();
        this.notifyChanged();
    }

    /**
     * Opens the inline anchored comment popover tethered to a specific field or section,
     * lazy-loading the record's anchored conversations if not yet loaded.
     */
    public OpenPopoverForTarget(target: FormCommentAnchorTarget): void {
        this._activePopoverTarget = target;
        this._popoverTypeFilter = target.PreferredTypeFilter?.trim() || 'all';
        if (!this._isLoaded && !this._isLoading) {
            void this.LoadForRecord();
        }
        this.notifyChanged();
    }

    /**
     * Closes the inline anchored comment popover.
     */
    public ClosePopover(): void {
        if (!this._activePopoverTarget) return;
        this._activePopoverTarget = null;
        this._popoverTypeFilter = 'all';
        this.notifyChanged();
    }

    /**
     * Opens or closes the Notes & suggestions slide-in drawer, optionally pre-filtering to a target.
     */
    public SetDrawerOpen(open: boolean, targetFilter?: FormCommentAnchorTarget | null): void {
        this._isDrawerOpen = open;
        if (targetFilter !== undefined) {
            this._drawerTargetFilter = targetFilter;
            if (targetFilter?.PreferredTypeFilter) {
                this._drawerTypeFilter = targetFilter.PreferredTypeFilter;
            }
        }
        if (open) {
            this._activePopoverTarget = null;
            this._popoverTypeFilter = 'all';
            if (!this._isLoaded && !this._isLoading) {
                void this.LoadForRecord();
            }
        }
        this.notifyChanged();
    }

    public SetDrawerStatusFilter(status: 'open' | 'resolved' | 'all'): void {
        this._drawerStatusFilter = status;
        this.notifyChanged();
    }

    public SetDrawerTypeFilter(typeCode: string): void {
        const cleaned = (typeCode ?? '').trim();
        this._drawerTypeFilter = !cleaned || cleaned.toLowerCase() === 'all' ? 'all' : cleaned.toUpperCase();
        this.notifyChanged();
    }

    public SetPopoverTypeFilter(typeCode: string): void {
        const cleaned = (typeCode ?? '').trim();
        this._popoverTypeFilter = !cleaned || cleaned.toLowerCase() === 'all' ? 'all' : cleaned.toUpperCase();
        this.notifyChanged();
    }

    public SetDrawerTargetFilter(target: FormCommentAnchorTarget | null): void {
        this._drawerTargetFilter = target;
        this.notifyChanged();
    }

    /**
     * Requests the form container to navigate to, expand, scroll into view, and pulse
     * the specified field, section, or rail group.
     */
    public RequestNavigateToAnchor(request: FormCommentAnchorNavigationRequest): void {
        this._navigateToAnchor$.next(request);
    }

    public NotifyChanged(): void {
        this.notifyChanged();
    }

    public ngOnDestroy(): void {
        this._changed$.complete();
        this._navigateToAnchor$.complete();
    }

    private recomputeRollup(): void {
        this._rollup = ComputeAnchoredCommentCounts(
            this._conversations,
            this.CurrentUser,
            this.EntityInfo,
            this._commentTypeCodeByConversationId
        );
    }

    private getSerializedRecordId(record: BaseEntity | null | undefined): string | null {
        if (!record?.IsSaved || !record.PrimaryKey) {
            return null;
        }
        const pairs = record.PrimaryKey.KeyValuePairs;
        if (!pairs || pairs.length === 0) {
            return null;
        }
        if (pairs.length === 1) {
            const val = pairs[0].Value;
            return val !== null && val !== undefined && String(val).trim().length > 0
                ? String(val).trim()
                : null;
        }
        return record.PrimaryKey.ToURLSegment();
    }

    private notifyChanged(): void {
        this._changed$.next();
    }
}
