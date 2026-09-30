/**
 * Shared helpers for the Interactive Forms action family. These all touch
 * the same two entities (`MJ: Components`, `MJ: Entity Form Overrides`),
 * lint the same spec shape, and need the same parameter conventions —
 * extracting here keeps each action thin.
 */
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { IMetadataProvider, UserInfo } from "@memberjunction/core";
import { EscapeSQLString, UUIDsEqual } from "@memberjunction/global";
import {
    ApplyContributionSpecToRow,
    MJComponentEntity,
    MJEntityFormContributionEntity,
    MJEntityFormOverrideEntity,
} from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import {
    CONTRIBUTION_KEY_PATTERN,
    GetDeclaredFormContribution,
    IsFormPanelRole,
    isFormRole,
    ResolveContributionWriteKey,
    type NormalizedFormContributionSpec,
} from "@memberjunction/interactive-component-types/forms";
import { ComponentLinter } from "@memberjunction/react-linter";

// ── parameter helpers ────────────────────────────────────────────────────

export function GetParam(params: RunActionParams, name: string): unknown {
    const p = params.Params.find(x =>
        x.Name?.trim().toLowerCase() === name.toLowerCase());
    return p?.Value;
}

/** @deprecated Use {@link GetParam}. */
export function getParam(params: RunActionParams, name: string): unknown {
    return GetParam(params, name);
}

export function GetStringParam(params: RunActionParams, name: string): string | null {
    const v = GetParam(params, name);
    if (v == null) return null;
    const s = String(v).trim();
    return s.length > 0 ? s : null;
}

/** @deprecated Use {@link GetStringParam}. */
export function getStringParam(params: RunActionParams, name: string): string | null {
    return GetStringParam(params, name);
}

export function GetNumberParam(params: RunActionParams, name: string): number | null {
    const v = GetParam(params, name);
    if (v == null) return null;
    const n = typeof v === 'number' ? v : Number(String(v));
    return Number.isFinite(n) ? n : null;
}

/** @deprecated Use {@link GetNumberParam}. */
export function getNumberParam(params: RunActionParams, name: string): number | null {
    return GetNumberParam(params, name);
}

export function AddOutput(params: RunActionParams, name: string, value: unknown): void {
    params.Params.push({ Name: name, Type: "Output", Value: value });
}

/** @deprecated Use {@link AddOutput}. */
export function addOutput(params: RunActionParams, name: string, value: unknown): void {
    return AddOutput(params, name, value);
}

// ── result helpers ───────────────────────────────────────────────────────

export function Failure(resultCode: string, message: string): ActionResultSimple {
    return { Success: false, ResultCode: resultCode, Message: message };
}

/** @deprecated Use {@link Failure}. */
export function failure(resultCode: string, message: string): ActionResultSimple {
    return Failure(resultCode, message);
}

export function Success(message: string): ActionResultSimple {
    return { Success: true, ResultCode: "SUCCESS", Message: message };
}

/** @deprecated Use {@link Success}. */
export function success(message: string): ActionResultSimple {
    return Success(message);
}

// ── spec parsing + linting ───────────────────────────────────────────────

