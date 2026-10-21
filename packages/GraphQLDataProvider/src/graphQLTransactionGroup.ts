import { BaseEntity, BaseEntityResult, DataObjectParams, EntityField, TransactionGroupBase, TransactionItem, TransactionResult } from "@memberjunction/core";
import { GraphQLDataProvider } from "./graphQLDataProvider";
import { gql } from "graphql-request";
import { SafeJSONParse } from "@memberjunction/global";

export class GraphQLTransactionGroup extends TransactionGroupBase {
    private _provider: GraphQLDataProvider;
    constructor(provider: GraphQLDataProvider) {
        super();
        this._provider = provider;
    }

    /**
     * Checks whether `field` is dirty on `entity` or, for IS-A child entities where parent
     * fields are mirrored as virtual fields, on any ancestor in the `ISAParent` chain.
     */
    private isFieldDirtyOnChain(entity: BaseEntity, field: EntityField): boolean {
        if (entity.ISAParent && entity.EntityInfo?.ParentEntityFieldNames?.has(field.Name)) {
            const parentField = entity.ISAParent.Fields.find(pf => pf.Name === field.Name);
            if (parentField) {
                return this.isFieldDirtyOnChain(entity.ISAParent, parentField) || field.Dirty;
            }
        }
        return field.Dirty;
    }

    /**
     * Serializes a pending transaction item's entity for the `ExecuteTransactionGroup` wire payload.
     *
     * - **Update (when `ignoreDirtyState` is not set)**: Excludes all non-primary-key fields that
     *   are read-only, `NotLoaded`, or clean (`!Dirty`), so only primary keys and mutated writable
     *   fields (plus any companion payloads) cross the wire. On the server,
     *   `TransactionResolver.ExecuteTransactionGroup` loads the existing row via `InnerLoad(pkey)`
     *   before calling `entity.SetMany(itemValues, true)`, so untouched fields remain intact.
     * - **Create / Delete / `ignoreDirtyState`**: Serializes the full loaded data object via
     *   `GetDataObjectJSON()`.
     * - **Every operation**: leaves out the fields the current user may not read.
     */
    private async serializeTransactionItemEntity(pt: TransactionItem): Promise<string> {
        const entity = pt.BaseEntity;
        const ignoreDirty = Boolean((pt.ExtraData as { ignoreDirtyState?: boolean } | undefined)?.ignoreDirtyState);
        const fields = Array.isArray(entity.Fields) ? entity.Fields : [];
        const denied = this.deniedReadFieldNames(entity);
        const excludeFields = fields
            .filter(f => !f.IsPrimaryKey && (
                denied.has(f.Name.trim().toLowerCase()) ||
                (pt.OperationType === 'Update' && !ignoreDirty && (f.ReadOnly || f.NotLoaded || !this.isFieldDirtyOnChain(entity, f)))
            ))
            .map(f => f.Name);
        if (excludeFields.length === 0) {
            return await entity.GetDataObjectJSON();
        }
        const params: DataObjectParams = {
            oldValues: false,
            omitNullValues: false,
            omitEmptyStrings: false,
            excludeFields,
            includeRelatedEntityData: false,
            relatedEntityList: []
        };
        return await entity.GetDataObjectJSON(params);
    }

    /**
     * The fields the current user may not READ on `entity`'s entity, lowercased. A loaded record
     * already omits them (they are not loaded), but a new record holds every field at its default,
     * and the server refuses a restricted caller's payload that names a field it may not read.
     */
    private deniedReadFieldNames(entity: BaseEntity): Set<string> {
        const user = this._provider.CurrentUser;
        if (!entity.EntityInfo?.FieldLevelSecurityApplies || !user) {
            return new Set<string>();
        }
        return entity.EntityInfo.GetDeniedReadFields(user);
    }

