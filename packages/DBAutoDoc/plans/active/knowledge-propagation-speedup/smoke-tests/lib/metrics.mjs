// Basic metrics + quality checks.

export function checkQuality(table, outputJson) {
    const result = { jsonValid: false, pkCorrect: false, fkCorrect: false, hasDomain: false, description: '' };
    let p;
    try { p = JSON.parse(outputJson); result.jsonValid = true; } catch { return result; }

    result.description = p.tableDescription || '';
    result.hasDomain = !!p.inferredBusinessDomain;

    const expectedPKs = new Set(table.columns.filter(c => c.isPrimaryKey).map(c => c.name));
    const actualPKs = new Set(p.primaryKey?.columns || []);
    result.pkCorrect = expectedPKs.size > 0 && expectedPKs.size === actualPKs.size
        && [...expectedPKs].every(c => actualPKs.has(c));

    const expectedFKs = table.columns.filter(c => c.isForeignKey && c.fkRef)
        .map(c => `${c.name}|${c.fkRef.schema}|${c.fkRef.table}|${c.fkRef.referencedColumn ?? c.fkRef.column}`).sort();
    const actualFKs = (p.foreignKeys || [])
        .map(fk => {
            // Normalize: strip any accidental schema prefix from referencesTable
            const tbl = String(fk.referencesTable ?? '').replace(/^dbo\./i, '');
            return `${fk.columnName}|${fk.referencesSchema}|${tbl}|${fk.referencesColumn}`;
        }).sort();
    result.fkCorrect = expectedFKs.length === actualFKs.length
        && expectedFKs.every((e, i) => e === actualFKs[i]);

    return result;
}

export function stats(nums) {
    if (!nums.length) return { mean: 0, min: 0, max: 0, stdev: 0 };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return {
        mean: Math.round(mean),
        min: Math.min(...nums),
        max: Math.max(...nums),
        stdev: Math.round(Math.sqrt(variance)),
    };
}
