/**
 * @fileoverview Shared rebase-aware `BaseAgentID` cascade folding and narrow-only constraint
 * helpers for `IAgentConfiguration`, `EffectiveAgentProperties`, and save-time validation.
 *
 * Consumed by BOTH `@memberjunction/ai-engine-base` (`BaseAIEngine`) and
 * `@memberjunction/core-entities-server` (`MJAIAgentEntityServer`) so save-time validation and
 * runtime resolution share a single source of truth with zero split-brain drift.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { MJAIAgentEntity } from '@memberjunction/core-entities';
import { IsPlainObject } from '@memberjunction/global';
import { ParseAgentConfiguration } from './agent-configuration';
import type { IAgentConfiguration } from './JSONType-interfaces/IAgentConfiguration';

// ============================================================================
// Security & Monotonic Ordering Ranks
// ============================================================================

/** Strictness rank for `Isolation` (`InProcess < Worker < Process < Container`). NEVER loosened, even with `allowWidenFromBase`. */
export const AGENT_ISOLATION_RANK: Readonly<Record<MJAIAgentEntity['Isolation'], number>> = {
    InProcess: 0,
    Worker: 1,
    Process: 2,
    Container: 3,
};

/** Permissiveness rank for `SearchScopeAccess` (`None < Assigned < All`). */
export const AGENT_SEARCH_SCOPE_ACCESS_RANK: Readonly<Record<MJAIAgentEntity['SearchScopeAccess'], number>> = {
    None: 0,
    Assigned: 1,
    All: 2,
};

/** Permissiveness rank for `AcceptsSkills` (`None < Limited < All`). */
export const AGENT_ACCEPTS_SKILLS_RANK: Readonly<Record<MJAIAgentEntity['AcceptsSkills'], number>> = {
    None: 0,
    Limited: 1,
    All: 2,
};

/** Permissiveness rank for `SkillActivationMode` (`RequestedOnly < Auto`). */
export const AGENT_SKILL_ACTIVATION_RANK: Readonly<Record<MJAIAgentEntity['SkillActivationMode'], number>> = {
    RequestedOnly: 0,
    Auto: 1,
};

/** Permissiveness rank for `ArtifactCreationMode` (`Never < System Only < Always`). */
export const AGENT_ARTIFACT_CREATION_MODE_RANK: Readonly<Record<MJAIAgentEntity['ArtifactCreationMode'], number>> = {
    Never: 0,
    'System Only': 1,
    Always: 2,
};

/** Permissiveness rank for `MessageMode` (`None < Latest < Bookend < All`). */
export const AGENT_MESSAGE_MODE_RANK: Readonly<Record<MJAIAgentEntity['MessageMode'], number>> = {
    None: 0,
    Latest: 1,
    Bookend: 2,
    All: 3,
};

/** Permissiveness rank for `StartingPayloadValidationMode` (`Fail < Warn`). */
export const AGENT_STARTING_VALIDATION_MODE_RANK: Readonly<Record<MJAIAgentEntity['StartingPayloadValidationMode'], number>> = {
    Fail: 0,
    Warn: 1,
};

/** Permissiveness rank for `FinalPayloadValidationMode` (`Fail < Retry < Warn`). */
export const AGENT_FINAL_VALIDATION_MODE_RANK: Readonly<Record<MJAIAgentEntity['FinalPayloadValidationMode'], number>> = {
    Fail: 0,
    Retry: 1,
    Warn: 2,
};

/** Prompt-param boolean feature gates that cannot flip `false -> true` down `BaseAgentID` without `allowWidenFromBase: true`. */
export const NARROW_ONLY_PROMPT_PARAM_GATES: ReadonlyArray<'enableHandoff' | 'enableTaskGraphs'> = [
    'enableHandoff',
    'enableTaskGraphs',
];

// ============================================================================
// Rebase-Aware Chain Fold
// ============================================================================

/**
 * Returns `true` when an `IAgentConfiguration` (object or raw JSON string) explicitly opts in to
 * `allowWidenFromBase: true`.
 */
export function DoesAgentAllowWidenFromBase(
    configuration: IAgentConfiguration | string | null | undefined
): boolean {
    if (!configuration) {
        return false;
    }
    const parsed =
        typeof configuration === 'string' ? ParseAgentConfiguration(configuration) : configuration;
    return parsed?.allowWidenFromBase === true;
}

