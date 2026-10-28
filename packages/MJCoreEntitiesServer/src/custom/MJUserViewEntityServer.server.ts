import { RegisterClass, CleanAndParseJSON } from "@memberjunction/global";
import { BaseEntity, EntityInfo, EntitySaveOptions, ExtractAlternateBaseViewFromDisplayState, LogError, IMetadataProvider, Metadata, ValidationErrorInfo, ValidationErrorType, ValidationResult } from "@memberjunction/core";
import { ComputeUserViewFingerprintAsync, MJUserViewEntityExtended } from '@memberjunction/core-entities'
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { ApplyApprovalRulesAsync, ApprovalRefusalResult } from "./approvalStamp";
import { IsClientClauseScreeningProvider } from "@memberjunction/generic-database-provider";

/**
 * Expected response format from the Smart Filter AI prompt
 */
interface SmartFilterResponse {
    whereClause: string;
    orderByClause?: string;
    userExplanationMessage: string;
}

/**
 * Template data passed to the Smart Filter Generation Nunjucks prompt.
 */
interface SmartFilterTemplateData extends Record<string, unknown> {
    entityName: string;
    entityId: string;
    baseView: string;
    fieldsDescription: string;
    relatedViewsDescription: string;
    listsSchema: string;
    listsFields: string;
    listDetailsFields: string;
    alternateBaseViewName?: string;
    alternateBaseViewDescription?: string;
}

@RegisterClass(BaseEntity, 'MJ: User Views')
export class MJUserViewEntityServer extends MJUserViewEntityExtended  {
    /**
     * This property is hard-coded to true in this class because we DO support smart filters in this class. If you want to disable smart filters for a specific view you can override this property in your subclass and set it to false.
     */
    protected override get SmartFilterImplemented(): boolean {
        return true;
    }