    // new implementation
    protected async HandleSubmit(): Promise<TransactionResult[]> {
        // Define the mutation
        const mutation = gql`
        mutation ExecuteTransactionGroup($group: TransactionInputType!) {
            ExecuteTransactionGroup(group: $group) {
                Success
                ErrorMessages
                ResultsJSON
            }
        }
        `;

        // Example variables for the mutation
        const items = [];
        for (const pt of this.PendingTransactions) {
            items.push({
                EntityName: pt.BaseEntity.EntityInfo.Name,
                EntityObjectJSON: await this.serializeTransactionItemEntity(pt),
                OperationType: pt.OperationType
            });
        }
        const vars = {
            group: {
                Items: items,
                Variables: this.Variables.map(v => {
                    return {
                        Name: v.Name,
                        ItemIndex: this.MapVariableEntityObjectToPosition(v),
                        FieldName: v.FieldName,
                        Type: v.Type
                    }
                }) 
            }
        };        

        // The group writes exactly its items' entities, so only their dedup-linger entries are dropped.
        const affectedEntityNames = [...new Set(items.map(item => item.EntityName))];
        const results = await this._provider.ExecuteGQL(mutation, vars, true, { AffectedEntityNames: affectedEntityNames })
        if (results && results.ExecuteTransactionGroup) {
            const data = results.ExecuteTransactionGroup;
            // The server's Success flag is authoritative. When the server-side transaction failed
            // (rolled back), PrepareReturnValue still serializes each entity's IN-MEMORY state into
            // ResultsJSON — so the old per-item "resultObject !== null" test reported success for
            // every item of a rolled-back transaction, TransactionGroupBase.Submit() returned true,
            // and each entity finalized itself against phantom (never-persisted) data. Gate every
            // per-item success on the transaction-level Success so a rollback surfaces as
            // Submit() === false with per-entity failure results (see TransactionGroupBase.Submit's
            // callback + notification flow).
            const transactionSucceeded = data.Success === true;
            const returnResults: TransactionResult[] = [];
            for (let i = 0; i < this.PendingTransactions.length; i++) {
                const resultJSON = data.ResultsJSON[i];
                const resultObject = SafeJSONParse(resultJSON);
                const item = this.PendingTransactions[i];
                if (!transactionSucceeded) {
                    this.recordServerFailure(item.BaseEntity, data.ErrorMessages?.[i]);
                }
                returnResults.push(new TransactionResult(item, resultObject, transactionSucceeded && resultObject !== null));
            }
            return returnResults;
        }
        else {
            throw new Error('Failed to execute transaction group');
        }
    }

    /**
     * Copies the server's own failure result for one item onto that item's entity, so the caller can
     * say WHICH row failed and why (#4309).
     *
     * The reason was always on the wire — `TransactionGroupResolver.PrepareReturnValue` maps
     * `ErrorMessages` from every entity's `LatestResult` — and this class discarded it, leaving
     * `TransactionGroupBase.Submit()`'s notification handler to record the generic
     * "Transaction group failed" instead. `TransactionResult`'s own docstring already directs
     * consumers to `BaseEntity.LatestResult`, so that is where this belongs rather than on a new
     * field nothing reads yet.
     *
     * Registering here rather than in the notification handler is what makes it stick:
     * `BaseEntity`'s handler only invents its generic result when NOTHING was added to the history
     * (`currentResultCount === this.ResultHistory.length`), and `HandleSubmit` runs first.
     *
     * The predicate is whether the server sent an actual REASON, not whether it sent `Success:
     * false` — every item of a failed group reports false. `DatabaseProviderBase` registers an
     * entity's result *before* enrolling the row and only flips it to true in the transaction
     * callback, so a row that enrolled and was then abandoned serializes as `Success: false` with
     * an EMPTY message. Keying on the flag would overwrite `BaseEntity`'s own "Transaction group
     * failed" with a blank one, making the report worse for every non-refused row. So this only
     * ever UPGRADES the message, and stays silent when it has nothing to add.
     */
    private recordServerFailure(entity: BaseEntity, errorMessageJSON: string | undefined): void {
        const serverResult = SafeJSONParse<Partial<BaseEntityResult>>(errorMessageJSON ?? '');
        if (!serverResult || serverResult.Success !== false) {
            return;
        }
        const message = serverResult.Message?.trim();
        if (!message && (serverResult.Errors?.length ?? 0) === 0) {
            return; // failed, but the server told us nothing this entity does not already know
        }
        const result = new BaseEntityResult();
        result.Success = false;
        result.Type = serverResult.Type ?? (entity.IsSaved ? 'update' : 'create');
        result.Message = message ?? null;
        result.Errors = serverResult.Errors ?? [];
        result.StartedAt = new Date();
        result.EndedAt = new Date();
        entity.RegisterResultHistoryEntry(result);
    }
}