/** Parse a Spec param that may arrive as object or stringified JSON. */
export function ParseSpecParam(raw: unknown): ComponentSpec | { error: string } {
    try {
        if (typeof raw === "string") {
            return JSON.parse(raw) as ComponentSpec;
        }
        return raw as ComponentSpec;
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}

/** @deprecated Use {@link ParseSpecParam}. */
export function parseSpecParam(raw: unknown): ComponentSpec | { error: string } {
    return ParseSpecParam(raw);
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
        return Failure(
            "LINT_FAILED",
            `Spec must declare componentRole='${roleLabel}'. Got '${spec.componentRole ?? "(unset)"}'. The InteractiveForm runtime refuses to mount any other role.`,
        );
    }
    if (!spec.name || spec.name.trim().length === 0) {
        return Failure("LINT_FAILED", "Spec.name is required.");
    }
    if (typeof spec.code !== "string" || spec.code.trim().length === 0) {
        return Failure("LINT_FAILED", "Spec.code must be a non-empty JSX string.");
    }
    if (!spec.location) {
        return Failure(
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
            return Failure(
                "LINT_FAILED",
                `Spec code failed linting:\n${messages}${blocking.length > 5 ? `\n  (+${blocking.length - 5} more)` : ""}`,
            );
        }
    } catch (err) {
        return Failure(
            "LINT_FAILED",
            `Linter could not parse spec code: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    return null;
}

/** Lint a whole-form spec — `componentRole: 'form'`. */
export async function LintFormSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, isFormRole, 'form');
}

/** Lint a form-panel spec — `componentRole: 'form-panel'`. Same rules as {@link LintFormSpec}. */
export async function LintFormPanelSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return lintRoleSpec(spec, contextUser, IsFormPanelRole, 'form-panel');
}

/** @deprecated Use {@link LintFormSpec}. */
export async function lintFormSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    return LintFormSpec(spec, contextUser);
}

// ── component / override fetch + write helpers ───────────────────────────

/** Load a Component entity object by primary key. */
export async function LoadComponent(
    provider: IMetadataProvider, user: UserInfo, componentID: string,
): Promise<MJComponentEntity | null> {
    const c = await provider.GetEntityObject<MJComponentEntity>("MJ: Components", user);
    const loaded = await c.Load(componentID);
    return loaded ? c : null;
}

/** @deprecated Use {@link LoadComponent}. */
export async function loadComponent(
    provider: IMetadataProvider, user: UserInfo, componentID: string,
): Promise<MJComponentEntity | null> {
    return LoadComponent(provider, user, componentID);
}

/** Load an Override entity object by primary key. */
export async function LoadOverride(
    provider: IMetadataProvider, user: UserInfo, overrideID: string,
): Promise<MJEntityFormOverrideEntity | null> {
    const o = await provider.GetEntityObject<MJEntityFormOverrideEntity>("MJ: Entity Form Overrides", user);
    const loaded = await o.Load(overrideID);
    return loaded ? o : null;
}

/** @deprecated Use {@link LoadOverride}. */
export async function loadOverride(
    provider: IMetadataProvider, user: UserInfo, overrideID: string,
): Promise<MJEntityFormOverrideEntity | null> {
    return LoadOverride(provider, user, overrideID);
}

/** Load a Contribution entity object by primary key. */
export async function LoadContribution(
    provider: IMetadataProvider, user: UserInfo, contributionID: string,
): Promise<MJEntityFormContributionEntity | null> {
    const c = await provider.GetEntityObject<MJEntityFormContributionEntity>("MJ: Entity Form Contributions", user);
    const loaded = await c.Load(contributionID);
    return loaded ? c : null;
}

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

/** Row shape both override and contribution ownership checks read. */
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
export function CheckScopedOwnership(row: ScopedRow, user: UserInfo, label: string): ActionResultSimple | null {
    switch (row.Scope) {
        case 'User': {
            if (!UUIDsEqual(row.UserID, user.ID)) {
                return Failure(
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
                return Failure(
                    "FORBIDDEN",
                    `${label} ${row.ID} is Role-scoped (${row.RoleID}). Only members of that role can mutate it.`,
                );
            }
            return null;
        }
        case 'Global': {
            const isOwner = ((user as { Type?: string }).Type ?? '').toLowerCase() === 'owner';
            if (!isOwner) {
                return Failure(
                    "FORBIDDEN",
                    `${label} ${row.ID} is Global. Only Owner-type users can mutate Global rows; promote / demote them via Component Studio with appropriate privileges.`,
                );
            }
            return null;
        }
        default:
            return Failure(
                "FORBIDDEN",
                `${label} ${row.ID} has an unrecognized Scope ('${row.Scope}').`,
            );
    }
}

/** Ownership check for the override-mutation actions (Modify / Activate / Revert). */
export function CheckOverrideOwnership(
    override: Pick<MJEntityFormOverrideEntity, 'ID' | 'Scope' | 'UserID' | 'RoleID'>,
    user: UserInfo,
): ActionResultSimple | null {
    return CheckScopedOwnership(override, user, 'Override');
}

/** @deprecated Use {@link CheckOverrideOwnership}. */
export function checkOverrideOwnership(
    override: Pick<MJEntityFormOverrideEntity, 'ID' | 'Scope' | 'UserID' | 'RoleID'>,
    user: UserInfo,
): ActionResultSimple | null {
    return CheckOverrideOwnership(override, user);
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
export function MapToComponentStatus(lifecycle: FormLifecycle): 'Published' | 'Draft' | 'Deprecated' {
    switch (lifecycle) {
        case 'Active':   return 'Published';
        case 'Pending':  return 'Draft';
        case 'Inactive': return 'Deprecated';
    }
}

/** @deprecated Use {@link MapToComponentStatus}. */
export function mapToComponentStatus(lifecycle: FormLifecycle): 'Published' | 'Draft' | 'Deprecated' {
    return MapToComponentStatus(lifecycle);
}
export function MapFromComponentStatus(status: string | null | undefined): FormLifecycle {
    switch ((status ?? '').toLowerCase()) {
        case 'published': return 'Active';
        case 'draft':     return 'Pending';
        case 'deprecated': return 'Inactive';
        default:          return 'Inactive';   // unknown values treated as terminal
    }
}

/** @deprecated Use {@link MapFromComponentStatus}. */
export function mapFromComponentStatus(status: string | null | undefined): FormLifecycle {
    return MapFromComponentStatus(status);
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
export async function InsertComponent(opts: {
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
    component.Status = MapToComponentStatus(componentStatus);
    component.Version = version;
    component.VersionSequence = versionSequence;
    component.Specification = JSON.stringify(spec);
    component.DeveloperName = user.Name ?? null;
    const saved = await component.Save();
    if (!saved) {
        return { error: Failure(
            "PERSIST_FAILED",
            `Component insert failed: ${component.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: component.ID };
}

/** @deprecated Use {@link InsertComponent}. */
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
    return InsertComponent(opts);
}

/**
 * Insert a new EntityFormOverride row. Always User-scoped (security clamp)
 * unless `allowGlobalOrRole` is explicitly true — which is reserved for the
 * future "promote variant" UI path, not the agent.
 */
export async function InsertOverride(opts: {
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
        return { error: Failure(
            "PERSIST_FAILED",
            `Override insert failed: ${override.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: override.ID };
}

/** @deprecated Use {@link InsertOverride}. */
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
    return InsertOverride(opts);
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
export function BumpPatchVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major}.${v.minor}.${v.patch + 1}`;
}

/** @deprecated Use {@link BumpPatchVersion}. */
export function bumpPatchVersion(current: string | null | undefined): string {
    return BumpPatchVersion(current);
}

/**
 * Compute the next semver-minor bump for an existing version string.
 * "1.0.0" → "1.1.0", "1.7.3" → "1.8.0". Used for feature additions —
 * new fields, sections, charts, tabs.
 */
export function BumpMinorVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major}.${v.minor + 1}.0`;
}

/** @deprecated Use {@link BumpMinorVersion}. */
export function bumpMinorVersion(current: string | null | undefined): string {
    return BumpMinorVersion(current);
}

/**
 * "1.7.3" → "2.0.0", "3.4.5" → "4.0.0". Used for radical redesigns or
 * when the user explicitly asks for a new major version.
 */
export function BumpMajorVersion(current: string | null | undefined): string {
    const v = parseSemver(current);
    return `${v.major + 1}.0.0`;
}

/** @deprecated Use {@link BumpMajorVersion}. */
export function bumpMajorVersion(current: string | null | undefined): string {
    return BumpMajorVersion(current);
}

/**
 * Dispatch a version bump based on the caller's stated intent.
 * `'in-place'` returns the same version unchanged — caller should branch
 * separately (no new Component row is written).
 */
export function BumpVersion(current: string | null | undefined, kind: VersionBumpKind): string {
    switch (kind) {
        case 'patch': return BumpPatchVersion(current);
        case 'minor': return BumpMinorVersion(current);
        case 'major': return BumpMajorVersion(current);
        case 'in-place': return current ?? '1.0.0';
    }
}

/** @deprecated Use {@link BumpVersion}. */
export function bumpVersion(current: string | null | undefined, kind: VersionBumpKind): string {
    return BumpVersion(current, kind);
}

/**
 * Parse and normalize a VersionBumpKind value from a string. Accepts the
 * canonical lowercase forms plus a few common phrasings. Returns null if
 * the input doesn't map to a known kind, so callers can decide whether
 * to default or reject.
 */
export function ParseVersionBumpKind(raw: unknown): VersionBumpKind | null {
    if (raw == null) return null;
    const s = String(raw).trim().toLowerCase();
    if (!s) return null;
    if (s === 'in-place' || s === 'inplace' || s === 'in_place') return 'in-place';
    if (s === 'patch') return 'patch';
    if (s === 'minor') return 'minor';
    if (s === 'major') return 'major';
    return null;
}

/** @deprecated Use {@link ParseVersionBumpKind}. */
export function parseVersionBumpKind(raw: unknown): VersionBumpKind | null {
    return ParseVersionBumpKind(raw);
}

// ── form contribution helpers ────────────────────────────────────────────

/**
 * A form-panel spec's registration intent, with its related entity resolved and the key its
 * row will carry derived and checked.
 */
export interface ContributionRegistration {
    Contribution: NormalizedFormContributionSpec;
    /** What {@link ApplyContributionSpecToRow} needs beyond the spec. */
    RowOptions: Parameters<typeof ApplyContributionSpecToRow>[2];
    /** The key the row will carry, or null when nothing supplies one. */
    WriteKey: string | null;
}

/**
 * Reads the `formContribution` block of a linted form-panel spec, resolves the related entity it
 * claims to its registered name and ID, and derives the row's key with
 * `ResolveContributionWriteKey`.
 *
 * Fails with `LINT_FAILED` when the block cannot be read, `RELATED_ENTITY_NOT_FOUND` when the
 * related entity is not registered, and `INVALID_CONTRIBUTION_KEY` when the key does not match
 * `CONTRIBUTION_KEY_PATTERN`.
 *
 * @param componentName The component name that seeds the key of a panel with no other key.
 */
export function ResolveContributionRegistration(
    provider: IMetadataProvider,
    spec: ComponentSpec,
    componentName: string | null,
): ContributionRegistration | { error: ActionResultSimple } {
    const contribution = GetDeclaredFormContribution(spec);
    if (!contribution) return { error: Failure("LINT_FAILED", "Spec.formContribution could not be read.") };

    let relatedEntityID: string | null = null;
    if (contribution.relatedEntity) {
        const related = provider.EntityByName(contribution.relatedEntity);
        if (!related) {
            return { error: Failure("RELATED_ENTITY_NOT_FOUND",
                `Related entity '${contribution.relatedEntity}' is not registered.`) };
        }
        relatedEntityID = related.ID;
        // The registered casing keeps the derived key stable.
        contribution.relatedEntity = related.Name;
    }

    const relatedEntityName = contribution.relatedEntity ?? null;
    const writeKey = ResolveContributionWriteKey(contribution, relatedEntityName, componentName);
    if (writeKey && !CONTRIBUTION_KEY_PATTERN.test(writeKey)) {
        return { error: Failure("INVALID_CONTRIBUTION_KEY",
            `Contribution key '${writeKey}' must match ${CONTRIBUTION_KEY_PATTERN.source}.`) };
    }
    return {
        Contribution: contribution,
        RowOptions: { relatedEntityID, relatedEntityName, componentName },
        WriteKey: writeKey,
    };
}

/**
 * Insert a new EntityFormContribution row. Always User-scoped — promotion to Role or
 * Global is a deliberate human act, not something an agent write path can reach.
 */
export async function InsertContribution(opts: {
    provider: IMetadataProvider;
    user: UserInfo;
    entityID: string;
    componentID: string;
    name: string;
    description: string | null;
    notes?: string | null;
    registration: ContributionRegistration;
    status: 'Active' | 'Pending';
    precedence: number;
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const { provider, user, entityID, componentID, name, description, notes, registration, status, precedence } = opts;
    const row = await provider.GetEntityObject<MJEntityFormContributionEntity>(
        "MJ: Entity Form Contributions", user,
    );
    row.NewRecord();
    row.EntityID = entityID;
    row.ComponentID = componentID;
    row.Name = name;
    row.Description = description;
    row.Notes = notes ?? null;
    ApplyContributionSpecToRow(row, registration.Contribution, registration.RowOptions);
    // Security clamp: agents write User scope only. Promotion is a human act.
    row.Scope = "User";
    row.UserID = user.ID;
    row.RoleID = null;
    row.Precedence = precedence;
    row.Status = status;
    const saved = await row.Save();
    if (!saved) {
        return { error: Failure(
            "PERSIST_FAILED",
            `Contribution insert failed: ${row.LatestResult?.CompleteMessage ?? "unknown error"}`,
        ) };
    }
    return { id: row.ID };
}
