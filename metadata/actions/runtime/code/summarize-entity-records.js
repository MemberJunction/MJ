// Summarize Entity Records — rv + ai Runtime action.
//
// Queries a sample of records from the named entity, passes them to a
// pre-shipped prompt (`Runtime Demo: Summarize Entity Records`) and
// returns a structured summary. Exercises the classic "query then LLM"
// pattern — the single most common thing agents reach for when composing
// new capabilities.

const {
    entityName,
    extraFilter,
    maxRows = 50,
    instructions = ''
} = input;

if (!entityName) {
    return { success: false, error: 'entityName is required' };
}

// Step 1 — pull the sample.
const viewResult = await utilities.rv.RunView({
    EntityName: entityName,
    ExtraFilter: extraFilter,
    MaxRows: Number(maxRows) || 50
});

if (!viewResult.Success) {
    return {
        success: false,
        error: `RunView failed: ${viewResult.ErrorMessage}`,
        entityName
    };
}

const records = viewResult.Results;

// Short-circuit if nothing came back — avoid burning tokens on an empty
// prompt and give the caller a clean "nothing to summarize" result.
if (!records || records.length === 0) {
    return {
        success: true,
        entityName,
        recordCount: 0,
        totalRowCount: viewResult.TotalRowCount || 0,
        summary: `No records found for entity '${entityName}' matching the supplied filter.`,
        keyThemes: [],
        followUpQuestions: []
    };
}

// Step 2 — run the shipped summarization prompt. The prompt returns JSON
// per its template contract; we parse it here and surface the structured
// fields individually so downstream consumers (agents, workflows) don't
// need to parse the raw AI response.
const promptResult = await utilities.ai.ExecutePrompt({
    PromptName: 'Runtime Demo: Summarize Entity Records',
    Variables: {
        entityName,
        recordCount: records.length,
        totalRowCount: viewResult.TotalRowCount || records.length,
        instructions: instructions || '',
        recordsJson: JSON.stringify(records, null, 2)
    },
    ModelPower: 'medium'
});

if (!promptResult.Success) {
    return {
        success: false,
        error: `AI prompt execution failed: ${promptResult.ErrorMessage}`,
        entityName,
        recordCount: records.length
    };
}

// The prompt is contracted to return JSON. Parse defensively — if a model
// ignores the contract we still want to surface a usable result rather
// than crashing the sandbox.
let parsed;
try {
    parsed = typeof promptResult.Response === 'string'
        ? JSON.parse(promptResult.Response)
        : promptResult.Response;
} catch (err) {
    return {
        success: false,
        error: 'AI prompt returned non-JSON output — check the prompt response format.',
        rawResponse: promptResult.Response,
        entityName,
        recordCount: records.length
    };
}

return {
    success: true,
    entityName,
    recordCount: records.length,
    totalRowCount: viewResult.TotalRowCount || records.length,
    summary: parsed?.summary ?? '',
    keyThemes: Array.isArray(parsed?.keyThemes) ? parsed.keyThemes : [],
    followUpQuestions: Array.isArray(parsed?.followUpQuestions) ? parsed.followUpQuestions : [],
    modelUsed: promptResult.ModelUsed ?? null,
    tokensUsed: promptResult.TokensUsed ?? null
};
