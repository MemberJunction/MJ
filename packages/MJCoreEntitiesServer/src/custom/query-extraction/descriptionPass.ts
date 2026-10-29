import { AIEngine } from "@memberjunction/aiengine";
import { AIPromptRunner } from "@memberjunction/ai-prompts";
import { AIPromptParams } from "@memberjunction/ai-core-plus";
import { LogError, RunMaybeSerial } from "@memberjunction/core";
import type { BaseEntity, IMetadataProvider, IRunViewProvider, UserInfo } from "@memberjunction/core";
import type { MJQueryEntity, MJQueryFieldEntity, MJQueryParameterEntity } from "@memberjunction/core-entities";
import { EscapeSQLString } from "@memberjunction/global";

const PROMPT_NAME = 'SQL Query Parameter Extraction';
const PROMPT_CATEGORY = 'MJ: System';

/** One described name, as the prompt returns it. */
interface DescribedName {
    name: string; // case-violation-ok-legacy-back-compat: the prompt's JSON output contract uses lower-case keys
    description: string; // case-violation-ok-legacy-back-compat: the prompt's JSON output contract uses lower-case keys
}

/** The prompt's output: descriptions only. */
interface QueryDescriptionsResult {
    parameters?: DescribedName[]; // case-violation-ok-legacy-back-compat: the prompt's JSON output contract uses lower-case keys
    fields?: DescribedName[]; // case-violation-ok-legacy-back-compat: the prompt's JSON output contract uses lower-case keys
}

/** What the description pass works on. */
export interface DescriptionPassRequest {
    readonly QueryID: string;
    readonly QueryName: string;
    /** The query's SQL, as the prompt reads it. */
    readonly SQL: string;
    readonly Provider: IMetadataProvider & IRunViewProvider;
    /** The user the rows are written as. */
    readonly User: UserInfo;
}

/**
 * Asks the LLM for descriptions of the query's fields and parameters whose description is still
 * empty, and writes only those descriptions. It never sets a name, type, source or any other fact,
 * and never replaces a description that is already there (authored, from a doc comment, or
 * written earlier).
 *
 * Meant to run after the save's transaction commits (`RunAfterCommit`), so no LLM call is made
 * while a transaction is open. A failure is recorded on the query: `ExtractionMessage` gets the
 * reason and an `OK` status becomes `Warning`. Never throws.
 */
export async function RunDescriptionPass(request: DescriptionPassRequest): Promise<void> {
    try {
        const [fields, parameters] = await loadUndescribedRows(request);
        if (fields.length === 0 && parameters.length === 0) return;
        const described = await askForDescriptions(request, fields, parameters);
        const writes = [...applyDescriptions(fields, described.fields), ...applyDescriptions(parameters, described.parameters)];
        const outcomes = await RunMaybeSerial(request.Provider, writes);
        if (outcomes.some(ok => !ok)) throw new Error('some descriptions could not be saved');
    } catch (e) {
        await recordFailure(request, e instanceof Error ? e.message : String(e));
    }
}

/** The field and parameter rows whose description is empty, read from the database. */
async function loadUndescribedRows(request: DescriptionPassRequest): Promise<[MJQueryFieldEntity[], MJQueryParameterEntity[]]> {
    const filter = `QueryID='${EscapeSQLString(request.QueryID)}' AND (Description IS NULL OR Description = '')`;
    const load = async <T extends BaseEntity>(entityName: string): Promise<T[]> => {
        const result = await request.Provider.RunView<T>({ EntityName: entityName, ExtraFilter: filter, ResultType: 'entity_object', BypassCache: true, IgnoreMaxRows: true }, request.User);
        if (!result.Success) throw new Error(`could not read the ${entityName}: ${result.ErrorMessage}`);
        return result.Results ?? [];
    };
    return Promise.all([load<MJQueryFieldEntity>('MJ: Query Fields'), load<MJQueryParameterEntity>('MJ: Query Parameters')]);
}

async function askForDescriptions(request: DescriptionPassRequest, fields: MJQueryFieldEntity[], parameters: MJQueryParameterEntity[]): Promise<QueryDescriptionsResult> {
    await AIEngine.Instance.Config(false, request.User, request.Provider);
    const prompt = AIEngine.Instance.Prompts.find(p => p.Name === PROMPT_NAME && p.Category === PROMPT_CATEGORY);
    if (!prompt) throw new Error(`the prompt "${PROMPT_NAME}" was not found`);
    const params = new AIPromptParams();
    params.prompt = prompt;
    params.contextUser = request.User;
    params.data = {
        templateText: request.SQL,
        fields: fields.map(f => ({ name: f.Name, type: f.SQLFullType, source: f.SourceEntityField ?? f.SourceObjectName ?? null, isComputed: f.IsComputed })),
        parameters: parameters.map(p => ({ name: p.Name, type: p.Type, isRequired: p.IsRequired === true })),
    };
    const result = await new AIPromptRunner().ExecutePrompt<QueryDescriptionsResult>(params);
    if (!result.success || !result.result) throw new Error(result.errorMessage || 'the prompt returned no result');
    return result.result;
}

/** Writes for the rows the result describes; a row whose description was filled meanwhile is left alone. */
function applyDescriptions(rows: Array<MJQueryFieldEntity | MJQueryParameterEntity>, described: DescribedName[] | undefined): Array<() => Promise<boolean>> {
    const byName = new Map((described ?? []).filter(d => typeof d?.description === 'string' && d.description.trim()).map(d => [String(d.name).toLowerCase(), d.description.trim()]));
    const writes: Array<() => Promise<boolean>> = [];
    for (const row of rows) {
        const description = byName.get(row.Name.toLowerCase());
        if (!description) continue;
        row.Description = description;
        if ('SQLFullType' in row && row.DetectionMethod === 'Database') row.DetectionMethod = 'AI';
        writes.push(() => row.Save());
    }
    return writes;
}

/** Records a failed pass on the query: the reason in `ExtractionMessage`, and `OK` raised to `Warning`. */
async function recordFailure(request: DescriptionPassRequest, reason: string): Promise<void> {
    try {
        const query = await request.Provider.GetEntityObject<MJQueryEntity>('MJ: Queries', request.User);
        if (!await query.Load(request.QueryID)) return;
        const line = `The LLM description pass failed: ${reason.trim().replace(/\.+$/, '')}. Empty descriptions were left empty.`;
        query.ExtractionMessage = query.ExtractionMessage ? `${query.ExtractionMessage}\n${line}` : line;
        if (query.ExtractionStatus === 'OK' || query.ExtractionStatus === null) query.ExtractionStatus = 'Warning';
        if (!await query.Save({ SkipEntityAIActions: true })) {
            LogError(`[QueryExtraction] Could not record the description-pass failure on query "${request.QueryName}": ${query.LatestResult?.CompleteMessage}`);
        }
    } catch (e) {
        LogError(`[QueryExtraction] Could not record the description-pass failure on query "${request.QueryName}": ${e instanceof Error ? e.message : String(e)}`);
    }
}
