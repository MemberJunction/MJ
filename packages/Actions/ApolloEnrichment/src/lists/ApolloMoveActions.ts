/**
 * Apollo list-move actions.
 *
 * A move is the only genuinely dangerous thing in this surface, so the two actions
 * below are more cautious than their size suggests:
 *
 *   - Both list names are resolved to real labels BEFORE any write. A typo in
 *     `ToList` that was only noticed halfway through would leave a batch split
 *     across two lists with no record of which half moved.
 *   - The source list is re-read to get each record's CURRENT labels. The caller
 *     supplies ids, never labels: Apollo replaces the whole label array on every
 *     update, so writing a stale set silently strips memberships the record picked
 *     up since the caller last looked.
 *   - Removes are verified, and records whose remove silently no-op'd are reported
 *     rather than retried. Apollo fails this way on roughly 15-17% of removes and
 *     an immediate retry flakes the same way; the next page-1 drain sees them
 *     carrying both labels and finishes the job.
 *
 * Both require a MASTER Apollo key. There is no delete surface.
 */
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type { ApolloAccount, ApolloContact, ApolloLabel } from '../generic/apollo-lists.types.js';
import { ApolloRESTBaseAction } from './ApolloRESTBaseAction.js';
import { LIST_NOT_FOUND_HINT, getParam, getParamRaw, parseStringArrayParam } from './params.js';

/** Apollo's per-page maximum, which is also the widest source page a move can see. */
const MOVE_SOURCE_PER_PAGE = 100;

/** The validated inputs common to both move actions. */
interface MoveInputs {
    ids: string[];
    fromList: string;
    toList: string;
}

/**
 * Validate the shared inputs. Identical `FromList`/`ToList` is rejected here
 * rather than left to the client, so the caller gets a validation error instead of
 * an exception out of the move engine.
 */
function parseMoveInputs(
    params: RunActionParams,
    idsParamName: string,
): { inputs: MoveInputs; error: null } | { inputs: null; error: ActionResultSimple } {
    const idsParsed = parseStringArrayParam(getParamRaw(params, idsParamName), idsParamName);
    if (idsParsed.error !== null) {
        return { inputs: null, error: { Success: false, Message: idsParsed.error, ResultCode: 'VALIDATION_ERROR' } };
    }
    if (idsParsed.value === undefined) {
        return {
            inputs: null,
            error: {
                Success: false,
                Message: `Missing required field: ${idsParamName} (JSON array or comma-separated Apollo ids)`,
                ResultCode: 'MISSING_REQUIRED_FIELDS',
            },
        };
    }
    const fromList = getParam(params, 'FromList');
    if (!fromList) {
        return { inputs: null, error: { Success: false, Message: 'Missing required field: FromList', ResultCode: 'MISSING_REQUIRED_FIELDS' } };
    }
    const toList = getParam(params, 'ToList');
    if (!toList) {
        return { inputs: null, error: { Success: false, Message: 'Missing required field: ToList', ResultCode: 'MISSING_REQUIRED_FIELDS' } };
    }
    if (fromList.toLowerCase() === toList.toLowerCase()) {
        return {
            inputs: null,
            error: {
                Success: false,
                Message: `FromList and ToList are identical ('${fromList}') — nothing to move.`,
                ResultCode: 'VALIDATION_ERROR',
            },
        };
    }
    return { inputs: { ids: idsParsed.value, fromList, toList }, error: null };
}

/** Resolve both list names to labels before any write happens. */
async function resolveBothLabels(
    client: { findLabelByName(name: string): Promise<ApolloLabel | null> },
    fromList: string,
    toList: string,
): Promise<{ from: ApolloLabel; to: ApolloLabel; error: null } | { from: null; to: null; error: ActionResultSimple }> {
    const from = await client.findLabelByName(fromList);
    if (!from) {
        return {
            from: null,
            to: null,
            error: {
                Success: false,
                Message: `No Apollo list named '${fromList}' (FromList) was found. ${LIST_NOT_FOUND_HINT}`,
                ResultCode: 'NOT_FOUND',
            },
        };
    }
    const to = await client.findLabelByName(toList);
    if (!to) {
        return {
            from: null,
            to: null,
            error: {
                Success: false,
                Message: `No Apollo list named '${toList}' (ToList) was found. ${LIST_NOT_FOUND_HINT}`,
                ResultCode: 'NOT_FOUND',
            },
        };
    }
    return { from, to, error: null };
}

/** The note appended when Apollo's silent-fail removes showed up. */
function stuckNote(possiblyStuckCount: number, kind: string): string {
    return possiblyStuckCount > 0
        ? ` ${possiblyStuckCount} ${kind} may be stuck — Apollo's remove reported success without applying. ` +
          `They will resurface on the next page-1 drain carrying both labels; strip the source label then. ` +
          `An immediate retry flakes the same way, which is why this action does not attempt one.`
        : '';
}

/**
 * Moves accounts from one Apollo list to another.
 *
 * Inputs:
 *   - AccountIDs (required) JSON array or comma-separated Apollo account ids
 *   - FromList   (required) exact source label name
 *   - ToList     (required) exact destination label name
 *   - CompanyID  (optional) per-company credential resolution
 *
 * Outputs:
 *   - MovedCount / FailedCount / PossiblyStuckCount
 *   - Results          per-account { id, added, removed, possiblyStuck, error }
 *   - NotOnSourcePage  supplied ids that were not on page 1 of the source list
 *   - KeySource
 *
 * `PARTIAL_FAILURE` means at least one PATCH failed outright. Possibly-stuck
 * records are NOT failures — the write succeeded and Apollo did not honour it.
 */