/**
 * Checks whether a raw `Configuration` JSON string contains the explicit own property
 * `allowWidenFromBase` (regardless of value — including `false` or `null` — used to block
 * non-admins from setting, modifying, or clearing the key).
 */
export function JsonHasAllowWidenFromBaseKey(raw: string | null | undefined): boolean {
    if (!raw || raw.trim().length === 0) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return Boolean(
            IsPlainObject(parsed) &&
            Object.prototype.hasOwnProperty.call(parsed, 'allowWidenFromBase')
        );
    } catch {
        return false;
    }
}

/**
 * Reusable rebase-aware fold across an ordered agent inheritance chain `[nodes[0], ..., nodes[n-1]]`
 * (root -> leaf).
 *
 * - `seed` is the initial baseline (e.g., folded from `orderedDefaultLayers` + `nodes[0]`).
 * - At each derived hop `i >= 1`:
 *   - `getValue(nodes[i], nodeConfigs[i], i)` returns the explicit value at node `i`, or `undefined`
 *     when node `i` left the field unset (inherits `acc` unchanged).
 *   - If `canWidenAt(i)` (`nodeConfigs[i]?.allowWidenFromBase === true`): `acc = rebase(acc, value)`
 *     (defaults to replacing `acc` with `value`, establishing a new ceiling baseline for `i` and
 *     its downstream descendants!).
 *   - Otherwise: `acc = narrow(acc, value)`.
 */
export function FoldRebaseAwareChain<TNode, TVal>(args: {
    Nodes: ReadonlyArray<TNode>;
    NodeConfigs: ReadonlyArray<IAgentConfiguration | null>;
    Seed: TVal;
    GetNodeValue: (node: TNode, config: IAgentConfiguration | null, index: number) => TVal | undefined;
    Narrow: (acc: TVal, next: TVal) => TVal;
    Rebase?: (acc: TVal, next: TVal) => TVal;
    StartIndex?: number;
}): TVal {
    const { Nodes, NodeConfigs, GetNodeValue, Narrow, Rebase } = args;
    const startIndex = args.StartIndex ?? 1;
    let acc = args.Seed;
    for (let i = startIndex; i < Nodes.length; i++) {
        const value = GetNodeValue(Nodes[i], NodeConfigs[i] ?? null, i);
        if (value === undefined) {
            continue;
        }
        const canWiden = i > 0 && NodeConfigs[i]?.allowWidenFromBase === true;
        acc = canWiden ? (Rebase ? Rebase(acc, value) : value) : Narrow(acc, value);
    }
    return acc;
}

// ============================================================================
// Payload Path Glob-Set Intersection & Subsumption
// ============================================================================

/**
 * Returns `true` when `paths` represents the unrestricted top element (`null` or containing `*` / `**`).
 */
export function IsTopPayloadPathSet(paths: readonly string[] | null | undefined): boolean {
    if (paths === null || paths === undefined) {
        return true;
    }
    return paths.some((p) => {
        const trimmed = p.trim();
        return trimmed === '*' || trimmed === '**';
    });
}

function splitPathSegments(pattern: string): string[] {
    return pattern
        .trim()
        .replace(/^\/+|\/+$/g, '')
        .split('.')
        .filter((s) => s.length > 0);
}

/**
 * Returns `true` when glob pattern `broad` subsumes (covers every path matched by) `narrow`.
 * Supports `*` (wildcard tail or single segment), `**` (multi-segment wildcard), exact segment
 * matching, and array wildcard normalization (`items[*]` subsumes `items[0]`).
 */
export function PayloadPathPatternSubsumes(broad: string, narrow: string): boolean {
    const b = broad.trim();
    const n = narrow.trim();
    if (b === '*' || b === '**') {
        return true;
    }
    if (n === '*' || n === '**') {
        return false;
    }
    if (b === n) {
        return true;
    }

    const bSegs = splitPathSegments(b);
    const nSegs = splitPathSegments(n);

    const segmentSubsumes = (bSeg: string, nSeg: string): boolean => {
        if (bSeg === '*' || bSeg === '**') {
            return true;
        }
        if (bSeg === nSeg) {
            return true;
        }
        // Array wildcard: `items[*]` subsumes `items[0]`
        const bArr = bSeg.match(/^(.+)\[\*\]$/);
        const nArr = nSeg.match(/^(.+)\[([^\]]+)\]$/);
        if (bArr && nArr && bArr[1] === nArr[1]) {
            return true;
        }
        return false;
    };

    const matchFrom = (bi: number, ni: number): boolean => {
        if (bi === bSegs.length && ni === nSegs.length) {
            return true;
        }
        if (bi === bSegs.length) {
            return false;
        }
        const bSeg = bSegs[bi];
        // Trailing `.*` in PayloadManager matches everything under the prefix (any depth)
        if (bSeg === '*' && bi === bSegs.length - 1) {
            return ni <= nSegs.length;
        }
        if (bSeg === '**') {
            if (bi === bSegs.length - 1) {
                return true;
            }
            for (let skip = ni; skip <= nSegs.length; skip++) {
                if (matchFrom(bi + 1, skip)) {
                    return true;
                }
            }
            return false;
        }
        if (ni === nSegs.length) {
            return false;
        }
        if (!segmentSubsumes(bSeg, nSegs[ni])) {
            return false;
        }
        return matchFrom(bi + 1, ni + 1);
    };

    return matchFrom(0, 0);
}

