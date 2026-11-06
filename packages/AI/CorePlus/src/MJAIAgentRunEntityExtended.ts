import { BaseEntity, CompositeKey, EntitySaveOptions, LogErrorEx, IMetadataProvider } from "@memberjunction/core";
import { MJAIAgentRunEntity, ConversationEngine, type ConversationBranchRow } from "@memberjunction/core-entities";
import { EscapeSQLString, RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { MJAIAgentRunStepEntityExtended } from "./MJAIAgentRunStepEntityExtended";

@RegisterClass(BaseEntity, "MJ: AI Agent Runs")
export class MJAIAgentRunEntityExtended extends MJAIAgentRunEntity {
    private _runSteps: MJAIAgentRunStepEntityExtended[] = [];
    private _hasAuthoritativeBoundActionParams = false;
    private _authoritativeBoundActionParams: string | null = null;

    /**
     * Records the run's server-authored action parameter bindings. Only server code (`BaseAgent`)
     * calls this; values set directly on `BoundActionParams` by a client create or update (including
     * via `OldValues___`) are ignored on save.
     */
    public SetServerBoundActionParams(serialized: string | null): void {
        this._hasAuthoritativeBoundActionParams = true;
        this._authoritativeBoundActionParams = serialized;
        this.BoundActionParams = serialized;
    }

    // ---- Run-state vocabulary ---------------------------------------------------------------
    // Typed from the entity's own unions so a CHECK-constraint change surfaces here at compile
    // time. Shared by the agent framework (BaseAgent) and the server (RunAIAgentResolver) so the
    // two cannot drift on what a settled or a user-stopped run is.

    /**
     * The statuses a conversational turn settles in. `AwaitingFeedback` is included because a
     * Chat final step is the normal per-turn completion for conversational agents.
     * `ReadonlyArray<Union>` rather than an `as const` tuple so `.includes(status)` typechecks
     * against the wider entity union while each literal is still checked.
     */
    public static readonly SettledStatuses: ReadonlyArray<MJAIAgentRunEntity['Status']> = ['Completed', 'AwaitingFeedback'];

    /** The status a cancellation leaves behind. */
    public static readonly CancelledStatus: MJAIAgentRunEntity['Status'] = 'Cancelled';

    /** The cancellation reason a user's stop writes on the run. */
    public static readonly UserRequestCancellationReason: NonNullable<MJAIAgentRunEntity['CancellationReason']> = 'User Request';

    /**
     * True when a run with this status and reason is one the user stopped: Cancelled, for a
     * user request. Static so a `ResultType: 'simple'` row can be judged without an entity;
     * {@link WasStoppedByUser} is the instance form.
     */
    public static IsUserStopped(status: string | null | undefined, cancellationReason: string | null | undefined): boolean {
        return status === MJAIAgentRunEntityExtended.CancelledStatus
            && cancellationReason === MJAIAgentRunEntityExtended.UserRequestCancellationReason;
    }

    /** True when the user stopped this run. See {@link IsUserStopped}. */
    public get WasStoppedByUser(): boolean {
        return MJAIAgentRunEntityExtended.IsUserStopped(this.Status, this.CancellationReason);
    }

    /**
     * The `ExtraFilter` predicate for runs whose reply row is on one branch path of the
     * conversation and was not replaced by a rerun of its turn. A run made on a sibling branch,
     * or whose answer a rerun superseded, is not this path's history, so nothing that reads a
     * previous run for the next turn (carry-forward, a stopped run's resume) may pick it.
     * A null branch is the trunk alone.
     */
    public static BuildReplyOnBranchPathFilter(
        conversationId: string,
        branchId: string | null,
        branches: ReadonlyArray<ConversationBranchRow>
    ): string {
        const pathFilter = ConversationEngine.BuildBranchPathFilter(conversationId, branchId, branches);
        return `ConversationDetailID IN (SELECT ID FROM [__mj].[vwConversationDetails] WHERE ${ConversationEngine.LiveRowsFilter(pathFilter)})`;
    }

    /**
     * The `ExtraFilter` selecting, for one agent in one conversation, the root runs that could be
     * the next turn's predecessor: those that settled, and those the user stopped, with a reply
     * row on the turn's branch path ({@link BuildReplyOnBranchPathFilter}). Ordered newest-first
     * by the caller, the first row decides; a stopped run older than a settled one is history
     * the settled run already built on and is not chained to again.
     */
    public static BuildStoppedPredecessorFilter(
        conversationId: string,
        agentId: string,
        branchId: string | null,
        branches: ReadonlyArray<ConversationBranchRow>
    ): string {
        const settled = MJAIAgentRunEntityExtended.SettledStatuses.map((status) => `'${status}'`).join(', ');
        return (
            `ConversationID='${conversationId}' AND ParentRunID IS NULL AND AgentID='${agentId}' ` +
            `AND (Status IN (${settled}) OR (Status='${MJAIAgentRunEntityExtended.CancelledStatus}' ` +
            `AND CancellationReason='${MJAIAgentRunEntityExtended.UserRequestCancellationReason}')) ` +
            `AND ${MJAIAgentRunEntityExtended.BuildReplyOnBranchPathFilter(conversationId, branchId, branches)}`
        );
    }

    /**
     * Steps is the array of steps that are excuted within this run.
     */
    public get Steps(): MJAIAgentRunStepEntityExtended[] {
        return this._runSteps;
    }

    override get FinalPayload(): string {
        return super.FinalPayload;
    }
    override set FinalPayload(value: string) {
        const changed = this.FinalPayload !== value;
        super.FinalPayload = value;
        if (changed) {
            this._finalPayloadObject = SafeJSONParse(value);
        }    
    }

    private _finalPayloadObject: any = null;
    /**
     * FinalPayloadObject is the object representation of the FinalPayload JSON string.
     * You can set the value here as an object and it will automatically convert it to a JSON string.
     * Also, when the FinalPayload string property is set, it will automatically parse the JSON string and set this property.
     */
    public set FinalPayloadObject(value: any) {
        const changed = this._finalPayloadObject !== value;
        this._finalPayloadObject = value;
        if (changed) {
            // If the value is null, set FinalPayload to null too
            // call super.FinalPayload instead of this.FinalPayload to avoid recursion
            // because this.FinalPayload setter will call this FinalPayloadObject setter again
            // and we will end up in an infinite recursion scenario.
            super.FinalPayload = value ? JSON.stringify(value) : null;
        }
    }
    public get FinalPayloadObject(): any {
        return this._finalPayloadObject;
    }
    
    /**
     * Override GetAll to include extended properties for serialization.
     * This enables streaming of the full object structure including related entities.
     */
    public GetAll(): any {
        const baseData = super.GetAll();
        
        // Add extended properties with __ prefix to avoid conflicts
        return {
            ...baseData,
            __finalPayloadObject: this._finalPayloadObject,
            __runSteps: this._runSteps.map(step => step.GetAll())
        };
    }
    
    override async LoadFromData(data: any, _replaceOldValues?: boolean): Promise<boolean> {
        // Extract our special properties before passing to super
        const { __runSteps, __finalPayloadObject, ...baseData } = data;
        
        // Load base properties
        const baseResult = await super.LoadFromData(baseData, _replaceOldValues);
        if (!baseResult) {
            return false;
        }
        
        // Handle extended properties
        if (__finalPayloadObject !== undefined) {
            this._finalPayloadObject = __finalPayloadObject;
        }
        
        // Handle steps array if provided
        if (__runSteps && Array.isArray(__runSteps)) {
            this._runSteps = [];
            const md = this.ProviderToUse as unknown as IMetadataProvider;
            for (const stepData of __runSteps) {
                const step = await md.GetEntityObject<MJAIAgentRunStepEntityExtended>('MJ: AI Agent Run Steps', this.ContextCurrentUser);
                await step.LoadFromData(stepData);
                this._runSteps.push(step);
            }
        }
        // If no steps provided in data, try to load from database
        else if (this.ID?.length > 0) {
            await this.LoadRelatedData();
        }
        
        return true;
    }

    override async InnerLoad(CompositeKey: CompositeKey, EntityRelationshipsToLoad?: string[]): Promise<boolean> {
        if (await super.InnerLoad(CompositeKey, EntityRelationshipsToLoad)) {
            this._hasAuthoritativeBoundActionParams = true;
            this._authoritativeBoundActionParams = this.BoundActionParams ?? null;
            return await this.LoadRelatedData();
        }
        else {
            return false;
        }
    }

    override async Save(options?: EntitySaveOptions): Promise<boolean> {
        if (!this.IsSaved) {
            if (!this._hasAuthoritativeBoundActionParams) {
                this.BoundActionParams = null;
                this._hasAuthoritativeBoundActionParams = true;
                this._authoritativeBoundActionParams = null;
            } else {
                this.BoundActionParams = this._authoritativeBoundActionParams;
            }
        } else if (this._hasAuthoritativeBoundActionParams) {
            this.BoundActionParams = this._authoritativeBoundActionParams;
        } else {
            const stored = await this.readStoredBoundActionParams();
            if (!stored.ok) {
                return false;
            }
            this._authoritativeBoundActionParams = stored.value;
            this._hasAuthoritativeBoundActionParams = true;
            this.BoundActionParams = this._authoritativeBoundActionParams;
        }
        return super.Save(options);
    }

    private async readStoredBoundActionParams(): Promise<{ ok: true; value: string | null } | { ok: false }> {
        if (!this.ID) {
            return { ok: false };
        }
        const rv = this.RunViewProviderToUse;
        if (!rv || typeof rv.RunView !== 'function') {
            return { ok: false };
        }
        const result = await rv.RunView<{ BoundActionParams: string | null }>({
            EntityName: 'MJ: AI Agent Runs',
            ExtraFilter: `ID='${EscapeSQLString(this.ID)}'`,
            Fields: ['BoundActionParams'],
            ResultType: 'simple',
            BypassCache: true
        }, this.ContextCurrentUser);
        if (!result?.Success || !result.Results?.length) {
            return { ok: false };
        }
        return { ok: true, value: result.Results[0].BoundActionParams ?? null };
    }

    /**
     * Load all the steps related to this AI Agent Run.
     */
    protected async LoadRelatedData(): Promise<boolean> {
        try {
            if (this.ID?.length > 0) {
                // only do this for existing records
                const rv = this.RunViewProviderToUse;
                const result = await rv.RunView<MJAIAgentRunStepEntityExtended>({
                    EntityName: "MJ: AI Agent Run Steps",
                    ExtraFilter: "AgentRunID='" + this.ID + "'",
                    OrderBy: "StepNumber",
                    ResultType: "entity_object"
                }, this.ContextCurrentUser);
                if (result?.Success) {
                    this._runSteps = result.Results;
                }
            }
            return true;
        }
        catch (error) {
            LogErrorEx({
                error,
                message: `Error loading related data for AI Agent Run ID: ${this.ID}`,
            });
            return false;
        }
    }    
}

