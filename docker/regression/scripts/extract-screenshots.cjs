/**
 * Extract per-step screenshots and step metadata from the test run database
 * into $RUN_DIR/screenshots/{TestName}/step_NN.png and steps.json.
 *
 * Reads results.json from $RUN_DIR to get the list of testRunIds, then
 * queries vwTestRunOutputs for each one. Each output row carries an
 * InlineData base64 PNG and a Metadata JSON blob (reasoning, actions, url).
 *
 * The HTML report (generate-html-report.cjs) consumes the resulting
 * screenshots/ tree + steps.json files to render the gallery + lightbox.
 */

const fs = require('fs');
const path = require('path');
const { sql, connect } = require('./lib/db.cjs');

const RUN_DIR = process.env.RUN_DIR;
if (!RUN_DIR) {
    console.error('  WARNING: RUN_DIR not set, skipping screenshot extraction');
    process.exit(0);
}

(async () => {
    const screenshotsDir = path.join(RUN_DIR, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const results = JSON.parse(fs.readFileSync(path.join(RUN_DIR, 'results.json'), 'utf8'));
    const pool = await connect();

    for (const test of results.testResults || []) {
        const testDir = path.join(screenshotsDir, test.testName.replace(/[^a-zA-Z0-9_-]/g, '_'));
        fs.mkdirSync(testDir, { recursive: true });

        const outputs = await pool.request()
            .input('testRunId', sql.UniqueIdentifier, test.testRunId)
            .query('SELECT Name, Sequence, StepNumber, InlineData, Description, Metadata FROM __mj.vwTestRunOutputs WHERE TestRunID = @testRunId ORDER BY Sequence');

        let count = 0;
        const steps = [];
        for (const row of outputs.recordset) {
            const stepNum = String(row.Sequence).padStart(2, '0');
            if (row.InlineData) {
                const filename = `step_${stepNum}.png`;
                fs.writeFileSync(path.join(testDir, filename), Buffer.from(row.InlineData, 'base64'));
                count++;
            }
            // Collect step metadata (reasoning, actions, url) for the HTML gallery.
            let meta = {};
            if (row.Metadata) {
                try { meta = JSON.parse(row.Metadata); } catch { /* ignore */ }
            }
            steps.push({
                step: row.StepNumber || row.Sequence,
                file: `step_${stepNum}.png`,
                url: meta.url || (row.Description || '').replace(/^Page: /, '') || '',
                reasoning: meta.reasoning || '',
                actions: meta.actions || [],
            });
        }
        fs.writeFileSync(path.join(testDir, 'steps.json'), JSON.stringify(steps, null, 2));
        console.log(`  ${test.testName}: ${count} screenshots + steps.json`);
    }

    await pool.close();
})().catch(err => {
    // Non-fatal — the report generators can still produce output without screenshots.
    console.error('  WARNING: Screenshot extraction failed:', err.message);
});