@RegisterClass(BaseAction, 'ApolloMoveListAccountsAction')
export class ApolloMoveListAccountsAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const parsed = parseMoveInputs(params, 'AccountIDs');
        if (parsed.error) return parsed.error;
        const { ids, fromList, toList } = parsed.inputs;

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const labels = await resolveBothLabels(resolved.client, fromList, toList);
            if (labels.error) return labels.error;

            // Re-read the source list to capture CURRENT labels — page 1, drain-safe.
            const sourcePage = await resolved.client.searchAccounts(
                { labelIds: [labels.from.id] },
                { page: 1, perPage: MOVE_SOURCE_PER_PAGE },
            );
            const byId = new Map(sourcePage.accounts.map((a) => [a.id, a]));

            const toMove: ApolloAccount[] = [];
            const notOnSourcePage: string[] = [];
            for (const id of new Set(ids)) {
                const account = byId.get(id);
                if (account) toMove.push(account);
                else notOnSourcePage.push(id);
            }

            if (toMove.length === 0) {
                return {
                    Success: false,
                    Message:
                        `None of the ${ids.length} supplied account id(s) were found on page 1 of '${labels.from.name}'. ` +
                        `They may already have moved, or sit on a later page — re-read page 1, since removals shift pages.`,
                    ResultCode: 'NOT_FOUND',
                };
            }

            const result = await resolved.client.moveAccounts(toMove, labels.from.name, labels.to.name, { verify: true });

            LogStatus(
                `ApolloMoveListAccounts: '${labels.from.name}' → '${labels.to.name}' — ${result.movedCount} moved, ` +
                `${result.possiblyStuckCount} possibly stuck, ${result.failedCount} failed of ${toMove.length} ` +
                `(${notOnSourcePage.length} supplied id(s) not on source page 1).`,
            );

            params.Params.push(
                { Name: 'MovedCount', Type: 'Output', Value: result.movedCount },
                { Name: 'FailedCount', Type: 'Output', Value: result.failedCount },
                { Name: 'PossiblyStuckCount', Type: 'Output', Value: result.possiblyStuckCount },
                { Name: 'Results', Type: 'Output', Value: result.items },
                { Name: 'NotOnSourcePage', Type: 'Output', Value: notOnSourcePage },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: result.failedCount === 0,
                Message:
                    `Moved ${result.movedCount} of ${toMove.length} account(s) from '${labels.from.name}' to '${labels.to.name}'` +
                    `${result.failedCount > 0 ? `; ${result.failedCount} failed` : ''}.${stuckNote(result.possiblyStuckCount, 'account(s)')}`,
                ResultCode: result.failedCount === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloMoveListAccounts: ${msg}`);
            return { Success: false, Message: `Error moving Apollo accounts: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

/**
 * Moves contacts from one Apollo list to another. Identical semantics to
 * {@link ApolloMoveListAccountsAction}; the id param is `ContactIDs` and the
 * outputs carry contact results.
 */
@RegisterClass(BaseAction, 'ApolloMoveListContactsAction')
export class ApolloMoveListContactsAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const parsed = parseMoveInputs(params, 'ContactIDs');
        if (parsed.error) return parsed.error;
        const { ids, fromList, toList } = parsed.inputs;

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const labels = await resolveBothLabels(resolved.client, fromList, toList);
            if (labels.error) return labels.error;

            const sourcePage = await resolved.client.searchContacts(
                { labelIds: [labels.from.id] },
                { page: 1, perPage: MOVE_SOURCE_PER_PAGE },
            );
            const byId = new Map(sourcePage.contacts.map((c) => [c.id, c]));

            const toMove: ApolloContact[] = [];
            const notOnSourcePage: string[] = [];
            for (const id of new Set(ids)) {
                const contact = byId.get(id);
                if (contact) toMove.push(contact);
                else notOnSourcePage.push(id);
            }

            if (toMove.length === 0) {
                return {
                    Success: false,
                    Message:
                        `None of the ${ids.length} supplied contact id(s) were found on page 1 of '${labels.from.name}'. ` +
                        `They may already have moved, or sit on a later page — re-read page 1, since removals shift pages.`,
                    ResultCode: 'NOT_FOUND',
                };
            }

            const result = await resolved.client.moveContacts(toMove, labels.from.name, labels.to.name, { verify: true });

            LogStatus(
                `ApolloMoveListContacts: '${labels.from.name}' → '${labels.to.name}' — ${result.movedCount} moved, ` +
                `${result.possiblyStuckCount} possibly stuck, ${result.failedCount} failed of ${toMove.length} ` +
                `(${notOnSourcePage.length} supplied id(s) not on source page 1).`,
            );

            params.Params.push(
                { Name: 'MovedCount', Type: 'Output', Value: result.movedCount },
                { Name: 'FailedCount', Type: 'Output', Value: result.failedCount },
                { Name: 'PossiblyStuckCount', Type: 'Output', Value: result.possiblyStuckCount },
                { Name: 'Results', Type: 'Output', Value: result.items },
                { Name: 'NotOnSourcePage', Type: 'Output', Value: notOnSourcePage },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: result.failedCount === 0,
                Message:
                    `Moved ${result.movedCount} of ${toMove.length} contact(s) from '${labels.from.name}' to '${labels.to.name}'` +
                    `${result.failedCount > 0 ? `; ${result.failedCount} failed` : ''}.${stuckNote(result.possiblyStuckCount, 'contact(s)')}`,
                ResultCode: result.failedCount === 0 ? 'SUCCESS' : 'PARTIAL_FAILURE',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloMoveListContacts: ${msg}`);
            return { Success: false, Message: `Error moving Apollo contacts: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

export function LoadApolloMoveActions(): void {
    // Referenced by consumers to keep these registrations from being tree-shaken.
}
