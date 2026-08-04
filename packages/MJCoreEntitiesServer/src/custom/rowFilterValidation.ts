/**
 * Shared save-time validation for API-key row filters (plan §5.3 checks 1-6 +
 * §5.6.1 authoring rejection).
 *
 * Used by three server-side entity subclasses:
 * - MJAPIKeyScopeEntityServer / MJAPIApplicationScopeEntityServer — validate a
 *   scope rule that carries a RowFilterID at rule save.
 * - MJRowLevelSecurityFilterEntityServer — re-validate a filter's FilterText
 *   against EVERY current referrer when the text changes (without this second
 *   enforcement point, rule-save validation is bypassable by editing the
 *   filter after attaching it).
 *
 * All checks fail closed: anything unresolvable rejects the save.
 */
import {
    EntityInfo,
    IMetadataProvider,
    RunView,
    UserInfo,
    ValidationErrorInfo,
    ValidationErrorType
} from '@memberjunction/core';

/**
 * Registered token vocabulary for row-filter FilterText (plan §5.2). `{{User*}}`
 * is a family (any scalar UserInfo property), matched by pattern; the rest are
 * exact names. Underscore-led User tokens (backing fields like
 * `{{User_IsMagicLinkAnonymous}}`) are deliberately NOT registered.
 */
const EXACT_REGISTERED_TOKENS: ReadonlySet<string> = new Set([
    'ScopeResourceID',
    'ScopeResourceType',
    'ActingOrganizationID',
    'ActingPersonID',
    'ActingScopeID',
    'ActingCompanyIDs'
]);

const USER_TOKEN_PATTERN = /^User[A-Za-z][A-Za-z0-9_]*$/;

/**
 * SQL keywords / operators / literals ignored by the STRICT column-reference
 * check (emulating SQLExpressionValidator.checkFieldReferences, but rejecting
 * instead of warning). Function names are handled separately (identifier
 * followed by `(`), so this list only needs bare-word SQL vocabulary that
 * legitimately appears in a WHERE-clause expression.
 */
const SQL_BARE_KEYWORDS: ReadonlySet<string> = new Set([
    'AND', 'OR', 'NOT', 'IN', 'IS', 'NULL', 'LIKE', 'BETWEEN', 'EXISTS',
    'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ESCAPE', 'ASC', 'DESC',
    'TRUE', 'FALSE', 'DISTINCT', 'SOME', 'ANY', 'ALL', 'AS'
]);

/** Result of a row-filter text validation. */
export interface RowFilterTextValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Validates a filter's FilterText against a specific entity (plan §5.3 checks
 * 3 + 4, STRICT):
 * - every `{{Token}}` must be a member of the registered vocabulary;
 * - every bare column identifier must resolve to a real, NON-VIRTUAL,
 *   non-computed field on the entity (unknown identifiers reject — no lenient
 *   "maybe it's a computed column" pass).
 */
export function ValidateRowFilterTextAgainstEntity(filterText: string, entity: EntityInfo): RowFilterTextValidationResult {
    const errors: string[] = [];

    // 1. Token vocabulary check, then strip tokens so their contents don't hit
    //    the identifier scan.
    let stripped = filterText.replace(/\{\{(\w+)\}\}/g, (_full, token: string) => {
        if (!EXACT_REGISTERED_TOKENS.has(token) && !USER_TOKEN_PATTERN.test(token)) {
            errors.push(
                `Token {{${token}}} is not in the registered vocabulary ` +
                `({{User*}}, {{ScopeResourceID}}, {{ScopeResourceType}}, {{ActingOrganizationID}}, ` +
                `{{ActingPersonID}}, {{ActingScopeID}}, {{ActingCompanyIDs}}).`
            );
        }
        return "''"; // replace with an empty string literal so surrounding quotes stay balanced
    });

    // 2. Strip string literals (handles '' escapes) so their contents are not
    //    scanned as identifiers.
    stripped = stripped.replace(/'(?:[^']|'')*'/g, '');

    const writableFields = new Set(
        entity.Fields.filter(f => !f.IsVirtual).map(f => f.Name.toUpperCase())
    );

    const checkIdentifier = (identifier: string): void => {
        if (!writableFields.has(identifier.toUpperCase())) {
            errors.push(
                `Column '${identifier}' does not resolve to a real non-virtual field on entity '${entity.Name}'.`
            );
        }
    };

    // 3. Bracketed identifiers ([Col]) always denote columns — check each, then
    //    remove them from the identifier scan.
    stripped = stripped.replace(/\[([^\]]+)\]/g, (_full, identifier: string) => {
        checkIdentifier(identifier);
        return '';
    });

    // 4. Bare identifiers not followed by '(' (function calls are SQL functions,
    //    not columns) and not SQL keywords must be entity columns. Purely
    //    numeric literals never match (pattern requires a leading letter/_).
    const identifierPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()/g;
    let match: RegExpExecArray | null;
    while ((match = identifierPattern.exec(stripped)) !== null) {
        const word = match[1];
        if (SQL_BARE_KEYWORDS.has(word.toUpperCase())) {
            continue;
        }
        checkIdentifier(word);
    }

    return { valid: errors.length === 0, errors };
}

