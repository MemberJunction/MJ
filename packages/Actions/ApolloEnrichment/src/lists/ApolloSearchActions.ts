/**
 * Apollo search actions: page through a list's members, and search Apollo's
 * people database for net-new prospects.
 *
 * The two list-member searches return each record's CURRENT label names, which is
 * what makes a later move able to preserve the record's other memberships. That is
 * the reason these are separate from a move action rather than folded into it:
 * read, decide, then move, with the labels you actually read.
 */
import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import type {
    ApolloAccountSearchFilter,
    ApolloContactSearchFilter,
    ApolloPagingOptions,
    ApolloPeopleSearchFilter,
} from '../generic/apollo-lists.types.js';
import { ApolloRESTBaseAction } from './ApolloRESTBaseAction.js';
import { LIST_NOT_FOUND_HINT, getParam, getParamRaw, parseOptionalIntegerParam, parseStringArrayParam } from './params.js';

/** Shared paging parse for the three search actions. Apollo's caps are 500 pages of 100. */
function parsePaging(params: RunActionParams): { paging: ApolloPagingOptions; error: string | null } {
    const pageParsed = parseOptionalIntegerParam(getParamRaw(params, 'Page'), 'Page', { min: 1, max: 500 });
    if (pageParsed.error !== null) return { paging: {}, error: pageParsed.error };
    const perPageParsed = parseOptionalIntegerParam(getParamRaw(params, 'PerPage'), 'PerPage', { min: 1, max: 100 });
    if (perPageParsed.error !== null) return { paging: {}, error: perPageParsed.error };

    const paging: ApolloPagingOptions = {};
    if (pageParsed.value !== undefined) paging.page = pageParsed.value;
    if (perPageParsed.value !== undefined) paging.perPage = perPageParsed.value;
    return { paging, error: null };
}

/**
 * Pages through the accounts in an Apollo list, addressed by exact list name.
 *
 * Returns each account's id, name, primary domain and current label names.
 *
 * When draining a list — reading members in order to move them out — read page 1
 * every time. Removals shift every later page, so advancing to page 2 skips
 * records. Read-only.
 *
 * Inputs:
 *   - ListName  (required) exact label name; run Apollo Get Lists to see them
 *   - Keywords  (optional) organization-name filter within the list
 *   - Page      (optional, default 1, max 500)
 *   - PerPage   (optional, default 100, max 100)
 *   - CompanyID (optional) per-company credential resolution
 *
 * Outputs:
 *   - Accounts / Pagination / Count / ResolvedListName / ListID / KeySource
 */
