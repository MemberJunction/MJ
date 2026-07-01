import { LogStatus } from "@memberjunction/core";
import { UUIDsEqual } from "@memberjunction/global";
import { MJScopedPromptPartEntity } from "@memberjunction/core-entities";
import { AIEngine } from "@memberjunction/aiengine";
import { ChatMessage, ChatMessageRole } from "@memberjunction/ai";
import { SecondaryScopeValue } from "@memberjunction/ai-core-plus";

/**
 * The scope a prompt-component resolution runs in. Mirrors the polymorphic scope the agent
 * runtime already carries for memory (PrimaryScopeEntity/Record + SecondaryScopes).
 */
export interface PromptComponentScope {
    primaryScopeEntityId?: string;
    primaryScopeRecordId?: string;
    secondaryScopes?: Record<string, SecondaryScopeValue>;
}

/** Statuses eligible for resolution. Archived parts are excluded. */
const RESOLVABLE_STATUSES = new Set<string>(["Active", "Provisional"]);

/**
 * PromptComponentResolver — decides which `MJ: Scoped Prompt Parts` are included for a given
 * prompt under a given scope, and assembles them into a role-faithful `ChatMessage[]`.
 *
 * **Pluggable (ClassFactory) + metadata-driven (template method).**
 * The public {@link Resolve} / {@link AssembleMessages} fix the orchestration; the protected hooks
 * ({@link getCandidates}, {@link isInScope}, {@link score}, {@link selectIncluded}, {@link order})
 * are the extension points. MJ core obtains the resolver via
 * `MJGlobal.Instance.ClassFactory.CreateInstance(PromptComponentResolver)`, which returns this base
 * by default (no registration ⇒ base instance) or the highest-priority registered subclass. So any
 * downstream consumer can plug in custom inclusion logic with **no core change**:
 *
 * ```ts
 * @RegisterClass(PromptComponentResolver)            // priority auto-increments by import order
 * export class MyResolver extends PromptComponentResolver {
 *   protected override score(p, scope) { ... }        // custom ranking
 *   protected override selectIncluded(parts, scope) { ... } // custom merge rules
 * }
 * ```
 *
 * Base (metadata-driven) defaults:
 *  - **Additive across part `Name`s** — distinct names all survive.
 *  - **Within a `Name`**, the row's `MergeBehavior` decides: `'Override'` (default) ⇒ the
 *    most-specific part wins (replace), `'Append'` ⇒ all in-scope same-named parts are included.
 *  - Specificity (the override ranking): SecondaryScopes match (+4) > PrimaryScopeRecord (+2) >
 *    Global (+1), tie-broken by `Priority`.
 *  - Final order: `Sort` ASC, then `Priority` DESC.
 *  - Roles are preserved (System/User/Assistant) so the assembled messages drive the model directly.
 */
export class PromptComponentResolver {
    // ── Public template methods ────────────────────────────────────────────────

    /** Resolve the included, ordered parts for `promptID` under `scope`. */
    public Resolve(promptID: string, scope: PromptComponentScope): MJScopedPromptPartEntity[] {
        const inScope = this.getCandidates(promptID).filter((p) => this.isInScope(p, scope));
        const included = this.selectIncluded(inScope, scope);
        return this.order(included);
    }

    /** Assemble resolved parts into role-faithful messages, coalescing adjacent same-role. */
    public AssembleMessages(parts: MJScopedPromptPartEntity[]): ChatMessage[] {
        const out: ChatMessage[] = [];
        for (const p of parts) {
            const content = (p.Text ?? "").trim();
            if (!content) continue;
            const role = this.coerceRole(p.Role);
            const last = out[out.length - 1];
            if (last && last.role === role) {
                last.content = `${last.content as string}\n\n${content}`;
            } else {
                out.push({ role, content });
            }
        }
        return out;
    }

    // ── Protected hooks (override points) ──────────────────────────────────────

    /** Candidate parts for a prompt: same PromptID + resolvable Status. Override to widen/narrow. */
    protected getCandidates(promptID: string): MJScopedPromptPartEntity[] {
        return AIEngine.Instance.ScopedPromptParts.filter(
            (p) => UUIDsEqual(p.PromptID, promptID) && RESOLVABLE_STATUSES.has(p.Status),
        );
    }

