/**
 * Shared helpers for the Interactive Forms action family. These all touch
 * the same two entities (`MJ: Components`, `MJ: Entity Form Overrides`),
 * lint the same spec shape, and need the same parameter conventions —
 * extracting here keeps each action thin.
 */
import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { IMetadataProvider, UserInfo } from "@memberjunction/core";
import {
    MJComponentEntity,
    MJEntityFormOverrideEntity,
} from "@memberjunction/core-entities";
import type { ComponentSpec } from "@memberjunction/interactive-component-types";
import { isFormRole } from "@memberjunction/interactive-component-types/forms";
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
 * Lint a form-role ComponentSpec. Returns null on success, a fail-fast
 * ActionResultSimple on failure. Two rules are suppressed for form-role
 * specs (component-props-validation, callback-event-validation) — see
 * lint comments in the original create-interactive-form action for the
 * rationale.
 */
export async function lintFormSpec(spec: ComponentSpec, contextUser: UserInfo): Promise<ActionResultSimple | null> {
    if (!isFormRole(spec)) {
        return failure(
            "LINT_FAILED",
            `Spec must declare componentRole='form'. Got '${spec.componentRole ?? "(unset)"}'. The InteractiveForm runtime refuses to mount any other role.`,
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

    const FORM_ROLE_SUPPRESSED_RULES = new Set([
        "component-props-validation",
        "callback-event-validation",
    ]);
    try {
        const result = await ComponentLinter.lintComponent(
            spec.code, spec.name, spec, true, contextUser,
        );
        const blocking = (result.violations ?? []).filter(v => {
            const isBlocking = v.severity === "critical" || v.severity === "high";
            if (!isBlocking) return false;
            if (v.rule && FORM_ROLE_SUPPRESSED_RULES.has(v.rule)) return false;
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
}): Promise<{ id: string } | { error: ActionResultSimple }> {
    const { provider, user, spec, fallbackName, description, version, versionSequence, componentStatus } = opts;
    const component = await provider.GetEntityObject<MJComponentEntity>("MJ: Components", user);
    component.NewRecord();
    component.Name = spec.name ?? fallbackName;
    component.Title = spec.title ?? fallbackName;
    component.Description = description ?? spec.description ?? null;
    component.Type = "Form";
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
 * Compute the next semver-minor bump for an existing version string.
 * "1.0.0" → "1.1.0", "1.7.3" → "1.8.0", "2.0" → "2.1.0", unparseable → "1.1.0".
 * We always bump the minor, never patch — these are visible AI-author-cycle
 * iterations, not internal hotfixes.
 */
export function bumpMinorVersion(current: string | null | undefined): string {
    if (!current) return "1.1.0";
    const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec(current.trim());
    if (!m) return "1.1.0";
    const major = Number(m[1]);
    const minor = Number(m[2]);
    return `${major}.${minor + 1}.0`;
}
