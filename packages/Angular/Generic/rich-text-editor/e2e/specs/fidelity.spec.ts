import { test } from '@playwright/test';
import { expect, HARNESS_URL } from './harness';

/**
 * The fidelity contract in a real browser. jsdom's parser and Chromium's disagree in small
 * ways; the contract has to hold against the one users actually run.
 */
test('every fixture survives load → serialize and is a fixed point under reload', async ({ page }) => {
    await page.goto(HARNESS_URL);
    const failures = await page.evaluate(() => {
        const { RichTextEngine, diffHtml, ROUND_TRIP_FIXTURES } = window.MJRichText;
        const root = document.getElementById('root') as HTMLElement;
        const out: string[] = [];
        for (const fixture of ROUND_TRIP_FIXTURES) {
            const engine = new RichTextEngine(root, { SanitizeProfile: fixture.Profile });
            engine.SetHTML(fixture.Html);
            const once = engine.GetHTML();
            const first = diffHtml(fixture.ExpectedHtml ?? fixture.Html, once, { AllowFillerLineBreaks: true, IgnoreFormattingWhitespace: true });
            if (!first.Equal) {
                out.push(`${fixture.Name}: ${first.Differences.length} differences after load`);
            }
            engine.SetHTML(once);
            if (engine.GetHTML() !== once) {
                out.push(`${fixture.Name}: not a fixed point`);
            }
            engine.Destroy();
        }
        return out;
    });
    expect(failures).toEqual([]);
});