@RegisterClass(BaseAction, 'ApolloGetListAccountsAction')
export class ApolloGetListAccountsAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const listName = getParam(params, 'ListName');
        if (!listName) return this.MissingField('ListName');
        const keywords = getParam(params, 'Keywords');

        const { paging, error: pagingError } = parsePaging(params);
        if (pagingError !== null) return this.Invalid(pagingError);

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const label = await resolved.client.findLabelByName(listName);
            if (!label) {
                return {
                    Success: false,
                    Message: `No Apollo list named '${listName}' was found. ${LIST_NOT_FOUND_HINT}`,
                    ResultCode: 'NOT_FOUND',
                };
            }

            const filter: ApolloAccountSearchFilter = { labelIds: [label.id] };
            if (keywords) filter.keywords = keywords;

            const result = await resolved.client.searchAccounts(filter, paging);

            params.Params.push(
                { Name: 'Accounts', Type: 'Output', Value: result.accounts },
                { Name: 'Pagination', Type: 'Output', Value: result.pagination },
                { Name: 'Count', Type: 'Output', Value: result.accounts.length },
                { Name: 'ResolvedListName', Type: 'Output', Value: label.name },
                { Name: 'ListID', Type: 'Output', Value: label.id },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: true,
                Message:
                    `Apollo accounts in '${label.name}': ${result.accounts.length} on page ${result.pagination.page} ` +
                    `of ${result.pagination.totalPages} (${result.pagination.totalEntries} total).`,
                ResultCode: 'SUCCESS',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloGetListAccounts: ${msg}`);
            return { Success: false, Message: `Error fetching Apollo accounts: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

/**
 * Pages through the contacts in an Apollo list. Same shape and same drain
 * discipline as {@link ApolloGetListAccountsAction}; `Keywords` here matches
 * names, titles, employers and emails rather than organization names.
 *
 * Outputs: Contacts / Pagination / Count / ResolvedListName / ListID / KeySource
 */
@RegisterClass(BaseAction, 'ApolloGetListContactsAction')
export class ApolloGetListContactsAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const listName = getParam(params, 'ListName');
        if (!listName) return this.MissingField('ListName');
        const keywords = getParam(params, 'Keywords');

        const { paging, error: pagingError } = parsePaging(params);
        if (pagingError !== null) return this.Invalid(pagingError);

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const label = await resolved.client.findLabelByName(listName);
            if (!label) {
                return {
                    Success: false,
                    Message: `No Apollo list named '${listName}' was found. ${LIST_NOT_FOUND_HINT}`,
                    ResultCode: 'NOT_FOUND',
                };
            }

            const filter: ApolloContactSearchFilter = { labelIds: [label.id] };
            if (keywords) filter.keywords = keywords;

            const result = await resolved.client.searchContacts(filter, paging);

            params.Params.push(
                { Name: 'Contacts', Type: 'Output', Value: result.contacts },
                { Name: 'Pagination', Type: 'Output', Value: result.pagination },
                { Name: 'Count', Type: 'Output', Value: result.contacts.length },
                { Name: 'ResolvedListName', Type: 'Output', Value: label.name },
                { Name: 'ListID', Type: 'Output', Value: label.id },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: true,
                Message:
                    `Apollo contacts in '${label.name}': ${result.contacts.length} on page ${result.pagination.page} ` +
                    `of ${result.pagination.totalPages} (${result.pagination.totalEntries} total).`,
                ResultCode: 'SUCCESS',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloGetListContacts: ${msg}`);
            return { Success: false, Message: `Error fetching Apollo contacts: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

/**
 * Searches Apollo's people database for net-new prospects by organization, title
 * and seniority — the list-building workhorse.
 *
 * This endpoint does not return emails or phones. That is Apollo's design, not an
 * omission here: contact details come from the enrichment actions in this package,
 * which are metered separately.
 *
 * At least one filter is required. Apollo will accept a request with none and
 * return an unscoped result set, which burns the rate limit to produce something
 * nobody asked for, so that case is rejected before the call.
 *
 * Inputs:
 *   - OrganizationDomains (optional) company domains
 *   - OrganizationIDs     (optional) Apollo organization ids
 *   - Titles              (optional) job titles, e.g. ["VP of Marketing"]
 *   - Seniorities         (optional) owner | founder | c_suite | vp | director | manager
 *   - Page / PerPage      (optional)
 *   - CompanyID           (optional)
 *
 * Each list param accepts a real array, a JSON array string, or a
 * comma-separated string.
 *
 * Outputs: People / Pagination / Count / KeySource
 */
@RegisterClass(BaseAction, 'ApolloSearchPeopleAction')
export class ApolloSearchPeopleAction extends ApolloRESTBaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const domainsParsed = parseStringArrayParam(getParamRaw(params, 'OrganizationDomains'), 'OrganizationDomains');
        if (domainsParsed.error !== null) return this.Invalid(domainsParsed.error);
        const orgIdsParsed = parseStringArrayParam(getParamRaw(params, 'OrganizationIDs'), 'OrganizationIDs');
        if (orgIdsParsed.error !== null) return this.Invalid(orgIdsParsed.error);
        const titlesParsed = parseStringArrayParam(getParamRaw(params, 'Titles'), 'Titles');
        if (titlesParsed.error !== null) return this.Invalid(titlesParsed.error);
        const senioritiesParsed = parseStringArrayParam(getParamRaw(params, 'Seniorities'), 'Seniorities');
        if (senioritiesParsed.error !== null) return this.Invalid(senioritiesParsed.error);

        const { paging, error: pagingError } = parsePaging(params);
        if (pagingError !== null) return this.Invalid(pagingError);

        if (
            domainsParsed.value === undefined &&
            orgIdsParsed.value === undefined &&
            titlesParsed.value === undefined &&
            senioritiesParsed.value === undefined
        ) {
            return this.Invalid(
                'Provide at least one of OrganizationDomains, OrganizationIDs, Titles, or Seniorities — ' +
                'an unscoped people search returns a rate-limited firehose.',
            );
        }

        const { resolved, error } = await this.ResolveClient(params);
        if (error) return error;

        try {
            const filter: ApolloPeopleSearchFilter = {};
            if (domainsParsed.value) filter.organizationDomains = domainsParsed.value;
            if (orgIdsParsed.value) filter.organizationIds = orgIdsParsed.value;
            if (titlesParsed.value) filter.titles = titlesParsed.value;
            if (senioritiesParsed.value) filter.seniorities = senioritiesParsed.value;

            const result = await resolved.client.searchPeople(filter, paging);

            params.Params.push(
                { Name: 'People', Type: 'Output', Value: result.people },
                { Name: 'Pagination', Type: 'Output', Value: result.pagination },
                { Name: 'Count', Type: 'Output', Value: result.people.length },
                { Name: 'KeySource', Type: 'Output', Value: resolved.key.source },
            );

            return {
                Success: true,
                Message:
                    `Apollo people search: ${result.people.length} on page ${result.pagination.page} ` +
                    `of ${result.pagination.totalPages} (${result.pagination.totalEntries} total). ` +
                    `Emails and phones are not returned by this endpoint.`,
                ResultCode: 'SUCCESS',
                Params: params.Params,
            };
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            LogError(`ApolloSearchPeople: ${msg}`);
            return { Success: false, Message: `Error searching Apollo people: ${msg}`, ResultCode: 'ERROR' };
        }
    }
}

export function LoadApolloSearchActions(): void {
    // Referenced by consumers to keep these registrations from being tree-shaken.
}
