/**
 * Shared helpers for the Interactive Forms action family. These all touch
 * the same two entities (`MJ: Components`, `MJ: Entity Form Overrides`),
 * lint the same spec shape, and need the same parameter conventions —
 * extracting here keeps each action thin.
 */
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { IMetadataProvider, UserInfo } from "@memberjunction/core";
import { EscapeSQLString, SafeJSONParse, UUIDsEqual } from "@memberjunction/global";
import {
    MJComponentEntity,
    MJEntityFormContributionEntity,
    MJEntityFormOverrideEntity,
} from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    isFormPanelRole,
    isFormRole,
    type FormContributionSpec,
} from "@memberjunction/interactive-component-types/forms";
import { ComponentLinter } from "@memberjunction/react-linter";

// ── parameter helpers ────────────────────────────────────────────────────

export function getParam(params: RunActionParams, name: string): unknown {
    const p = params.Params.find(x =>
        x.Name?.trim().toLowerCase() === name.toLowerCase());
    return p?.Value;
}

export function getStringParam(params: RunActionParams, name: string): string | null {
    const v = getParam(params, name);
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}

export function getNumberParam(params: RunActionParams, name: string): number | null {
    const v = getParam(params, name);
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v));
    return Number.isFinite(n) ? n : null;
}

export function addOutput(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({ Name: name, Type: "Output", Value: value });
}

// ── result helpers ───────────────────────────────────────────────────────

