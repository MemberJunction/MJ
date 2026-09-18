/**
 * Apollo label (list) actions: read the lists, and create one.
 *
 * Both need a MASTER Apollo key — the labels endpoints 403 on scoped keys, which
 * is worth knowing before wiring these into a workflow, because the failure is
 * indistinguishable from a bad key until you read the message.
 */
import { RegisterClass } from '@memberjunction/global';
import { LogError, LogStatus } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { ApolloRESTBaseAction } from './ApolloRESTBaseAction.js';
import { getParam } from './params.js';

/**
 * Lists the Apollo labels — lists and tags — with each one's kind
 * ('accounts' | 'contacts') and cached member count.
 *
 * This is the first call in any list workflow, because every other action here
 * addresses lists by exact name and this is what tells you the names. Read-only.
 *
 * Inputs:
 *   - CompanyID (optional) resolve the key from this company's Apollo credential
 *                          instead of APOLLO_API_KEY
 *
 * Outputs:
 *   - Lists         array of { id, name, kind, cachedCount, createdAt, updatedAt }
 *   - Count         number of labels
 *   - KeySource     'credential' | 'environment' — which path supplied the key
 */
@RegisterClass(BaseAction, 'ApolloGetListsAction')
export class ApolloGetListsAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const lists = await resolved.client.listLabels();

            params.Params.push(
                { Name: 'Lists', Type: 'Output', Value: lists },
                { Name: 'Count', Type: 'Output', Value: lists.length },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: true,
                Message: `Apollo lists: ${lists.length} label(s).`,
                ResultCode: 'SUCCESS',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloGetLists: ${msg}`);
            return { Success: false, Message: `Error listing Apollo labels: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

/**
 * Creates an Apollo list (label), idempotently.
 *
 * The existing labels are read first, and a same-named label — matched
 * case-insensitively — is returned as-is with `AlreadyExisted: true` rather than
 * creating a second one. Apollo will happily create two labels with the same name,
 * and once it has, every name-based lookup in this surface becomes ambiguous:
 * `findLabelByName` returns whichever comes first, so half the moves would target
 * one list and half the other. Making create idempotent is what keeps
 * name-addressing sound.
 *
 * Master-key write.
 *
 * Inputs:
 *   - ListName  (required) the label to create
 *   - Modality  (optional) 'contacts' (default) | 'accounts' — Apollo rejects a
 *                          create with no modality, so this is a real choice, not
 *                          decoration: a contacts label cannot tag accounts
 *   - CompanyID (optional) as above
 *
 * Outputs:
 *   - ListID / ResolvedListName / AlreadyExisted / Modality / KeySource
 */
@RegisterClass(BaseAction, 'ApolloCreateListAction')
export class ApolloCreateListAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const listName = getParam(params, 'ListName');
        if (!listName) return this.MissingField('ListName');

        const rawModality = getParam(params, 'Modality');
        const modality = (rawModality ?? 'contacts').toLowerCase();
        if (modality !== 'contacts' && modality !== 'accounts') {
            return this.Invalid(`Modality must be 'contacts' or 'accounts' (got '${rawModality}').`);
        }

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const existingLabels = await resolved.client.listLabels();
            const target = listName.toLowerCase();
            const existing = existingLabels.find((l) => l.name.trim().toLowerCase() === target);

            if (existing) {
                LogStatus(`ApolloCreateList: label '${existing.name}' already exists (id ${existing.id}); not creating a duplicate.`);
                params.Params.push(
                    { Name: 'ListID', Type: 'Output', Value: existing.id },
                    { Name: 'ResolvedListName', Type: 'Output', Value: existing.name },
                    { Name: 'AlreadyExisted', Type: 'Output', Value: true },
                    { Name: 'Modality', Type: 'Output', Value: existing.kind },
                    { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
                );
                return {
                    Success: true,
                    Message: `Apollo list '${existing.name}' already existed (id ${existing.id}); returned without creating a duplicate.`,
                    ResultCode: 'SUCCESS',
                    Params: params.Params,
                };
            }

            const created = await resolved.client.createLabel(listName, modality);
            LogStatus(`ApolloCreateList: created label '${created.name}' (id ${created.id}, modality ${modality}).`);

            params.Params.push(
                { Name: 'ListID', Type: 'Output', Value: created.id },
                { Name: 'ResolvedListName', Type: 'Output', Value: created.name },
                { Name: 'AlreadyExisted', Type: 'Output', Value: false },
                { Name: 'Modality', Type: 'Output', Value: created.kind },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: true,
                Message: `Created Apollo list '${created.name}' (id ${created.id}).`,
                ResultCode: 'SUCCESS',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloCreateList: ${msg}`);
            return { Success: false, Message: `Error creating Apollo list: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

export function LoadApolloListActions(): void {
    // Referenced by consumers to keep these registrations from being tree-shaken.
}