/**
 * True when a ResourcePattern is a single EXACT resource name — no `*` / `?`
 * wildcards and no comma-separated list (plan §5.3 check 1).
 */
export function IsExactResourceName(pattern: string | null): pattern is string {
    return (
        pattern != null &&
        pattern.trim().length > 0 &&
        !pattern.includes('*') &&
        !pattern.includes('?') &&
        !pattern.includes(',')
    );
}

/** One referrer of a RowLevelSecurityFilter record, resolved to its entity. */
export interface RowFilterReferrer {
    /** Human-readable description of the referring row, for error messages. */
    Description: string;
    /** The entity the referrer binds the filter to, or null when unresolvable. */
    Entity: EntityInfo | null;
}

/**
 * Collects EVERY referrer of a RowLevelSecurityFilter record (plan §5.3 check 6):
 * - EntityPermission rows via their four `*RLSFilterID` columns (entity via EntityID),
 * - APIKeyScope / APIApplicationScope rows via RowFilterID (entity via their
 *   exact ResourcePattern).
 * An optional `exclude` predicate lets the row being saved skip itself.
 */
export async function CollectRowFilterReferrers(
    filterId: string,
    md: IMetadataProvider,
    contextUser: UserInfo,
    exclude?: { entityName: string; rowId: string }
): Promise<RowFilterReferrer[]> {
    const rv = new RunView();
    const [permissions, keyScopes, appScopes] = await rv.RunViews([
        {
            EntityName: 'MJ: Entity Permissions',
            ExtraFilter:
                `ReadRLSFilterID='${filterId}' OR CreateRLSFilterID='${filterId}' OR ` +
                `UpdateRLSFilterID='${filterId}' OR DeleteRLSFilterID='${filterId}'`,
            Fields: ['ID', 'EntityID'],
            ResultType: 'simple'
        },
        {
            EntityName: 'MJ: API Key Scopes',
            ExtraFilter: `RowFilterID='${filterId}'`,
            Fields: ['ID', 'ResourcePattern'],
            ResultType: 'simple'
        },
        {
            EntityName: 'MJ: API Application Scopes',
            ExtraFilter: `RowFilterID='${filterId}'`,
            Fields: ['ID', 'ResourcePattern'],
            ResultType: 'simple'
        }
    ], contextUser);

    const failed = [permissions, keyScopes, appScopes].find(r => !r.Success);
    if (failed) {
        // Fail closed: an unreadable referrer set cannot prove the same-entity invariant.
        throw new Error(`Unable to load referrers of Row Level Security Filter ${filterId}: ${failed.ErrorMessage}`);
    }

    const referrers: RowFilterReferrer[] = [];

    for (const row of (permissions.Results as { ID: string; EntityID: string }[])) {
        const entity = (row.EntityID ? md.EntityByID(row.EntityID) : undefined) ?? null;
        referrers.push({
            Description: `Entity Permission ${row.ID} (entity ${entity?.Name ?? row.EntityID})`,
            Entity: entity
        });
    }

    const addScopeReferrers = (
        rows: { ID: string; ResourcePattern: string | null }[],
        entityName: string,
        label: string
    ): void => {
        for (const row of rows) {
            if (exclude && exclude.entityName === entityName && exclude.rowId.toLowerCase() === row.ID.toLowerCase()) {
                continue;
            }
            const entity = IsExactResourceName(row.ResourcePattern) ? (md.EntityByName(row.ResourcePattern) ?? null) : null;
            referrers.push({
                Description: `${label} ${row.ID} (resource '${row.ResourcePattern ?? ''}')`,
                Entity: entity
            });
        }
    };

    addScopeReferrers(keyScopes.Results as { ID: string; ResourcePattern: string | null }[], 'MJ: API Key Scopes', 'API Key Scope rule');
    addScopeReferrers(appScopes.Results as { ID: string; ResourcePattern: string | null }[], 'MJ: API Application Scopes', 'API Application Scope rule');

    return referrers;
}

