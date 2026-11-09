/**
 * `People Data Labs - Enrich People`: a thin Action for agents and workflows. It resolves a key,
 * calls `PDLPersonClient.BulkEnrich` for up to 100 people, and returns the normalized matches. It
 * writes nothing to the database; code that needs PDL data calls the client directly, never this
 * Action (MJ/packages/Actions/CLAUDE.md: code-to-code calls never go through Actions).
 */
import { BaseAction } from '@memberjunction/actions';
import type { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { LogError } from '@memberjunction/core';
import { RegisterClass } from '@memberjunction/global';
import { DefaultMinLikelihood } from './config.js';
import { NO_PDL_KEY_MESSAGE, ResolvePDLAPIKey, type ResolvedPDLKey } from './credentials.js';
import { GetParam, GetParamRaw, ParseObjectArrayParam, ParseOptionalIntegerParam } from './params.js';
import { PDLCreditsExhaustedError, PDLPersonClient, PDLRateLimitError, type PDLPersonInput } from './PDLPersonClient.js';

export type PDLEnrichPeopleResultCode =
    | 'SUCCESS'
    | 'NO_MATCHES'
    | 'RATE_LIMITED'
    | 'CREDITS_EXHAUSTED'
    | 'CREDENTIALS_NOT_FOUND'
    | 'CONFIGURATION_ERROR'
    | 'VALIDATION_ERROR'
    | 'ERROR';

const PERSON_FIELDS = ['Key', 'PDLID', 'Email', 'LinkedInURL', 'FirstName', 'LastName', 'Company'] as const;

@RegisterClass(BaseAction, 'PDLEnrichPeopleAction')
export class PDLEnrichPeopleAction extends BaseAction {
    /** Seam for tests: swap the client without touching the network. */
    protected CreateClient(apiKey: string): PDLPersonClient {
        return new PDLPersonClient(apiKey);
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const people = ParseObjectArrayParam(GetParamRaw(params, 'People'), 'People');
        if (people.error) return Fail('VALIDATION_ERROR', people.error);
        if (!people.value || people.value.length === 0) return Fail('VALIDATION_ERROR', 'People is required: a JSON array of { Email, LinkedInURL, FirstName, LastName, Company }.');
        if (people.value.length > PDLPersonClient.MaxBatchSize) return Fail('VALIDATION_ERROR', `People holds ${people.value.length} entries; at most ${PDLPersonClient.MaxBatchSize} per call.`);
        const likelihood = ParseOptionalIntegerParam(GetParamRaw(params, 'MinLikelihood'), 'MinLikelihood', { min: 1, max: 10 });
        if (likelihood.error) return Fail('VALIDATION_ERROR', likelihood.error);
        const inputs = people.value.map(ToInput);
        const resolved = await this.resolveClient(params);
        if ('error' in resolved) return resolved.error;
        return this.enrich(params, resolved.client, resolved.key, inputs, likelihood.value ?? DefaultMinLikelihood);
    }

    private async resolveClient(params: RunActionParams): Promise<{ client: PDLPersonClient; key: ResolvedPDLKey } | { error: ActionResultSimple }> {
        let key: ResolvedPDLKey | null;
        try {
            key = await ResolvePDLAPIKey(GetParam(params, 'CompanyID'), params.ContextUser);
        } catch (error) {
            // A credential that exists but is malformed: say so, never fall back to another company's key.
            return { error: Fail('CONFIGURATION_ERROR', error instanceof Error ? error.message : String(error)) };
        }
        if (!key) return { error: Fail('CREDENTIALS_NOT_FOUND', NO_PDL_KEY_MESSAGE) };
        return { client: this.CreateClient(key.apiKey), key };
    }

    private async enrich(params: RunActionParams, client: PDLPersonClient, key: ResolvedPDLKey, inputs: PDLPersonInput[], minLikelihood: number): Promise<ActionResultSimple> {
        try {
            const result = await client.BulkEnrich(inputs, { MinLikelihood: minLikelihood });
            const matched = result.Matches.filter((match) => match.Matched).length;
            params.Params.push(
                { Name: 'Matches', Type: 'Output', Value: result.Matches },
                { Name: 'MatchedCount', Type: 'Output', Value: matched },
                { Name: 'CreditsConsumed', Type: 'Output', Value: result.CreditsConsumed },
                { Name: 'KeySource', Type: 'Output', Value: key.source },
            );
            const code: PDLEnrichPeopleResultCode = matched > 0 ? 'SUCCESS' : 'NO_MATCHES';
            return { Success: true, ResultCode: code, Message: `People Data Labs: ${matched} of ${inputs.length} matched, ${result.CreditsConsumed} credits.`, Params: params.Params };
        } catch (error) {
            return this.failure(error);
        }
    }

    private failure(error: unknown): ActionResultSimple {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`PDLEnrichPeople: ${message}`);
        if (error instanceof PDLRateLimitError) return Fail('RATE_LIMITED', message);
        if (error instanceof PDLCreditsExhaustedError) return Fail('CREDITS_EXHAUSTED', message);
        if (error instanceof Error && error.name === 'PDLAuthError') return Fail('CREDENTIALS_NOT_FOUND', message);
        if (error instanceof Error && !error.name.startsWith('PDL')) return Fail('VALIDATION_ERROR', message);
        return Fail('ERROR', `Error enriching people through People Data Labs: ${message}`);
    }
}

function Fail(code: PDLEnrichPeopleResultCode, message: string): ActionResultSimple {
    return { Success: false, ResultCode: code, Message: message };
}

/** Accepts the documented field names in any casing; the Key defaults to the row's position. */
function ToInput(row: Record<string, unknown>, index: number): PDLPersonInput {
    const input: PDLPersonInput = { Key: String(index) };
    for (const field of PERSON_FIELDS) {
        const entry = Object.entries(row).find(([name]) => name.toLowerCase() === field.toLowerCase());
        const value = entry?.[1];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        input[field] = String(value).trim();
    }
    return input;
}

export function LoadPDLEnrichPeopleAction(): void {
    // Referenced by consumers to keep the registration from being tree-shaken.
}
