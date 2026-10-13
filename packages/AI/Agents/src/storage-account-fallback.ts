/**
 * @fileoverview System-level fallback for choosing an agent's file storage account when nothing
 * is configured at the agent, category, or agent-type level.
 *
 * Two or more active storage accounts with no configured default used to throw at the start of
 * every agent run — so one ambiguous storage setup (say, two apps that each ship an account) took
 * down every agent, including the ones that never write a file. The fallback now picks the most
 * recently updated account deterministically and warns once per agent per process, so the setup
 * stays visible without breaking runs.
 */
import { LogStatus } from '@memberjunction/core';
import type { StorageAccountWithProvider } from '@memberjunction/core-entities';

/** Agents already warned about an ambiguous storage fallback in this process (keyed by agent ID or name). */
const warnedAgents = new Set<string>();

/** Naming context for the ambiguity warning — what the operator would configure to silence it. */
export interface StorageFallbackWarningContext {
    /** Key the once-per-process warning is tracked under (agent ID, else name). */
    AgentKey: string;
    AgentName: string;
    CategoryName: string;
    AgentTypeName: string;
}

/**
 * Orders candidates newest first by `__mj_UpdatedAt`, breaking exact ties by ID so the choice is
 * stable across processes and runs.
 */
function compareNewestFirst(a: StorageAccountWithProvider, b: StorageAccountWithProvider): number {
    const byUpdated = new Date(b.account.__mj_UpdatedAt).getTime() - new Date(a.account.__mj_UpdatedAt).getTime();
    if (byUpdated !== 0) return byUpdated;
    const aId = a.account.ID.toUpperCase();
    const bId = b.account.ID.toUpperCase();
    return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/**
 * Picks the storage account to use when no default is configured anywhere in the resolution chain.
 *
 * - No active accounts → `null` (the inline base64 fallback handles files downstream).
 * - One active account → that account.
 * - Two or more → the account with the most recent `__mj_UpdatedAt` (ties broken by ID), plus a
 *   warning naming every candidate and where to set a default. The warning is emitted once per
 *   agent per process so it doesn't repeat on every run.
 *
 * @param activeAccounts Accounts whose provider is active.
 * @param context Agent/category/type names for the warning text.
 * @returns The chosen account ID, or `null` when there are no active accounts.
 */
export function PickFallbackStorageAccountID(
    activeAccounts: StorageAccountWithProvider[],
    context: StorageFallbackWarningContext
): string | null {
    if (activeAccounts.length === 0) return null;
    if (activeAccounts.length === 1) return activeAccounts[0].account.ID;

    const sorted = [...activeAccounts].sort(compareNewestFirst);
    const chosen = sorted[0];

    if (!warnedAgents.has(context.AgentKey)) {
        warnedAgents.add(context.AgentKey);
        const accountNames = sorted.map(a => `'${a.account.Name}' (${a.provider.Name})`).join(', ');
        LogStatus(
            `⚠️ Multiple active file storage accounts (${accountNames}) and no DefaultStorageAccountID is configured ` +
            `for agent '${context.AgentName}', category '${context.CategoryName}', or agent type '${context.AgentTypeName}'. ` +
            `Using '${chosen.account.Name}' (most recently updated). To choose explicitly, set DefaultStorageAccountID on ` +
            `the agent, its category, or its agent type.`
        );
    }

    return chosen.account.ID;
}

/** Test hook: forget which agents have been warned, so each test starts clean. */
export function ResetStorageFallbackWarnings(): void {
    warnedAgents.clear();
}