/**
 * Intersects two payload path glob-sets (`ancestor ∩ child`).
 * - `null` or `['*']` is top (unrestricted).
 * - `[]` is bottom (deny all; preserved strictly).
 * - Returns concrete narrowed patterns preserving order and deduplicating exact matches.
 */
export function IntersectPayloadPathSets(
    ancestor: readonly string[] | null,
    child: readonly string[] | null
): string[] | null {
    const ancestorTop = IsTopPayloadPathSet(ancestor);
    const childTop = IsTopPayloadPathSet(child);

    if (ancestorTop && childTop) {
        if (ancestor === null && child === null) {
            return null;
        }
        return child !== null ? [...child] : ancestor !== null ? [...ancestor] : null;
    }
    if (ancestorTop) {
        return child === null ? null : [...child];
    }
    if (childTop) {
        return ancestor === null ? null : [...ancestor];
    }

    const ancList = ancestor!;
    const childList = child!;
    if (ancList.length === 0 || childList.length === 0) {
        return [];
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const add = (p: string): void => {
        const trimmed = p.trim();
        if (trimmed.length > 0 && !seen.has(trimmed)) {
            seen.add(trimmed);
            result.push(trimmed);
        }
    };

    for (const c of childList) {
        if (ancList.some((a) => PayloadPathPatternSubsumes(a, c))) {
            add(c);
        }
    }
    for (const a of ancList) {
        if (childList.some((c) => PayloadPathPatternSubsumes(c, a))) {
            add(a);
        }
    }
    return result;
}

/**
 * Save-time validation predicate: returns `true` when every path pattern in `child` is permitted
 * under `ancestor` (no widening).
 */
export function IsPayloadPathSetWithinAncestor(
    ancestor: readonly string[] | null,
    child: readonly string[] | null
): boolean {
    if (IsTopPayloadPathSet(ancestor)) {
        return true;
    }
    if (IsTopPayloadPathSet(child)) {
        return false;
    }
    const ancList = ancestor!;
    const childList = child!;
    if (childList.length === 0) {
        return true; // `[]` (deny all) is always a valid narrowing
    }
    if (ancList.length === 0) {
        return false; // ancestor is `[]` (bottom), child is non-empty -> widening
    }
    return childList.every((c) => ancList.some((a) => PayloadPathPatternSubsumes(a, c)));
}

// ============================================================================
// Subtree Prefix Locks: PayloadScope & AttachmentRootPath
// ============================================================================

/**
 * Returns `true` when `rawPath` contains a `..` traversal segment (slash, backslash, or dot-bounded).
 */
export function HasPathTraversalSegment(rawPath: string | null | undefined): boolean {
    if (!rawPath) {
        return false;
    }
    const normalized = rawPath.replace(/\\/g, '/').trim();
    if (normalized === '..') {
        return true;
    }
    const segments = normalized.split('/');
    return segments.some((seg) => seg.trim() === '..');
}

function normalizeScopeSegments(scope: string): string[] {
    const trimmed = scope.trim().replace(/\\/g, '/');
    const stripped = trimmed.replace(/^\/+|\/+$/g, '');
    if (stripped.length === 0) {
        return [];
    }
    return stripped.includes('/')
        ? stripped.split('/').filter((s) => s.length > 0)
        : stripped.split('.').filter((s) => s.length > 0);
}

/**
 * Returns `true` when `childScope` stays within `ancestorScope`'s subtree without `..` traversal.
 * - If `ancestorScope` is null/empty: valid as long as `childScope` has no `..`.
 * - If `ancestorScope` is set: `childScope` cannot clear to null/empty, cannot contain `..`, and
 *   its normalized segments must start with `ancestorScope`'s segments.
 */
export function IsPayloadScopeWithinAncestor(
    ancestorScope: string | null | undefined,
    childScope: string | null | undefined
): boolean {
    if (HasPathTraversalSegment(childScope)) {
        return false;
    }
    const ancTrimmed = ancestorScope?.trim() ?? '';
    if (ancTrimmed.length === 0) {
        return true;
    }
    const childTrimmed = childScope?.trim() ?? '';
    if (childTrimmed.length === 0) {
        return false;
    }
    const ancSegs = normalizeScopeSegments(ancTrimmed);
    const childSegs = normalizeScopeSegments(childTrimmed);
    if (childSegs.length < ancSegs.length) {
        return false;
    }
    for (let i = 0; i < ancSegs.length; i++) {
        if (childSegs[i] !== ancSegs[i]) {
            return false;
        }
    }
    return true;
}

/**
 * Narrows `PayloadScope` monotonically: accepts `childScope` only when it stays within
 * `ancestorScope` without `..` traversal; otherwise preserves `ancestorScope`.
 */
export function NarrowPayloadScope(
    ancestorScope: string | null,
    childScope: string | null
): string | null {
    if (HasPathTraversalSegment(childScope)) {
        return ancestorScope;
    }
    const ancTrimmed = ancestorScope?.trim() ?? '';
    const childTrimmed = childScope?.trim() ?? '';
    if (ancTrimmed.length === 0) {
        return childTrimmed.length > 0 ? childTrimmed : null;
    }
    if (childTrimmed.length === 0) {
        return ancestorScope;
    }
    return IsPayloadScopeWithinAncestor(ancestorScope, childScope) ? childTrimmed : ancestorScope;
}

function normalizePathSegments(p: string): string[] {
    return p
        .trim()
        .replace(/\\/g, '/')
        .replace(/^\/+|\/+$/g, '')
        .split('/')
        .filter((s) => s.length > 0);
}

/**
 * Returns `true` when `childRootPath` stays within `ancestorRootPath` (either sharing the exact
 * ancestor prefix or providing a clean relative sub-prefix when `ancestorRootPath` is absolute,
 * with zero `..` traversal segments).
 */
export function IsAttachmentRootPathWithinAncestor(
    ancestorRootPath: string | null | undefined,
    childRootPath: string | null | undefined
): boolean {
    if (HasPathTraversalSegment(childRootPath)) {
        return false;
    }
    const ancTrimmed = ancestorRootPath?.trim() ?? '';
    if (ancTrimmed.length === 0) {
        return true;
    }
    const childTrimmed = childRootPath?.trim() ?? '';
    if (childTrimmed.length === 0) {
        return false;
    }
    const ancSegs = normalizePathSegments(ancTrimmed);
    const childSegs = normalizePathSegments(childTrimmed);
    if (childSegs.length >= ancSegs.length && ancSegs.every((seg, idx) => childSegs[idx] === seg)) {
        return true;
    }
    // Clean relative sub-prefix (no leading slash) under an absolute ancestor prefix
    if (ancTrimmed.startsWith('/') && !childTrimmed.startsWith('/') && childSegs.length > 0) {
        return true;
    }
    return false;
}

/**
 * Narrows `AttachmentRootPath` monotonically: keeps `childRootPath` if it starts with
 * `ancestorRootPath`, appends clean relative sub-prefixes under an absolute ancestor prefix,
 * rejects `..` traversal and unrelated absolute paths by preserving `ancestorRootPath`.
 */
export function NarrowAttachmentRootPath(
    ancestorRootPath: string | null,
    childRootPath: string | null
): string | null {
    if (HasPathTraversalSegment(childRootPath)) {
        return ancestorRootPath;
    }
    const ancTrimmed = ancestorRootPath?.trim() ?? '';
    const childTrimmed = childRootPath?.trim() ?? '';
    if (ancTrimmed.length === 0) {
        return childTrimmed.length > 0 ? childTrimmed : null;
    }
    if (childTrimmed.length === 0) {
        return ancestorRootPath;
    }
    const ancSegs = normalizePathSegments(ancTrimmed);
    const childSegs = normalizePathSegments(childTrimmed);
    if (childSegs.length >= ancSegs.length && ancSegs.every((seg, idx) => childSegs[idx] === seg)) {
        return childTrimmed;
    }
    if (ancTrimmed.startsWith('/') && !childTrimmed.startsWith('/') && childSegs.length > 0) {
        return `${ancTrimmed.replace(/\/+$/, '')}/${childTrimmed.replace(/^\/+/, '')}`;
    }
    return ancestorRootPath;
}

// ============================================================================
// ScopeConfig (`scope.secondaryScopeConfig`) Per-Key Intersection
// ============================================================================

function stableValueEquals(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }
    if (typeof a !== typeof b || a === null || b === null) {
        return false;
    }
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/**
 * Intersects two `ScopeConfig` objects per key:
 * - Scalar keys defined on `ancestor` stay locked to `ancestor[k]`.
 * - Array keys defined on both `ancestor` and `child` are intersected (`child` items matching `ancestor`).
 * - Nested plain objects are intersected recursively.
 * - Net-new keys on `child` are added as extra narrowing filters.
 */
export function NarrowScopeConfigObjects(
    ancestor: Record<string, unknown> | null,
    child: Record<string, unknown> | null
): Record<string, unknown> | null {
    if (!ancestor) {
        return child ? { ...child } : null;
    }
    if (!child) {
        return { ...ancestor };
    }
    const out: Record<string, unknown> = { ...ancestor };
    for (const key of Object.keys(child)) {
        const childVal = child[key];
        if (childVal === undefined) {
            continue;
        }
        if (!Object.prototype.hasOwnProperty.call(ancestor, key) || ancestor[key] === undefined || ancestor[key] === null) {
            out[key] = childVal;
            continue;
        }
        const ancVal = ancestor[key];
        if (Array.isArray(ancVal) && Array.isArray(childVal)) {
            out[key] = childVal.filter((item) => ancVal.some((aItem) => stableValueEquals(aItem, item)));
        } else if (IsPlainObject(ancVal) && IsPlainObject(childVal)) {
            out[key] = NarrowScopeConfigObjects(
                ancVal as Record<string, unknown>,
                childVal as Record<string, unknown>
            );
        } else {
            // Scalar key is locked to ancestor's value
            out[key] = ancVal;
        }
    }
    return out;
}

/**
 * Save-time validation check for `ScopeConfig`: returns human-readable violation descriptions
 * whenever `child` alters an ancestor scalar key, adds values outside an ancestor array key,
 * or attempts to null-clear a non-null ancestor key.
 */
export function FindScopeConfigWideningViolations(
    ancestor: Record<string, unknown> | null,
    child: Record<string, unknown> | null,
    prefix: string = 'ScopeConfig'
): string[] {
    if (!ancestor) {
        return [];
    }
    if (!child) {
        return [];
    }
    const violations: string[] = [];
    for (const key of Object.keys(child)) {
        if (!Object.prototype.hasOwnProperty.call(ancestor, key)) {
            continue; // Net-new key is an extra narrowing filter
        }
        const ancVal = ancestor[key];
        const childVal = child[key];
        if (ancVal === undefined || ancVal === null) {
            continue;
        }
        if (childVal === undefined) {
            continue;
        }
        const pathLabel = `${prefix}.${key}`;
        if (childVal === null) {
            violations.push(`${pathLabel} cannot be cleared to null when ancestor locks it.`);
            continue;
        }
        if (Array.isArray(ancVal)) {
            if (!Array.isArray(childVal)) {
                violations.push(`${pathLabel} must remain an array subset of ancestor values.`);
                continue;
            }
            const widened = childVal.filter((item) => !ancVal.some((aItem) => stableValueEquals(aItem, item)));
            if (widened.length > 0) {
                violations.push(
                    `${pathLabel} cannot include values outside ancestor set (${JSON.stringify(widened)}).`
                );
            }
        } else if (IsPlainObject(ancVal)) {
            if (!IsPlainObject(childVal)) {
                violations.push(`${pathLabel} must remain an object narrowing ancestor keys.`);
                continue;
            }
            violations.push(
                ...FindScopeConfigWideningViolations(
                    ancVal as Record<string, unknown>,
                    childVal as Record<string, unknown>,
                    pathLabel
                )
            );
        } else if (!stableValueEquals(ancVal, childVal)) {
            violations.push(
                `${pathLabel} (${JSON.stringify(childVal)}) cannot override ancestor locked value (${JSON.stringify(ancVal)}).`
            );
        }
    }
    return violations;
}
