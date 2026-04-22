// Entity Data Quality Report — md + rv Runtime action.
//
// Given an entity name (and optional filter + sample size), scans records
// and reports per-field null rate, distinct value count, and an overall
// completeness score. Uses permissioned introspection via `utilities.md`
// and a read via `utilities.rv.RunView`.
//
// The overall completeness score weights non-nullable fields 2x — missing
// values in fields that aren't supposed to be null are a bigger quality
// signal than nulls in optional fields.

const _ = require('lodash');

const {
    entityName,
    extraFilter,
    sampleSize = 1000
} = input;

if (!entityName) {
    return { success: false, error: 'entityName is required' };
}

// Step 1 — fetch the entity's field metadata. This call goes through the
// bridge; with allowAnyEntity=true in the config it's permitted for any
// entity. Without that flag it would be rejected unless the entity is in
// allowedEntities.
const fields = await utilities.md.GetEntityFields(entityName);
if (!Array.isArray(fields) || fields.length === 0) {
    return {
        success: false,
        error: `No fields returned for entity '${entityName}'. Check that the entity exists and the runtime action has permission to access it.`
    };
}

// Step 2 — pull up to sampleSize records matching the optional filter.
const viewResult = await utilities.rv.RunView({
    EntityName: entityName,
    ExtraFilter: extraFilter,
    MaxRows: Number(sampleSize) || 1000
});

if (!viewResult.Success) {
    return {
        success: false,
        error: `RunView failed: ${viewResult.ErrorMessage}`,
        entityName
    };
}

const rows = viewResult.Results;
const totalRows = rows.length;

// Note whether the sample is complete or truncated — TotalRowCount comes
// back from RunView even when we capped MaxRows, so we can tell the user
// whether they're getting a full scan or a sample.
const cappedAt = Number(sampleSize) || 1000;
const sampleNote = totalRows >= cappedAt && viewResult.TotalRowCount > cappedAt
    ? `Sampled ${cappedAt} of ${viewResult.TotalRowCount} rows — results are an estimate.`
    : `Scanned all ${totalRows} rows.`;

// Step 3 — per-field analysis. We skip virtual fields (calculated at read
// time; null rates aren't meaningful) and system timestamp fields.
const systemFields = new Set(['__mj_CreatedAt', '__mj_UpdatedAt']);
const analyzable = fields.filter(
    (f) => !f.IsVirtual && !systemFields.has(f.Name)
);

const byField = analyzable.map((f) => {
    const values = rows.map((r) => r[f.Name]);
    const isEmpty = (v) => v == null || v === '';
    const nullCount = values.filter(isEmpty).length;
    const nonEmpty = values.filter((v) => !isEmpty(v));
    // Distinct count — stringify objects so deep comparison isn't needed.
    const distinctCount = new Set(
        nonEmpty.map((v) => (typeof v === 'object' ? JSON.stringify(v) : v))
    ).size;
    const completeness = totalRows > 0 ? 1 - nullCount / totalRows : 1;

    return {
        field: f.Name,
        type: f.Type,
        allowsNull: f.AllowsNull,
        nullCount,
        nullRate: totalRows > 0 ? nullCount / totalRows : 0,
        distinctCount,
        distinctRatio: totalRows > 0 ? distinctCount / totalRows : 0,
        completeness
    };
});

// Step 4 — overall completeness score. Non-nullable fields weight 2x.
const nonNullable = byField.filter((f) => !f.allowsNull);
const nullable = byField.filter((f) => f.allowsNull);
const weightedSum =
    _.sumBy(nonNullable, (f) => f.completeness * 2) +
    _.sumBy(nullable, (f) => f.completeness);
const weightedCount = nonNullable.length * 2 + nullable.length;
const overallCompleteness = weightedCount > 0 ? weightedSum / weightedCount : 1;

// Step 5 — surface the 10 fields with the worst null rates for quick
// at-a-glance triage.
const worstFields = _.orderBy(
    byField.filter((f) => f.nullRate > 0),
    'nullRate',
    'desc'
).slice(0, 10);

return {
    success: true,
    entityName,
    sampleNote,
    rowsAnalyzed: totalRows,
    totalRowsInEntity: viewResult.TotalRowCount,
    overallCompleteness: Number(overallCompleteness.toFixed(4)),
    fieldCount: byField.length,
    fieldsWithNulls: byField.filter((f) => f.nullCount > 0).length,
    worstFields,
    byField: _.orderBy(byField, 'field')
};