export function failure(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

export function success(message: string): ActionResultSimple {
    return { Success: true, ResultCode: "SUCCESS", Message: message };
}

// ── spec parsing + linting ───────────────────────────────────────────────

/** Parse a Spec param that may arrive as object or stringified JSON. */
export function parseSpecParam(raw: unknown): ComponentSpec | { error: string } {
    try {
        if (typeof raw === "string") {
            return JSON.parse(raw) as ComponentSpec;
        }
        return raw as ComponentSpec;
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Rules suppressed for both form roles. The form host (mj-react-component) creates
 * `callbacks` / `utilities` / `components` / `styles` once per instance (stable refs),
 * so depending on them in useEffect does not loop here; the prop and callback shape
 * rules only know the generic component surface, not the host-provided one.
 */
const ROLE_SUPPRESSED_RULES = new Set([
    "component-props-validation",
    "callback-event-validation",
    "useeffect-unstable-dependencies",
]);

/**
 * Lint body shared by both roles. `roleCheck` decides which role the spec must
 * declare; `roleLabel` names it in the failure message. Returns null on success,
 * a fail-fast ActionResultSimple on failure.
 */
async function lintRoleSpec(
    spec: ComponentSpec,
    contextUser: UserInfo,
    roleCheck: (s: Pick<ComponentSpec, 'componentRole'>) => boolean,
    roleLabel: string,
): Promise<ActionResultSimple | null> {
    if (!roleCheck(spec)) {
        return failure(
            "LINT_FAILED",
            `Spec must declare componentRole='${roleLabel}'. Got '${spec.componentRole ?? "(unset)"}'. The InteractiveForm runtime refuses to mount any other role.`,
        );
    }
    if (!spec.name || spec.name.trim().length === 0) {
        return failure("LINT_FAILED", "Spec.name is required.");
    }
    if (typeof spec.code !== "string" || spec.code.trim().length === 0) {
        return failure("LINT_FAILED", "Spec.code must be a non-empty JSX string.");
    }
    if (!spec.location) {
        return failure(
            "LINT_FAILED",
            "Spec.location is required (use 'embedded' for inline JSX or 'registry' to reference a published component).",
        );
    }
    try {
        const result = await ComponentLinter.lintComponent(
            spec.code, spec.name, spec, true, contextUser,
        );
        const blocking = (result.violations ?? []).filter(v => {
            const isBlocking = v.severity === "critical" || v.severity === "high";
            if (!isBlocking) return false;
            if (v.rule && ROLE_SUPPRESSED_RULES.has(v.rule)) return false;
            return true;
        });
        if (blocking.length > 0) {
            const messages = blocking
                .slice(0, 5)
                .map(v => `  [${v.severity}] ${v.rule ?? "lint"}: ${v.message}${v.line ? ` (line ${v.line})` : ""}`)
                .join("\n");
            return failure(
                "LINT_FAILED",
                `Spec code failed linting:\n${messages}${blocking.length > 5 ? `\n  (+${blocking.length - 5} more)` : ""}`,
            );
        }
    } catch (err) {
        return failure(
            "LINT_FAILED",
            `Linter could not parse spec code: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return null;
}

/** Lint a whole-form spec — `componentRole: 'form'`. */
export async function lintFormSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, isFormRole, 'form');
}

/** Lint a form-panel spec — `componentRole: 'form-panel'`. Same rules as {@link lintFormSpec}. */
export async function lintFormPanelSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, isFormPanelRole, 'form-panel');
}

// ── component / override fetch + write helpers ───────────────────────────

/** Load a Component entity object by primary key. */
export async function loadComponent(
    provider: IMetadataProvider, user: UserInfo, componentID: string,
): Promise<MJComponentEntity | null> {
    const c = await provider.GetEntityObject<MJComponentEntity>("MJ: Components", user);
    const loaded = await c.Load(componentID);
    return loaded ? c : null;
}

/** Load an Override entity object by primary key. */
export async function loadOverride(
    provider: IMetadataProvider, user: UserInfo, overrideID: string,
): Promise<MJEntityFormOverrideEntity | null> {
    const o = await provider.GetEntityObject<MJEntityFormOverrideEntity>("MJ: Entity Form Overrides", user);
    const loaded = await o.Load(overrideID);
    return loaded ? o : null;
}

/** Load a Contribution entity object by primary key. */
export async function loadContribution(
    provider: IMetadataProvider, user: UserInfo, contributionID: string,
): Promise<MJEntityFormContributionEntity | null> {
    const c = await provider.GetEntityObject<MJEntityFormContributionEntity>("MJ: Entity Form Contributions", user);
    const loaded = await c.Load(contributionID);
    return loaded ? c : null;
}

/**
 * Defense-in-depth ownership check for the override-mutation actions
 * (Modify / Activate / Revert).
 *
 * `Create` is naturally self-scoped — it always emits a fresh User-scope
 * row owned by the caller. The mutation actions, however, take an
 * `OverrideID` from the caller and operate on it; without this guard a
 * user could mutate another user's User-scope override by guessing the ID.
 * Row-level security may catch some of this, but we don't rely on it.
 *
 * Rules:
 *   - `Scope='User'`   → caller must be the owning user.
 *   - `Scope='Role'`   → caller must be a member of the override's role.
 *   - `Scope='Global'` → caller must be a system admin (`UserInfo.Type==='Owner'`).
 *
 * Returns `null` on success; a `FORBIDDEN` failure result on rejection.
 */
/** Row shape both override and contribution ownership checks read. */
/**
 * Filter for the `MJ: Entity Form Contributions` rows a caller may see: their own
 * User-scope rows, their roles' rows, and Global rows.
 *
 * Shared so every reader applies the same visibility. Two readers that disagree would
 * show a contribution in one place and hide it in another, and the apply flow's
 * duplicate check would miss a row the form is already rendering.
 */
export function ContributionScopeFilter(entityID: string, user: NonNullable<RunActionParams['ContextUser']>): string {
    const roleIDs = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? [])
        .map(r => r.RoleID).filter((x): x is string => !!x);
    const roleClause = roleIDs.length > 0
        ? `(Scope='Role' AND RoleID IN (${roleIDs.map(id => `'${EscapeSQLString(id)}'`).join(',')}))`
        : `(1=0)`;
    return `EntityID='${EscapeSQLString(entityID)}' AND ((Scope='User' AND UserID='${EscapeSQLString(user.ID)}') OR ${roleClause} OR Scope='Global')`;
}

export interface ScopedRow {
    ID: string;
    Scope: 'User' | 'Role' | 'Global' | string;
    UserID: string | null;
    RoleID: string | null;
}

/**
 * Ownership rules shared by every mutation action.
 *
 * `Create` is naturally self-scoped — it always emits a fresh User-scope row owned
 * by the caller. The mutation actions take a row ID from the caller and operate on
 * it; without this guard a user could mutate another user's User-scope row by
 * guessing the ID. Row-level security may catch some of this, but we don't rely on it.
 *
 *   - `Scope='User'`   → caller must be the owning user.
 *   - `Scope='Role'`   → caller must be a member of the row's role.
 *   - `Scope='Global'` → caller must be a system admin (`UserInfo.Type === 'Owner'`,
 *     MJ's canonical admin marker — see packages/MJCore/src/userInfo.ts).
 *
 * Returns `null` on success; a `FORBIDDEN` failure result on rejection.
 */
export function checkScopedOwnership(row: ScopedRow, user: UserInfo, label: string): ActionResultSimple | null {
    switch (row.Scope) {
        case 'User': {
            if (!UUIDsEqual(row.UserID, user.ID)) {
                return failure(
                    "FORBIDDEN",
                    `${label} ${row.ID} is User-scoped to a different user. Only the owning user can mutate it.`,
                );
            }
            return null;
        }
        case 'Role': {
            const userRoleIds = ((user as { UserRoles?: { RoleID?: string }[] }).UserRoles ?? [])
                .map(r => r.RoleID).filter((x): x is string => !!x);
            if (!row.RoleID || !userRoleIds.includes(row.RoleID)) {
                return failure(
                    "FORBIDDEN",
                    `${label} ${row.ID} is Role-scoped (${row.RoleID}). Only members of that role can mutate it.`,
                );
            }
            return null;
        }
        case 'Global': {
            const isOwner = ((user as { Type?: string }).Type ?? '').toLowerCase() === 'owner';
            if (!isOwner) {
                return failure(
                    "FORBIDDEN",
                    `${label} ${row.ID} is Global. Only Owner-type users can mutate Global rows; promote / demote them via Component Studio with appropriate privileges.`,
                );
            }
            return null;
        }
        default:
            return failure(
                "FORBIDDEN",
                `${label} ${row.ID} has an unrecognized Scope ('${row.Scope}').`,
            );
    }
}

/** Ownership check for the override-mutation actions (Modify / Activate / Revert). */
export function checkOverrideOwnership(
    override: Pick<MJEntityFormOverrideEntity, 'ID' | 'Scope' | 'UserID' | 'RoleID'>,
    user: UserInfo,
): ActionResultSimple | null {
    return checkScopedOwnership(override, user, 'Override');
}

/** Ownership check for the contribution-mutation actions. */
export function checkContributionOwnership(
    contribution: Pick<MJEntityFormContributionEntity, 'ID' | 'Scope' | 'UserID' | 'RoleID'>,
    user: UserInfo,
): ActionResultSimple | null {
    return checkScopedOwnership(contribution, user, 'Contribution');
}

/**
 * Lifecycle mapping. EntityFormOverride.Status uses
 * 'Active' / 'Pending' / 'Inactive' (it's the resolver-facing union). The
 * underlying Component table's Status column is the existing MJ Component
 * lifecycle: 'Draft' / 'Published' / 'Deprecated'. We mirror Override.Status
 * onto Component.Status using this map so a Component read in isolation still
 * tells you whether it's the active form (Published), a pending refinement
 * (Draft), or an archived version (Deprecated).
 */
export type FormLifecycle = 'Active' | 'Pending' | 'Inactive';
export function mapToComponentStatus(lifecycle: FormLifecycle): 'Published' | 'Draft' | 'Deprecated' {
    switch (lifecycle) {
        case 'Active':   return 'Published';
        case 'Pending':  return 'Draft';
        case 'Inactive': return 'Deprecated';
    }
}
export function mapFromComponentStatus(status: string | null | undefined): FormLifecycle {
    switch ((status ?? '').toLowerCase()) {
        case 'published': return 'Active';
        case 'draft':     return 'Pending';
        case 'deprecated': return 'Inactive';
        default:          return 'Inactive';   // unknown values treated as terminal
    }
}

/**
 * Insert a new Component row carrying the supplied spec. Used by both
 * Create (v1.0.0) and Modify (v(N+1).0) paths.
 *
 * - `version` / `versionSequence` are supplied by the caller — different
 *    actions have different bumping logic (Create starts at 1.0.0, Modify
 *    increments minor).
 * - `componentStatus` mirrors the override status the caller is targeting
 *    ('Active' or 'Pending') — translated to the Component table's union via
 *    {@link mapToComponentStatus}.
 */
export async function insertComponent(opts: {
    provider: IMetadataProvider;
    user: UserInfo;
    spec: ComponentSpec;
    fallbackName: string;
    description: string | null;
    version: string;
    versionSequence: number;
    componentStatus: FormLifecycle;
    /** 'Form' for whole forms (default), 'Widget' for form panels. */
    componentType?: 'Form' | 'Widget';
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const { provider, user, spec, fallbackName, description, version, versionSequence, componentStatus } = opts;
    const component = await provider.GetEntityObject<MJComponentEntity>("MJ: Components", user);
    component.NewRecord();
    component.Name = spec.name ?? fallbackName;
    component.Title = spec.title ?? fallbackName;
    component.Description = description ?? spec.description ?? null;
    component.Type = opts.componentType ?? "Form";
    component.Status = mapToComponentStatus(componentStatus);
    component.Version = version;
    component.VersionSequence = versionSequence;
    component.Specification = JSON.stringify(spec);
    component.DeveloperName = user.Name ?? null;
    const saved = await component.Save();
    if (!saved) {
        return { error: failure(
            "PERSIST_FAILED",
            `Component insert failed: ${component.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: component.ID };
}

/**
 * Insert a new EntityFormOverride row. Always User-scoped (security clamp)
 * unless `allowGlobalOrRole` is explicitly true — which is reserved for the
 * future "promote variant" UI path, not the agent.
 */
export async function insertOverride(opts: {
    provider: IMetadataProvider;
    user: UserInfo;
    entityID: string;
    componentID: string;
    name: string;
    description: string | null;
    notes?: string | null;
    status: 'Active' | 'Pending';
    priority?: number;
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const { provider, user, entityID, componentID, name, description, notes, status, priority } = opts;
    const override = await provider.GetEntityObject<MJEntityFormOverrideEntity>(
        "MJ: Entity Form Overrides", user,
    );
    override.NewRecord();
    override.EntityID = entityID;
    override.ComponentID = componentID;
    override.Name = name;
    override.Description = description;
    // Notes is the column added in V202605221100 (Notes-column fold-in).
    // Cast — the generated type may or may not yet expose it depending on
    // codegen freshness; the field exists in the DB regardless.
    (override as unknown as { Notes?: string | null }).Notes = notes ?? null;
    override.Scope = "User";
    override.UserID = user.ID;
    override.RoleID = null;
    override.Priority = priority ?? 0;
    override.Status = status;
    const saved = await override.Save();
    if (!saved) {
        return { error: failure(
            "PERSIST_FAILED",
            `Override insert failed: ${override.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: override.ID };
}

/**
 * Discrete intent for how the next version should be derived. Callers
 * (Modify Interactive Form) accept this as an explicit input parameter so
 * the agent can express defect-vs-feature-vs-rewrite intent rather than
 * inferring it from the source row's status.
 */
export type VersionBumpKind = 'in-place' | 'patch' | 'minor' | 'major';

function parseSemver(current: string | null | undefined): { major: number; minor: number; patch: number } {
    if (!current) return { major: 1, minor: 0, patch: 0 };
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(current.trim());
    if (!m) return { major: 1, minor: 0, patch: 0 };
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: m[3] ? Number(m[3]) : 0,
    };
}

/**
 * "1.0.0" → "1.0.1", "1.7.3" → "1.7.4". Used for small/defect-style edits
 * that deserve a rollback checkpoint but aren't a meaningful UX change.
 */
export function bumpPatchVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/**
 * Compute the next semver-minor bump for an existing version string.
 * "1.0.0" → "1.1.0", "1.7.3" → "1.8.0". Used for feature additions —
 * new fields, sections, charts, tabs.
 */
export function bumpMinorVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major}.${v.minor + 1}.0`;
}

/**
 * "1.7.3" → "2.0.0", "3.4.5" → "4.0.0". Used for radical redesigns or
 * when the user explicitly asks for a new major version.
 */
export function bumpMajorVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major + 1}.0.0`;
}

/**
 * Dispatch a version bump based on the caller's stated intent.
 * `'in-place'` returns the same version unchanged — caller should branch
 * separately (no new Component row is written).
 */
export function bumpVersion(current: string | null | undefined, kind: VersionBumpKind): string {
    switch (kind) {
        case 'patch': return bumpPatchVersion(current);
        case 'minor': return bumpMinorVersion(current);
        case 'major': return bumpMajorVersion(current);
        case 'in-place': return current ?? '1.0.0';
    }
}

/**
 * Parse and normalize a VersionBumpKind value from a string. Accepts the
 * canonical lowercase forms plus a few common phrasings. Returns null if
 * the input doesn't map to a known kind, so callers can decide whether
 * to default or reject.
 */
export function parseVersionBumpKind(raw: unknown): VersionBumpKind | null {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s === 'in-place' || s === 'inplace' || s === 'in_place') return 'in-place';
    if (s === 'patch') return 'patch';
    if (s === 'minor') return 'minor';
    if (s === 'major') return 'major';
    return null;
}

// ── form contribution helpers ────────────────────────────────────────────

/**
 * Permitted character set for a contribution key.
 *
 * Keys are compared in SQL filters and matched by `MJ: Form Chrome Rules`, and they
 * arrive from an LLM. Constraining the character set is stronger than escaping at each
 * call site: a key that cannot contain a quote cannot break a filter, and a rejected
 * key is a clear action failure rather than a subtly malformed query.
 *
 * The space is permitted because a derived related-grid key embeds an entity name, and
 * MJ entity names contain spaces by convention (`MJ_BizApps_Orders: Event Order Lines`).
 * A set without it rejects every derived key. Spaces are not what breaks a SQL string
 * literal; quotes and control characters are, and neither is in the set.
 */
export const CONTRIBUTION_KEY_PATTERN = /^[A-Za-z0-9:._ -]{1,256}$/;

/**
 * Strips one wrapping `[...]` pair from a join field.
 *
 * Byte-identical to `StripJoinFieldBrackets` in `@memberjunction/ng-base-forms`. It is
 * duplicated rather than imported because an Actions package must not depend on Angular.
 * Both sides must derive the same key or a persisted key stops matching the one the
 * renderer computes, and the two contributions never collapse.
 */
function stripJoinFieldBrackets(joinField: string | null | undefined): string {
    return (joinField ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
}

/**
 * The key a row will actually carry.
 *
 * Every contribution gets one. The key is the contribution's identity: the duplicate
 * check tests it, the rail builds an item per key, and "replace an installed panel"
 * names one. A row without a key is invisible to all three, so the same panel can be
 * applied twice and neither copy can be targeted afterwards.
 *
 * Three sources, in order. An author-supplied key wins. A related-grid claim derives
 * `related:<entity>:<join>`, byte-identical to `RelatedContributionKey` in
 * `@memberjunction/ng-base-forms`, so the renderer computes the same string. Anything
 * else derives from the component name, which is stable across re-applies of the same
 * panel and distinct between different ones.
 */
export function ResolveWriteContributionKey(
    contribution: FormContributionSpec,
    relatedEntityName: string | null,
    componentName?: string | null,
): string | null {
    if (contribution.contributionKey) return contribution.contributionKey;
    if (relatedEntityName) {
        return `related:${relatedEntityName.trim()}:${stripJoinFieldBrackets(contribution.relatedJoinField)}`;
    }
    return PanelContributionKey(componentName);
}

/**
 * `panel:<component name>`, with characters {@link CONTRIBUTION_KEY_PATTERN} rejects
 * folded to `-`. Null when the name carries nothing usable.
 */
/**
 * Field names as the `ReplacesFieldNames` column stores them: a JSON array, or null.
 *
 * The same shape as `FormChromeRule.JoinFields`. Null for an empty list, because a claim
 * that names no field is one the runtime can never match — the column's CHECK constraint
 * refuses an empty array for the same reason.
 */
export function SerializeClaimedFieldNames(names: readonly string[] | undefined): string | null {
    const cleaned: string[] = [];
    for (const raw of names ?? []) {
        const name = typeof raw === 'string' ? raw.trim() : '';
        if (name.length > 0 && !cleaned.includes(name)) cleaned.push(name);
    }
    return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

/**
 * Writes the section claims of a spec onto a row: the sections it stands in for, and the
 * section it is placed in with its position there.
 *
 * One section is stored in `ReplacesSectionKey` whichever field the spec used, so a single
 * block has one representation. A position is kept only for a panel drawn inside a section,
 * which is the only case it means anything and the only case the column's CHECK allows.
 */
export function ApplySectionClaims(
    row: Pick<MJEntityFormContributionEntity, 'ReplacesSectionKey' | 'ReplacesSectionKeys' | 'InSectionKey' | 'SectionPosition'>,
    contribution: Pick<FormContributionSpec, 'replacesSectionKey' | 'replacesSectionKeys' | 'replacesFieldNames' | 'inSectionKey' | 'sectionPosition'>,
): void {
    const sections = ParseClaimedFieldNames(SerializeClaimedFieldNames([
        ...(contribution.replacesSectionKey ? [contribution.replacesSectionKey] : []),
        ...(contribution.replacesSectionKeys ?? []),
    ]));
    row.ReplacesSectionKey = sections.length === 1 ? sections[0] : null;
    row.ReplacesSectionKeys = sections.length > 1 ? JSON.stringify(sections) : null;
    const inSection = contribution.inSectionKey?.trim() || null;
    row.InSectionKey = inSection;
    const drawsInSection = !!inSection || (contribution.replacesFieldNames ?? []).some((n) => n.trim().length > 0);
    row.SectionPosition = drawsInSection ? (contribution.sectionPosition ?? null) : null;
}

/** The field names in a `ReplacesFieldNames` cell. Inverse of {@link SerializeClaimedFieldNames}. */
export function ParseClaimedFieldNames(raw: string | null | undefined): string[] {
    if (!raw || raw.trim().length === 0) return [];
    const parsed = SafeJSONParse<string[]>(raw, false);
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
        const name = typeof item === 'string' ? item.trim() : '';
        if (name.length > 0 && !out.includes(name)) out.push(name);
    }
    return out;
}

export function PanelContributionKey(componentName: string | null | undefined): string | null {
    const slug = (componentName ?? '')
        .trim()
        .replace(/[^A-Za-z0-9._ -]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 240)
        .trim();
    return slug ? `panel:${slug}` : null;
}

/**
 * Insert a new EntityFormContribution row. Always User-scoped — promotion to Role or
 * Global is a deliberate human act, not something an agent write path can reach.
 */
export async function insertContribution(opts: {
    provider: IMetadataProvider;
    user: UserInfo;
    entityID: string;
    componentID: string;
    name: string;
    description: string | null;
    notes?: string | null;
    contribution: FormContributionSpec;
    /** Resolved related entity — `Name` for the derived key, `ID` for the column. */
    relatedEntityName: string | null;
    relatedEntityID: string | null;
    /** Seeds the contribution key when the spec names none and nothing is claimed. */
    componentName?: string | null;
    status: 'Active' | 'Pending';
    precedence: number;
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const {
        provider, user, entityID, componentID, name, description, notes,
        contribution, relatedEntityName, relatedEntityID, status, precedence,
    } = opts;
    const row = await provider.GetEntityObject<MJEntityFormContributionEntity>(
        "MJ: Entity Form Contributions", user,
    );
    row.NewRecord();
    row.EntityID = entityID;
    row.ComponentID = componentID;
    row.Name = name;
    row.Description = description;
    row.Notes = notes ?? null;
    row.Slot = contribution.slot;
    row.SortKey = contribution.sortKey ?? 0;
    // Derive and persist. A related claim with no author-supplied key resolves to
    // `related:<entity>:<join>` at render time, but a NULL column is invisible to the
    // ContributionKey unique index, so two Active rows could otherwise claim the same
    // grid and the winner would be decided by row order.
    row.ContributionKey = ResolveWriteContributionKey(contribution, relatedEntityName, opts.componentName);
    row.RelatedEntityID = relatedEntityID;
    row.RelatedJoinField = contribution.relatedJoinField ?? null;
    row.ReplacesFieldNames = SerializeClaimedFieldNames(contribution.replacesFieldNames);
    ApplySectionClaims(row, contribution);
    row.Inclusion = contribution.inclusion ?? null;
    row.ChromeGroup = contribution.chromeGroup ?? null;
    row.Presentation = contribution.presentation;
    row.Title = contribution.title;
    row.Icon = contribution.icon ?? null;
    row.Configuration = contribution.configuration && Object.keys(contribution.configuration).length > 0
        ? JSON.stringify(contribution.configuration) : null;
    // Security clamp: agents write User scope only. Promotion is a human act.
    row.Scope = "User";
    row.UserID = user.ID;
    row.RoleID = null;
    row.Precedence = precedence;
    row.Status = status;
    const saved = await row.Save();
    if (!saved) {
        return { error: failure(
            "PERSIST_FAILED",
            `Contribution insert failed: ${row.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: row.ID };
}