    /** Is this part compatible with the run scope? (cascading: a part may only require dims the run has) */
    protected isInScope(p: MJScopedPromptPartEntity, scope: PromptComponentScope): boolean {
        if (p.PrimaryScopeRecordID) {
            if (
                !scope.primaryScopeRecordId ||
                p.PrimaryScopeRecordID.toLowerCase() !== scope.primaryScopeRecordId.toLowerCase()
            ) {
                return false;
            }
            if (
                p.PrimaryScopeEntityID &&
                scope.primaryScopeEntityId &&
                !UUIDsEqual(p.PrimaryScopeEntityID, scope.primaryScopeEntityId)
            ) {
                return false;
            }
        }
        const partScopes = this.parseScopes(p.SecondaryScopes);
        for (const key of Object.keys(partScopes)) {
            const runValue = scope.secondaryScopes?.[key];
            if (runValue === undefined || String(runValue) !== String(partScopes[key])) {
                return false;
            }
        }
        return true;
    }

    /** Specificity score: SecondaryScopes match (+4) > PrimaryScopeRecord (+2) > Global (+1). */
    protected score(p: MJScopedPromptPartEntity): number {
        let s = 1;
        if (p.PrimaryScopeRecordID) s += 2;
        if (Object.keys(this.parseScopes(p.SecondaryScopes)).length > 0) s += 4;
        return s;
    }

    /**
     * From in-scope candidates, decide inclusion per `Name`:
     *  - rank a Name's parts by specificity (score) then `Priority`;
     *  - the top part's `MergeBehavior` governs the group — `'Override'` keeps only the top,
     *    `'Append'` keeps all (additive within the Name).
     * Distinct names always coexist (additive across names).
     */
    protected selectIncluded(
        candidates: MJScopedPromptPartEntity[],
        _scope: PromptComponentScope,
    ): MJScopedPromptPartEntity[] {
        const byName = new Map<string, MJScopedPromptPartEntity[]>();
        for (const p of candidates) {
            const arr = byName.get(p.Name) ?? [];
            arr.push(p);
            byName.set(p.Name, arr);
        }
        const result: MJScopedPromptPartEntity[] = [];
        for (const group of byName.values()) {
            group.sort((a, b) => this.score(b) - this.score(a) || b.Priority - a.Priority);
            if (group[0].MergeBehavior === "Append") {
                result.push(...group);
            } else {
                result.push(group[0]);
            }
        }
        return result;
    }

    /** Final assembly order: Sort ASC, then Priority DESC, then Name. */
    protected order(parts: MJScopedPromptPartEntity[]): MJScopedPromptPartEntity[] {
        return [...parts].sort(
            (a, b) => a.Sort - b.Sort || b.Priority - a.Priority || a.Name.localeCompare(b.Name),
        );
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    protected parseScopes(raw: string | null): Record<string, unknown> {
        if (!raw) return {};
        try {
            const o = JSON.parse(raw);
            return o && typeof o === "object" ? (o as Record<string, unknown>) : {};
        } catch {
            return {};
        }
    }

    protected coerceRole(raw: string | null): ChatMessageRole {
        const lower = typeof raw === "string" ? raw.toLowerCase() : "";
        if (lower === "user") return "user";
        if (lower === "assistant") return "assistant";
        return "system";
    }
}

/**
 * Convenience used by the agent runtime: obtain the (possibly overridden) resolver via the
 * class factory, resolve + assemble for `promptID`/`scope`, and unshift the role-faithful messages
 * onto the front of `conversationMessages` (mirroring how memory/RAG inject). No-op when nothing
 * resolves. Returns the included parts (for observability).
 */
export function InjectScopedPromptParts(
    resolver: PromptComponentResolver,
    promptID: string,
    scope: PromptComponentScope,
    conversationMessages: ChatMessage[],
): MJScopedPromptPartEntity[] {
    const parts = resolver.Resolve(promptID, scope);
    if (parts.length === 0) return [];
    const messages = resolver.AssembleMessages(parts);
    if (messages.length === 0) return [];
    conversationMessages.unshift(...messages);
    LogStatus(
        `PromptComponentResolver: injected ${messages.length} message(s) from ${parts.length} ` +
            `part(s) for prompt ${promptID} (scope record=${scope.primaryScopeRecordId ?? "global"})`,
    );
    return parts;
}
