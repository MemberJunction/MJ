/**
 * Mark the AssociationDemo email and URL columns with their field ExtendedType.
 *
 * CodeGen writes `LinkType="Email"` / `LinkType="URL"` into a generated form only when
 * the field's ExtendedType is already set, and the regression CodeGen config sets no
 * ExtendedType on its own (that comes from the FormLayoutGeneration AI feature, which
 * would also regroup the form sections at random). Without this, the demo forms show
 * emails and URLs as plain text (T044).
 *
 *   Email — nvarchar/varchar fields whose name ends in "Email"
 *   URL   — nvarchar/varchar fields whose name ends in "URL", or is "Website"
 *
 * Runs between CodeGen pass 1 (which creates the EntityField rows) and pass 2 (which
 * generates the forms from them). Only fields with no ExtendedType are changed, so
 * re-runs are harmless.
 *
 * Usage: node set-demo-field-types.cjs
 */

const { connect } = require('./lib/db.cjs');

const SCHEMA = 'AssociationDemo';

const RULES = [
    { type: 'Email', where: "f.Name LIKE '%Email'" },
    { type: 'URL', where: "(f.Name LIKE '%URL' OR f.Name = 'Website')" },
];

(async () => {
    const pool = await connect();
    for (const rule of RULES) {
        const result = await pool.request().query(`
            UPDATE f SET ExtendedType = '${rule.type}'
            FROM __mj.EntityField f
            JOIN __mj.Entity e ON e.ID = f.EntityID
            WHERE e.SchemaName = '${SCHEMA}'
              AND f.ExtendedType IS NULL
              AND f.Type IN ('nvarchar', 'varchar')
              AND ${rule.where}`);
        console.log(`  Set ExtendedType=${rule.type} on ${result.rowsAffected[0]} ${SCHEMA} field(s)`);
    }
    await pool.close();
})().catch(err => {
    console.error(`  Demo field type update failed: ${err.message}`);
    process.exit(1);
});
