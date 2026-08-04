import { BaseEntity, EntityInfo, Metadata } from "@memberjunction/core";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";
import { MJEntityActionEntityExtended } from "./MJEntityActionEntityExtended";

/**
 * ============================================================================
 * SCOPE RESOLUTION SEAM
 * ============================================================================
 *
 * An `EntityAction` may be narrowed to ONE configuration record — *this Deal
 * Type*, *this Contract Type*, *this Pipeline*, *this Company* — via the
 * `ScopeEntityID` / `ScopeRecordID` pair. `NULL` means "applies to every record
 * of the entity", which is the pre-existing behaviour and by far the common case.
 *
 * The framework **stores and filters on the pair; it does not interpret it.**
 * *How* a scope record relates to a subject record is an application concern:
 * Sales knows a Deal reaches its Deal Type through `Deal.DealTypeID`, and core
 * must not. So the question *"does this subject record fall under this scope
 * record?"* is answered by a `@RegisterClass`-resolved resolver, keyed by scope
 * entity name, most-specific wins — the same shape as `BasePriceResolver` in
 * BizApps Orders and `GLAccountResolver` in Accounting.
 *
 * The default implementation below walks the subject entity's foreign keys
 * looking for one that points at the scope entity. That covers the direct case
 * (Sales registers nothing for `Deal Types` because `Deal.DealTypeID` is found
 * automatically). An app needing something indirect — scope by Company where the
 * subject reaches Company through a Pipeline — registers its own resolver:
 *
 * ```typescript
 * @RegisterClass(EntityActionScopeResolver, 'Companies')
 * export class CompanyScopeResolver extends EntityActionScopeResolver {
 *     public override async IsInScope(subject: BaseEntity, scopeEntityID: string, scopeRecordID: string): Promise<boolean | null> {
 *         // return null to decline and fall back to the default FK walk
 *     }
 * }
 * ```
 *
 * **Declining returns `null`, not `false`.** `false` means "I looked and this
 * record is out of scope"; `null` means "not my call" and falls back to the
 * default. Conflating them would silently disable every binding a partially
 * applicable resolver didn't recognise.
 */
export class EntityActionScopeResolver {
    /**
     * Answers whether `subject` falls under the scope record identified by
     * `scopeEntityID` / `scopeRecordID`.
     *
     * @returns `true` / `false` for a decision, or `null` to decline and let the
     *          caller fall back to the default foreign-key walk.
     */
    public async IsInScope(
        subject: BaseEntity,
        scopeEntityID: string,
        scopeRecordID: string
    ): Promise<boolean | null> {
        return this.DefaultForeignKeyWalk(subject, scopeEntityID, scopeRecordID);
    }

    /**
     * The default answer: look for a foreign key on the subject entity that points at the scope
     * entity, and compare the subject's value for that field against the scope record's ID.
     *
     * Returns `null` when the subject has no foreign key to the scope entity at all — the
     * relationship is indirect and only the owning app knows how to traverse it, so declining is
     * more honest than answering `false`. Returns `null` for ambiguity too: when several distinct
     * foreign keys point at the scope entity, picking one arbitrarily would silently bind the
     * workflow to the wrong relationship (a `Deal` with both `OwnerCompanyID` and `ClientCompanyID`
     * has no single defensible "the" Company).
     */
    protected DefaultForeignKeyWalk(
        subject: BaseEntity,
        scopeEntityID: string,
        scopeRecordID: string
    ): boolean | null {
        const candidates = this.FindForeignKeyFields(subject.EntityInfo, scopeEntityID);
        if (candidates.length !== 1) {
            return null;
        }
        const value = subject.Get(candidates[0]);
        if (value === null || value === undefined) {
            return false;
        }
        return this.ValuesMatch(String(value), scopeRecordID);
    }

    /** Names of the subject entity's fields that are foreign keys into the scope entity. */
    protected FindForeignKeyFields(subjectEntity: EntityInfo, scopeEntityID: string): string[] {
        return subjectEntity.Fields
            .filter(f => f.RelatedEntityID && UUIDsEqual(f.RelatedEntityID, scopeEntityID))
            .map(f => f.Name);
    }

    /**
     * Compares a subject's foreign-key value against a scope record ID. Scope record IDs are stored
     * as text and may be UUIDs (which differ in case between SQL Server and PostgreSQL) or numeric
     * keys, so `UUIDsEqual` handles the former and a trimmed comparison the latter.
     */
    protected ValuesMatch(subjectValue: string, scopeRecordID: string): boolean {
        return UUIDsEqual(subjectValue, scopeRecordID) ||
            subjectValue.trim() === (scopeRecordID ?? '').trim();
    }
}

/**
 * Decides whether a candidate binding applies to a subject record.
 *
 * Unscoped bindings (`ScopeEntityID` NULL) always apply — that is the
 * pre-existing behaviour and must never be narrowed. Scoped bindings ask the
 * resolver registered for the scope entity, falling back to the default
 * foreign-key walk when no app-specific resolver declines or exists.
 *
 * **Fails open on an unanswerable scope**: when the scope entity is unknown to
 * metadata or no resolver can decide, the binding is treated as *not*
 * applicable, because a binding an administrator deliberately narrowed should
 * not silently fire on every record of the entity. That is the safe direction —
 * a workflow that doesn't run is visible; one that runs on every record is a
 * production incident.
 */
export async function IsEntityActionInScope(
    entityAction: MJEntityActionEntityExtended,
    subject: BaseEntity | undefined | null,
    resolveResolver: (scopeEntityName: string) => EntityActionScopeResolver | null
): Promise<boolean> {
    const scopeEntityID = entityAction.ScopeEntityID;
    const scopeRecordID = entityAction.ScopeRecordID;

    // Unscoped — applies to all records. The overwhelmingly common case, and the
    // pre-existing behaviour, so it short-circuits before any lookup.
    if (!scopeEntityID || !scopeRecordID) {
        return true;
    }

    // A scoped binding with no subject record to test (a View/List dispatch that
    // hasn't resolved to a record yet) cannot be evaluated — decline rather than
    // fire it against everything.
    if (!subject) {
        return false;
    }

    const scopeEntity = new Metadata().EntityByID(scopeEntityID); // global-provider-ok: entity-definition lookup (structural metadata)
    if (!scopeEntity) {
        return false;
    }

    const resolver = resolveResolver(scopeEntity.Name);
    if (!resolver) {
        return false;
    }

    const answer = await resolver.IsInScope(subject, scopeEntityID, scopeRecordID);
    return answer === true;
}

/**
 * Resolves the {@link EntityActionScopeResolver} registered for a scope entity, most-specific wins.
 * Falls back to the base implementation (the foreign-key walk), which is what makes the direct case —
 * `Deal.DealTypeID` reaching `Deal Types` — work with no app registration at all.
 */
export function ResolveEntityActionScopeResolver(scopeEntityName: string): EntityActionScopeResolver | null {
    // GetRegistration first: having NO app-specific resolver is the normal, expected case (the default
    // foreign-key walk is the whole point), and going straight to CreateInstance would log a
    // "no registration found" warning on every scoped dispatch for something that isn't a problem.
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(EntityActionScopeResolver, scopeEntityName);
    if (!registration) {
        return new EntityActionScopeResolver();
    }
    return MJGlobal.Instance.ClassFactory.CreateInstance<EntityActionScopeResolver>(
        EntityActionScopeResolver,
        scopeEntityName
    ) ?? new EntityActionScopeResolver();
}
