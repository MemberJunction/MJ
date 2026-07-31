/**
 * Seed `EntityField.ExtendedType` for the demo schema's email / URL columns.
 *
 * Why this is needed at all: ExtendedType is what makes a form field render as a
 * mailto link with an envelope icon, or a URL with an external-link arrow
 * (`FormFieldComponent.LinkType` switches on it). In a normal deployment CodeGen
 * assigns it via an LLM-assisted metadata pass — see `validateExtendedType` in
 * CodeGenLib's manage-metadata. This stack has **no AI credentials configured**, so
 * that pass can't populate anything, and every email/URL column comes out NULL.
 *
 * The consequence is not cosmetic: the linkification feature becomes untestable.
 * T044 asserts a populated email or URL field renders as a styled link, and it can
 * only ever fail here — not because the app is broken, but because the metadata the
 * feature reads was never derived. Seeding the handful of demo columns
 * deterministically restores the coverage AND matches what a credentialed CodeGen
 * run would have produced.
 *
 * Idempotent, and deliberately narrow: only NULL ExtendedTypes on the named
 * columns are set, so a real CodeGen assignment is never overwritten.
 */

const { connect } = require('./lib/db.cjs');

/** Columns whose ExtendedType is unambiguous from the schema itself. */
const EMAIL_COLUMNS = ['Email', 'EmailAddress', 'ContactEmail'];
const URL_COLUMN_SUFFIXES = ['URL', 'Url', 'Website'];

(async () => {
    const pool = await connect();
    try {
        const emailList = EMAIL_COLUMNS.map((c) => `'${c}'`).join(',');
        const urlPredicate = URL_COLUMN_SUFFIXES.map((s) => `ef.Name LIKE '%${s}'`).join(' OR ');

        // Email: exact, well-known column names only — a column merely CONTAINING
        // "mail" (e.g. "MailingAddress", "EmailOptOut") is not an address.
        const emails = await pool.request().query(`
            UPDATE ef SET ExtendedType = 'Email'
            FROM __mj.EntityField ef
            WHERE ef.ExtendedType IS NULL
              AND ef.Type IN ('nvarchar','varchar')
              AND ef.Name IN (${emailList});
            SELECT @@ROWCOUNT AS n;
        `);

        const urls = await pool.request().query(`
            UPDATE ef SET ExtendedType = 'URL'
            FROM __mj.EntityField ef
            WHERE ef.ExtendedType IS NULL
              AND ef.Type IN ('nvarchar','varchar')
              AND (${urlPredicate});
            SELECT @@ROWCOUNT AS n;
        `);

        const emailCount = emails.recordset?.[0]?.n ?? 0;
        const urlCount = urls.recordset?.[0]?.n ?? 0;
        console.log(`  ExtendedType seeded: ${emailCount} email field(s), ${urlCount} URL field(s)`);
    } catch (e) {
        // Non-fatal: only T044-style link-rendering coverage degrades.
        console.log(`  WARNING: ExtendedType seed failed (non-fatal): ${e.message}`);
    } finally {
        await pool.close();
    }
})();