/**
 * Enforces the same-entity invariant (plan §5.1/§5.3 check 6): every referrer
 * of a shared filter must resolve to the SAME entity the current save binds it
 * to. A filter record carries no entity binding of its own — all entity context
 * lives in the referrers — so cross-entity sharing would let one row's edit
 * silently break another entity's filter. Unresolvable referrers reject too
 * (fail closed).
 */
export function BuildSameEntityErrors(referrers: RowFilterReferrer[], targetEntity: EntityInfo): string[] {
    const errors: string[] = [];
    for (const referrer of referrers) {
        if (!referrer.Entity) {
            errors.push(
                `${referrer.Description} references the same row filter but does not resolve to an entity — ` +
                `cannot prove the same-entity invariant; rejecting (fail closed).`
            );
        } else if (referrer.Entity.ID.toLowerCase() !== targetEntity.ID.toLowerCase()) {
            errors.push(
                `${referrer.Description} binds the same row filter to entity '${referrer.Entity.Name}', but this rule ` +
                `binds it to '${targetEntity.Name}'. Every referrer of a filter must resolve to the same entity — ` +
                `use a separate filter record per entity.`
            );
        }
    }
    return errors;
}

/** Convenience: wraps validation failures as ValidationErrorInfo entries. */
export function ToValidationErrors(fieldName: string, messages: string[]): ValidationErrorInfo[] {
    return messages.map(m => new ValidationErrorInfo(fieldName, m, null, ValidationErrorType.Failure));
}

/**
 * The scope-rule fields the shared row-filter validation needs, abstracted over
 * the two scope tables (key rules are owned by an API key, application rules by
 * an application).
 */
export interface ScopeRuleForRowFilterValidation {
    /** The saved row's ID ('' for a new record — used only to exclude self from referrer checks). */
    RowId: string;
    /** Which scope table the rule lives in. */
    RuleEntityName: 'MJ: API Key Scopes' | 'MJ: API Application Scopes';
    /** SQL filter selecting ALL rules of the same owner (e.g. `APIKeyID='...'`). */
    OwnerFilterClause: string;
    /** 'API key' | 'application' — for error messages. */
    OwnerLabel: string;
    ScopeID: string;
    ResourcePattern: string | null;
    PatternType: string;
    IsDeny: boolean;
    RowFilterID: string | null;
}

/**
 * Full save-time validation for a scope rule (plan §5.3 checks 1-6 and the
 * §5.6.1 full_access ⊕ row-filter authoring rejection). Returns error messages;
 * empty = valid. Shared by MJAPIKeyScopeEntityServer and
 * MJAPIApplicationScopeEntityServer.
 */
