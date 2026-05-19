// Weekly Entity Digest — full-stack Runtime action.
//
// This is the "scaffolding effect" demo from the Runtime Actions plan — a
// single action composes four bridge namespaces:
//   1. rv.RunViews — parallel queries across several entities, date-bounded
//   2. libs.dateFns / libs.lodash — format the time range, aggregate
//   3. ai.ExecutePrompt — turn the activity JSON into a markdown digest
//   4. actions.Invoke — hand the digest to "Send Single Message"
//
// If this works end-to-end, Runtime Actions are doing everything they're
// supposed to do.

const _ = require('lodash');
const dateFns = require('date-fns');

const {
    entityNames,
    timeRangeDays = 7,
    recipientEmail,
    subject,
    dryRun = false
} = input;

if (!Array.isArray(entityNames) || entityNames.length === 0) {
    return { success: false, error: 'entityNames must be a non-empty array of entity names' };
}
if (!recipientEmail && !dryRun) {
    return { success: false, error: 'recipientEmail is required unless dryRun is true' };
}

// Step 1 — compute time range. __mj_CreatedAt is the canonical
// "record existed at or after" field on every MJ entity. We use that as
// the uniform filter — entity-specific CreatedAt fields exist but vary.
const now = new Date();
const rangeStart = dateFns.subDays(now, Number(timeRangeDays) || 7);
const rangeStartIso = rangeStart.toISOString();
const timeRangeLabel = `${dateFns.format(rangeStart, 'MMM d, yyyy')} – ${dateFns.format(now, 'MMM d, yyyy')}`;

// Step 2 — fan out RunViews in a single bridge call for efficiency.
const viewOpts = entityNames.map((name) => ({
    EntityName: name,
    ExtraFilter: `__mj_CreatedAt >= '${rangeStartIso}'`,
    OrderBy: '__mj_CreatedAt DESC',
    MaxRows: 100
}));

const viewResults = await utilities.rv.RunViews(viewOpts);

// Step 3 — aggregate. For each entity: record count, total row count,
// and a small sample so the LLM can pick out notable items.
const recordCounts = {};
const activity = {};
const errors = [];

viewResults.forEach((r, i) => {
    const name = entityNames[i];
    if (!r.Success) {
        errors.push({ entityName: name, error: r.ErrorMessage });
        recordCounts[name] = null;
        activity[name] = { error: r.ErrorMessage };
        return;
    }
    const rows = r.Results ?? [];
    recordCounts[name] = rows.length;
    activity[name] = {
        count: rows.length,
        totalRowCount: r.TotalRowCount,
        sample: rows.slice(0, 10)
    };
});

// If every view failed, short-circuit — no point burning tokens on an
// empty digest.
if (errors.length === entityNames.length) {
    return {
        success: false,
        error: 'All RunView calls failed.',
        errors,
        timeRangeLabel
    };
}

// Step 4 — ask the prompt to write the digest.
const promptResult = await utilities.ai.ExecutePrompt({
    PromptName: 'Runtime Demo: Weekly Entity Digest',
    Variables: {
        timeRangeLabel,
        generatedAt: now.toISOString(),
        activityJson: JSON.stringify(activity, null, 2)
    },
    ModelPower: 'medium'
});

if (!promptResult.Success) {
    return {
        success: false,
        error: `AI prompt execution failed: ${promptResult.ErrorMessage}`,
        recordCounts,
        errors
    };
}

const digestMarkdown = typeof promptResult.Response === 'string'
    ? promptResult.Response
    : JSON.stringify(promptResult.Response);

// Step 5 — deliver. In dryRun mode we skip the Send action and return
// the digest so a caller can inspect before wiring a real recipient.
if (dryRun) {
    return {
        success: true,
        dryRun: true,
        timeRangeLabel,
        recordCounts,
        totalRecords: _.sum(Object.values(recordCounts).filter((n) => typeof n === 'number')),
        digestMarkdown,
        emailSent: false,
        errors: errors.length ? errors : undefined
    };
}

const sendResult = await utilities.actions.Invoke('Send Single Message', {
    Subject: subject || `Weekly Digest — ${timeRangeLabel}`,
    Body: digestMarkdown,
    To: recipientEmail,
    BodyFormat: 'markdown'
});

return {
    success: Boolean(sendResult.Success),
    timeRangeLabel,
    recordCounts,
    totalRecords: _.sum(Object.values(recordCounts).filter((n) => typeof n === 'number')),
    digestMarkdown,
    emailSent: Boolean(sendResult.Success),
    sendResultCode: sendResult.ResultCode,
    sendMessage: sendResult.Message,
    errors: errors.length ? errors : undefined
};