    /**
     * Applies the approval rules (see `ApplyApprovalRulesAsync`). The base save regenerates the
     * WhereClause before it writes, so an approving save stamps the fingerprint after the write,
     * from the definition as stored, with one more write.
     */
    public override async Save(options?: EntitySaveOptions): Promise<boolean> {
        let approving: boolean;
        try {
            approving = !options?.ReplayOnly && await ApplyApprovalRulesAsync(this, 'ApprovalStatus', this.ApprovalStatus);
        } catch (e) {
            this.RegisterResultHistoryEntry(ApprovalRefusalResult(this, e));
            return false;
        }
        if (!await super.Save(options)) {
            return false;
        }
        if (approving) {
            try {
                this.ApprovedFingerprint = await ComputeUserViewFingerprintAsync(this);
                if (!await super.Save(options)) {
                    LogError(`[MJUserViewEntityServer] View "${this.Name}" was approved but its fingerprint was not saved: ${this.LatestResult?.CompleteMessage}`);
                }
            } catch (e) {
                LogError(`[MJUserViewEntityServer] View "${this.Name}" was approved but its fingerprint could not be computed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return true;
    }

    public override Validate(): ValidationResult {
        const result = super.Validate();
        this.validateCustomWhereClauseAuthorization(result);
        this.validatePinnedAlternateBaseView(result);
        this.validateStoredClauses(result);
        result.Success = result.Success && result.Errors.length === 0;
        return result;
    }

    /**
     * Validates that a pinned `DisplayState.alternateBaseView` (if newly set or changed)
     * corresponds to a registered, usable alternate base view on the view's target entity.
     * Existing saved views whose pinned alternate base view did not change are allowed to save
     * other edits (e.g. renaming or clearing the pin after an admin disabled the alternate view).
     */
    private validatePinnedAlternateBaseView(result: ValidationResult): void {
        const pinnedName = this.AlternateBaseView;
        if (!pinnedName || !this.ViewEntityInfo) {
            return;
        }
        const smartPromptModified = Boolean(
            this.SmartFilterEnabled &&
            (this.GetFieldByName('SmartFilterPrompt')?.Dirty === true ||
                this.GetFieldByName('SmartFilterEnabled')?.Dirty === true),
        );
        if (this.IsSaved && !this.hasAlternateBaseViewChanged() && !smartPromptModified) {
            return;
        }
        const abv = this.ViewEntityInfo.GetAlternateBaseView(pinnedName);
        if (!abv) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'DisplayState',
                    `Alternate Base View '${pinnedName}' is not registered on entity '${this.ViewEntityInfo.Name}'.`,
                    pinnedName,
                    ValidationErrorType.Failure
                )
            );
        } else if (!abv.IsUsable) {
            result.Errors.push(
                new ValidationErrorInfo(
                    'DisplayState',
                    `Alternate Base View '${pinnedName}' on entity '${this.ViewEntityInfo.Name}' has status '${abv.Status}' and cannot be used.`,
                    pinnedName,
                    ValidationErrorType.Failure
                )
            );
        }
    }

    private hasAlternateBaseViewChanged(): boolean {
        const displayStateField = this.GetFieldByName('DisplayState');
        if (!displayStateField?.Dirty) {
            return false;
        }
        const oldPinned = ExtractAlternateBaseViewFromDisplayState(
            typeof displayStateField.OldValue === 'string' ? displayStateField.OldValue : null,
        );
        return (oldPinned ?? null) !== (this.AlternateBaseView ?? null);
    }

    /**
     * SECURITY: screens the SQL this view stores with the clause screen the RunView API applies to
     * client filters — its WhereClause (set directly, compiled from FilterState, or made by a Smart
     * Filter) and the ORDER BY built from SortState / GridState. Any user who can save a view can
     * write these, and the provider splices them into view SQL. A CustomWhereClause is left to the
     * Owner gate above. Only a new view or a changed clause is screened here; the provider screens
     * every stored clause again when the view runs. Both use the provider's own screen, so a clause
     * is judged the same way at save and at run.
     */
    private validateStoredClauses(result: ValidationResult): void {
        const changed = (...fields: string[]) => !this.IsSaved || fields.some(f => this.GetFieldByName(f)?.Dirty === true);

        if (!this.CustomWhereClause && changed('WhereClause', 'CustomWhereClause')) {
            const where = MJUserViewEntityServer.neutralizeViewTemplates(this.WhereClause ?? '');
            this.screenStoredClause(result, 'WhereClause', where, 'view WhereClause');
        }
        const orderBy = changed('SortState', 'GridState') ? this.storedOrderBy() : null;
        if (orderBy) {
            // The provider transforms a stored sort for its platform before running it; screen that form.
            this.screenStoredClause(result, 'SortState', orderBy, 'OrderBy', this.ViewEntityInfo);
        }
    }

    /**
     * The ORDER BY built from SortState / GridState, or null when SortState is not valid JSON. Such
     * a view cannot build an ORDER BY when it runs either, so there is nothing to screen.
     */
    private storedOrderBy(): string | null {
        try {
            return this.OrderByClause;
        } catch {
            return null;
        }
    }

    /**
     * Adds a validation failure on `field` when the provider's client-clause screen refuses `clause`,
     * or when the provider cannot screen (fails closed).
     */
    private screenStoredClause(result: ValidationResult, field: string, clause: string, label: string, entityInfo?: EntityInfo): void {
        if (!clause.trim()) return;
        const provider = this.ProviderToUse;
        // When MJUserViewEntityServer is resolved in a mixed-tier process (e.g. CLI test runner)
        // against a Network provider (GraphQLDataProvider), defer SQL AST screening to MJServer's
        // Database provider when the GraphQL mutation executes on the server.
        if (provider && (provider as { ProviderType?: string }).ProviderType === 'Network') {
            return;
        }
        try {
            if (!IsClientClauseScreeningProvider(provider)) {
                throw new Error(`Invalid ${label}: the data provider cannot screen client SQL`);
            }
            provider.ScreenClientClause(clause, label, this.ActiveUser, entityInfo);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            result.Errors.push(new ValidationErrorInfo(field, message, clause, ValidationErrorType.Failure));
        }
    }

    /**
     * A `{%UserView "id"%}` template becomes a subquery only when the view runs, and the provider
     * screens that rendered clause. Here each template stands in as `SELECT NULL` so the rest of
     * the clause can be parsed.
     */
    private static neutralizeViewTemplates(whereClause: string): string {
        return whereClause.replace(/{%[^%]+%}/g, 'SELECT NULL');
    }

    /**
     * SECURITY gate: `CustomWhereClause = 1` tells the platform to fold the stored
     * `WhereClause` into view SQL verbatim — it bypasses both the auto-generation in
     * `UpdateWhereClause()` and the render-time `ValidateUserProvidedSQLClause` screen in
     * the database provider (custom clauses may legitimately contain constructs that screen
     * blocks). That makes the CustomWhereClause/WhereClause pair an arbitrary-SQL channel,
     * so creating or modifying a view with `CustomWhereClause` enabled is restricted to
     * admin (Owner-type) users. Ordinary views (CustomWhereClause off) are unaffected.
     */
    private validateCustomWhereClauseAuthorization(result: ValidationResult): void {
        const isCustom = !!this.CustomWhereClause; // truthy — the DB may hand back true or 1
        if (!isCustom) {
            return;
        }
        const customDirty = this.GetFieldByName('CustomWhereClause')?.Dirty === true;
        const whereDirty = this.GetFieldByName('WhereClause')?.Dirty === true;
        // A new record is always authorized: a field first written without NewRecord() seeding it
        // does not read as dirty. On an existing record, only a change needs authorizing.
        if (this.IsSaved && !customDirty && !whereDirty) {
            return;
        }

        const user = this.ContextCurrentUser
            ?? (this.ProviderToUse as unknown as IMetadataProvider).CurrentUser;
        if (!user || user.Type?.trim().toLowerCase() !== 'owner') {
            result.Errors.push(new ValidationErrorInfo(
                'CustomWhereClause',
                'Only an administrator (Owner-type user) may create or modify a view with CustomWhereClause enabled — the custom WhereClause is executed as raw SQL.',
                this.CustomWhereClause,
                ValidationErrorType.Failure
            ));
        }
    }

    /**
     * This method will use AI to return a valid WHERE clause based on the provided prompt. This is automatically called at the right time if the view has SmartFilterEnabled turned on and the SmartFilterPrompt is set. If you want
     * to call this directly to get back a WHERE clause for other purposes you can call this method directly and provide both a prompt and the entity that the view is based on.
     * @param prompt
     */
    public async GenerateSmartFilterWhereClause(prompt: string, entityInfo: EntityInfo): Promise<{whereClause: string, userExplanation: string}> {
        try {
            if (this.AlternateBaseView && entityInfo) {
                const pinnedAbv = entityInfo.GetAlternateBaseView(this.AlternateBaseView);
                if (!pinnedAbv || !pinnedAbv.IsUsable) {
                    return { whereClause: '', userExplanation: '' };
                }
            }
            // Ensure AIEngine is configured
            await AIEngine.Instance.Config(false, this.ContextCurrentUser);

            // Find the Smart Filter Generation prompt
            const smartFilterPrompt = AIEngine.Instance.Prompts.find(
                p => p.Name === 'Smart Filter Generation' && p.Category === 'MJ: System'
            );

            if (!smartFilterPrompt) {
                throw new Error('Smart Filter Generation prompt not found. Please ensure the prompt metadata is synced.');
            }

            // Build template data for the prompt
            const templateData = this.BuildTemplateData(entityInfo);

            // Create execution parameters
            const params = new AIPromptParams();
            params.prompt = smartFilterPrompt;
            params.contextUser = this.ContextCurrentUser;
            params.data = templateData;
            params.attemptJSONRepair = true; // Help with JSON parsing issues

            // Add the user's filter request as a conversation message
            params.conversationMessages = [
                {
                    role: 'user',
                    content: prompt
                }
            ];

            // Execute the prompt
            const runner = new AIPromptRunner();
            const result = await runner.ExecutePrompt<SmartFilterResponse>(params);

            if (!result.success) {
                throw new Error(`AI prompt execution failed: ${result.errorMessage}`);
            }

            // If the prompt runner already parsed into an object, use it directly.
            // Otherwise parse the string result (OutputType='string' returns raw text
            // that may be wrapped in markdown fencing).
            let llmResponse: SmartFilterResponse | null;
            if (result.result && typeof result.result === 'object' && 'whereClause' in result.result) {
                llmResponse = result.result;
            } else {
                llmResponse = CleanAndParseJSON<SmartFilterResponse>(String(result.result ?? result.rawResult ?? ''), true);
            }
            if (!llmResponse) {
                throw new Error(`Invalid response from AI, could not extract whereClause`);
            }

            // Handle the whereClause - sometimes LLM prefixes with WHERE
            if (llmResponse.whereClause && llmResponse.whereClause.length > 0) {
                const trimmed = llmResponse.whereClause.trim();
                const whereClause = trimmed.toLowerCase().startsWith('where ')
                    ? trimmed.substring(6)
                    : llmResponse.whereClause;

                return {
                    whereClause,
                    userExplanation: llmResponse.userExplanationMessage
                };
            }
            else if (llmResponse.whereClause !== undefined && llmResponse.whereClause !== null) {
                // Empty string is valid - means no where clause
                return {
                    whereClause: '',
                    userExplanation: llmResponse.userExplanationMessage
                };
            }
            else {
                throw new Error('Invalid response from AI, no whereClause property found');
            }
        }
        catch (e) {
            LogError(e);
            throw e;
        }
    }

    /**
     * Builds the template data object for the Smart Filter Generation prompt.
     * This data is used to populate the Nunjucks template variables.
     */
    protected BuildTemplateData(entityInfo: EntityInfo): SmartFilterTemplateData {
        const pinnedAbv = this.AlternateBaseView
            ? entityInfo.GetAlternateBaseView(this.AlternateBaseView)
            : undefined;
        const effectiveBaseView = pinnedAbv && pinnedAbv.IsUsable ? pinnedAbv.ViewName : entityInfo.BaseView;

        const processedViews: string[] = [entityInfo.BaseView];
        if (effectiveBaseView !== entityInfo.BaseView) {
            processedViews.push(effectiveBaseView);
        }
        const md: IMetadataProvider = this.ProviderToUse as unknown as IMetadataProvider;
        const listsEntity = md.EntityByName("MJ: Lists");
        const listDetailsEntity = md.EntityByName("MJ: List Details");

        // Build fields description
        let fieldsDescription = entityInfo.Fields.map(f => {
            let ret: string = `${f.Name} (${f.Type})`;
            if (f.RelatedEntity) {
                ret += ` (fkey to ${f.RelatedEntityBaseView})`;
            }
            return ret;
        }).join(',');

        if (pinnedAbv && pinnedAbv.IsUsable) {
            fieldsDescription +=
                `\n[Base View Context: Reading from alternate base view '${pinnedAbv.EffectiveDisplayName}' (${pinnedAbv.ViewName}): ${pinnedAbv.Description}. ` +
                `Do NOT duplicate conditions already enforced by this base view unless the user explicitly asks to refine them.]`;
        }

        // Build related views description
        const relatedViewsDescription = this.BuildRelatedViewsDescription(entityInfo, md, processedViews);

        // Build lists fields
        const listsFields = listsEntity ? listsEntity.Fields.map(f => {
            return f.Name + ' (' + f.SQLFullType + ')';
        }).join(', ') : '';

        // Build list details fields
        const listDetailsFields = listDetailsEntity ? listDetailsEntity.Fields.map(f => {
            return f.Name + ' (' + f.SQLFullType + ')';
        }).join(', ') : '';

        const templateData: SmartFilterTemplateData = {
            entityName: entityInfo.Name,
            entityId: entityInfo.ID,
            baseView: effectiveBaseView,
            fieldsDescription,
            relatedViewsDescription: relatedViewsDescription.length > 0 ? relatedViewsDescription : '',
            listsSchema: listsEntity?.SchemaName || '__mj',
            listsFields,
            listDetailsFields,
        };
        if (pinnedAbv && pinnedAbv.IsUsable) {
            templateData.alternateBaseViewName = pinnedAbv.Name;
            templateData.alternateBaseViewDescription = pinnedAbv.Description;
        }
        return templateData;
    }

    /**
     * Builds the description of related views for the prompt template.
     */
    protected BuildRelatedViewsDescription(entityInfo: EntityInfo, md: IMetadataProvider, processedViews: string[]): string {
        const fkeyFields = entityInfo.Fields.filter(f => f.RelatedEntity && f.RelatedEntity.length > 0);
        const fkeyBaseViewsDistinct = fkeyFields.map(f => f.RelatedEntityBaseView).filter((v, i, a) => a.indexOf(v) === i);

        // Build fkey views description
        const fkeyViewsDesc = fkeyBaseViewsDistinct.map(v => {
            if (processedViews.indexOf(v) === -1) {
                const e = md.Entities.find(e => e.BaseView === v);
                if (e) {
                    processedViews.push(v);
                    return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                        return ef.Name + ' (' + ef.Type + ')';
                    }).join(',') }`;
                }
            }
            return '';
        }).filter(s => s.length > 0).join('\n');

        // Build related entities views description
        const relatedEntitiesDesc = entityInfo.RelatedEntities.map(r => {
            const e = md.Entities.find(e => e.Name === r.RelatedEntity);
            if (e && processedViews.indexOf(e.BaseView) === -1) {
                processedViews.push(e.BaseView);
                return `* ${e.SchemaName}.${e.BaseView}: ${e.Fields.map(ef => {
                    let ret: string = `${ef.Name} (${ef.Type})`;
                    if (ef.RelatedEntity) {
                        ret += ` (fkey to ${ef.RelatedEntityBaseView})`;
                    }
                    return ret;
                }).join(',') }`;
            }
            return '';
        }).filter(s => s.length > 0).join('\n');

        return [fkeyViewsDesc, relatedEntitiesDesc].filter(s => s.length > 0).join('\n');
    }
}