export async function ValidateScopeRuleRowFilter(
    rule: ScopeRuleForRowFilterValidation,
    md: IMetadataProvider,
    contextUser: UserInfo
): Promise<string[]> {
    const rv = new RunView();

    // Resolve the full_access scope ID (needed for §5.6.1 in both directions).
    const fullAccessResult = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: API Scopes',
        ExtraFilter: `FullPath='full_access'`,
        Fields: ['ID'],
        ResultType: 'simple'
    }, contextUser);
    if (!fullAccessResult.Success) {
        return [`Unable to resolve the full_access scope: ${fullAccessResult.ErrorMessage}. Rejecting (fail closed).`];
    }
    const fullAccessScopeId = fullAccessResult.Results[0]?.ID?.toLowerCase();
    const isFullAccessGrant =
        fullAccessScopeId != null && rule.ScopeID?.toLowerCase() === fullAccessScopeId && !rule.IsDeny;

    // Nothing row-filter-related on this rule and it is not a full_access grant → nothing to check.
    if (rule.RowFilterID == null && !isFullAccessGrant) {
        return [];
    }

    // Sibling rules of the same owner (for §5.6.1 both directions).
    const siblingsResult = await rv.RunView<{ ID: string; ScopeID: string; RowFilterID: string | null; IsDeny: boolean }>({
        EntityName: rule.RuleEntityName,
        ExtraFilter: rule.OwnerFilterClause,
        Fields: ['ID', 'ScopeID', 'RowFilterID', 'IsDeny'],
        ResultType: 'simple'
    }, contextUser);
    if (!siblingsResult.Success) {
        return [`Unable to load the ${rule.OwnerLabel}'s other scope rules: ${siblingsResult.ErrorMessage}. Rejecting (fail closed).`];
    }
    const siblings = siblingsResult.Results.filter(s => s.ID.toLowerCase() !== rule.RowId.toLowerCase());

    const errors: string[] = [];

    // §5.6.1 — a full_access grant on an owner that has (or is getting) a filtered rule.
    if (isFullAccessGrant) {
        const filteredSibling = siblings.find(s => s.RowFilterID != null);
        if (rule.RowFilterID != null) {
            errors.push(
                `Cannot set a row filter on a full_access grant: full_access is unrestricted by definition, so a row ` +
                `filter alongside it is incoherent. Remove the full_access grant or the row filter — or split the ` +
                `${rule.OwnerLabel}'s access across two keys.`
            );
        }
        if (filteredSibling) {
            errors.push(
                `Cannot grant full_access to this ${rule.OwnerLabel}: scope rule ${filteredSibling.ID} already carries a ` +
                `row filter, and full_access is unrestricted by definition — one of the two would be a lie about what ` +
                `the ${rule.OwnerLabel} can reach. Remove the row filter or do not grant full_access (split the key).`
            );
        }
    }

    if (rule.RowFilterID == null) {
        return errors;
    }

    // §5.6.1 (other direction) — setting a row filter while the owner holds a full_access grant.
    if (!isFullAccessGrant && fullAccessScopeId != null) {
        const fullAccessSibling = siblings.find(s => s.ScopeID?.toLowerCase() === fullAccessScopeId && !s.IsDeny);
        if (fullAccessSibling) {
            errors.push(
                `Cannot set a row filter on this scope rule: the ${rule.OwnerLabel} also holds a full_access grant ` +
                `(rule ${fullAccessSibling.ID}), which is unrestricted by definition. Remove the full_access grant or ` +
                `the row filter.`
            );
        }
    }

    // §5.3 check 5 — a filter narrows an ALLOW; deny/Exclude rules cannot carry one.
    if (rule.IsDeny) {
        errors.push(`A row filter cannot be attached to a deny rule — a filter narrows an allow; attaching it to a deny has no coherent meaning.`);
    }
    if (rule.PatternType === 'Exclude') {
        errors.push(`A row filter cannot be attached to an Exclude rule — a filter narrows an allow; attaching it to an exclusion has no coherent meaning.`);
    }

    // §5.3 checks 1-2 — exact, resolvable entity.
    if (!IsExactResourceName(rule.ResourcePattern)) {
        errors.push(
            `A scope rule with a row filter must name a single exact entity in ResourcePattern — no '*' or '?' ` +
            `wildcards and no comma-separated lists (current value: '${rule.ResourcePattern ?? ''}').`
        );
        return errors; // no entity to validate the filter against
    }
    const entity = md.EntityByName(rule.ResourcePattern);
    if (!entity) {
        errors.push(`ResourcePattern '${rule.ResourcePattern}' does not resolve to an entity.`);
        return errors;
    }

    // §5.3 checks 3-4 — the filter must exist and its text must pass the strict token/column validation.
    const filterResult = await rv.RunView<{ ID: string; Name: string; FilterText: string | null }>({
        EntityName: 'MJ: Row Level Security Filters',
        ExtraFilter: `ID='${rule.RowFilterID}'`,
        Fields: ['ID', 'Name', 'FilterText'],
        ResultType: 'simple'
    }, contextUser);
    if (!filterResult.Success) {
        errors.push(`Unable to load Row Level Security Filter ${rule.RowFilterID}: ${filterResult.ErrorMessage}. Rejecting (fail closed).`);
        return errors;
    }
    const filter = filterResult.Results[0];
    if (!filter) {
        errors.push(`Row Level Security Filter ${rule.RowFilterID} does not exist.`);
        return errors;
    }
    if (!filter.FilterText || filter.FilterText.trim().length === 0) {
        errors.push(`Row Level Security Filter '${filter.Name}' has no FilterText — an empty filter cannot restrict anything and is rejected (fail closed).`);
        return errors;
    }
    const textValidation = ValidateRowFilterTextAgainstEntity(filter.FilterText, entity);
    errors.push(...textValidation.errors.map(e => `Filter '${filter.Name}': ${e}`));

    // §5.3 check 6 — same-entity invariant across every other referrer.
    try {
        const referrers = await CollectRowFilterReferrers(rule.RowFilterID, md, contextUser, {
            entityName: rule.RuleEntityName,
            rowId: rule.RowId
        });
        errors.push(...BuildSameEntityErrors(referrers, entity));
    } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
    }

    return errors;
}
