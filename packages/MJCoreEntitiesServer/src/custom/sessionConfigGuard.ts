/**
 * @fileoverview Server-authoritative keys inside `MJ: AI Agent Sessions.Config`, and the in-process
 * capability that lets server code (and only server code) change them.
 *
 * ## The problem this solves
 *
 * `AIAgentSession.Config` is a free-form JSON column that the **session owner can write directly**:
 * the `UI` and `Widget Guest` roles hold `CanUpdate` on the entity (scoped to their own rows), and the
 * generated `UpdateMJAIAgentSession` mutation plus `StartAgentSession(configJson)` hand client JSON
 * straight to `Save()`. A few keys in that blob are not preferences — they are **server decisions the
 * client must not be able to make for itself**:
 *
 * - `maxSessionDeadlineIso` — the absolute wall-clock deadline the `SessionJanitor` enforces. A guest
 *   who could rewrite it could extend its own (cost-bearing) voice session indefinitely.
 * - `identityVerification` — the verification state of the session (pending hashed token/code,
 *   attempt counters, and the verified identity). A client who could write it could mark itself
 *   verified, reset its attempt counter, or forge the policy it is held to.
 * - `channels` — the session's resolved channel scope (which interactive channels the server put IN
 *   the session). A client who could delete or widen it could unscope the session and save state or
 *   artifacts for channels its agent/app configuration excluded.
 *
 * `MJAIAgentSessionEntityServer` calls {@link FindProtectedSessionConfigChanges} from `Validate()` and
 * refuses any save that changes one of these keys — **unless** the save runs inside
 * {@link RunWithTrustedSessionConfigWrites}.
 *
 * ## Why an in-process scope, not a role or flag
 *
 * Trust must be something a remote caller cannot assert. A request body, a header, an entity field —
 * all attacker-controlled. An `AsyncLocalStorage` scope entered by server code is invisible to the
 * network: only code already running inside the MJServer process can enter it. Every legitimate
 * writer (the mint resolver, the verification service) is such code.
 *
 * The scope is held in the **global object store**, not a module-level variable, for the same reason
 * `BaseSingleton` is: if a bundler or a duplicated install loads this module twice, a module-level
 * `AsyncLocalStorage` would give the writer and the validator two different scopes and every trusted
 * write would be refused.
 *
 * @module @memberjunction/core-entities-server
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { MJGlobal } from '@memberjunction/global';

/**
 * The `Config` keys only trusted server code may add, change or remove.
 * New server-authoritative session keys belong here (and nowhere else).
 */
export const PROTECTED_SESSION_CONFIG_KEYS: readonly string[] = ['maxSessionDeadlineIso', 'identityVerification', 'channels'];

/** Global-object-store key holding the one process-wide trusted-write scope. */
const TRUSTED_SCOPE_STORE_KEY = '___MJCoreEntitiesServer___TrustedSessionConfigWriteScope';

/** The process-wide scope (created on first use). The stored value is just a marker. */
function trustedScope(): AsyncLocalStorage<true> {
    const store = MJGlobal.Instance.GetGlobalObjectStore();
    let scope = store[TRUSTED_SCOPE_STORE_KEY] as AsyncLocalStorage<true> | undefined;
    if (!scope) {
        scope = new AsyncLocalStorage<true>();
        store[TRUSTED_SCOPE_STORE_KEY] = scope;
    }
    return scope;
}

/**
 * Runs `work` with permission to change {@link PROTECTED_SESSION_CONFIG_KEYS}. The permission follows
 * the async call chain started inside `work` (every `await`, timer and promise it spawns) and ends
 * when `work` settles.
 *
 * **Server code only.** Never call this from anything that forwards client-supplied JSON into the
 * session `Config` — wrap exactly the statement that writes server-decided values, nothing wider.
 *
 * @param work - the asynchronous operation that saves the trusted values
 * @returns whatever `work` returns
 */
export function RunWithTrustedSessionConfigWrites<T>(work: () => Promise<T>): Promise<T> {
    return trustedScope().run(true, work);
}

/** True while inside {@link RunWithTrustedSessionConfigWrites}. */
export function IsTrustedSessionConfigWriteActive(): boolean {
    return trustedScope().getStore() === true;
}

/** Parses a `Config` JSON string into a plain object; anything else (null, garbage, arrays) is `{}`. */
function parseConfigObject(raw: string | null | undefined): Record<string, unknown> {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return {};
    }
    try {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        // Unparseable Config carries no protected keys. If the PREVIOUS value had some, the diff below
        // reports them as removed — which is the correct refusal for a client that corrupts the blob
        // to wipe a server decision.
        return {};
    }
}

/** Key-order-independent serialization, so semantically equal JSON compares equal. */
function canonicalize(value: unknown): string {
    if (value === undefined) {
        return 'undefined';
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalize).join(',')}]`;
    }
    if (typeof value === 'object' && value !== null) {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(record[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

/**
 * Which protected keys differ between two `Config` JSON values.
 *
 * Comparison is semantic (key order and whitespace are ignored), so a server rewrite that merely
 * re-serializes the blob is not a change. Adding, altering or removing a protected key is.
 *
 * @param previousRaw - the stored `Config` (null/undefined for a new record)
 * @param nextRaw - the `Config` about to be saved
 * @returns the protected keys that changed (empty when none did)
 */
export function FindProtectedSessionConfigChanges(
    previousRaw: string | null | undefined,
    nextRaw: string | null | undefined,
): string[] {
    const previous = parseConfigObject(previousRaw);
    const next = parseConfigObject(nextRaw);
    return PROTECTED_SESSION_CONFIG_KEYS.filter((key) => canonicalize(previous[key]) !== canonicalize(next[key]));
}
