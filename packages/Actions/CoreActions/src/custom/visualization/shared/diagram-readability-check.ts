/**
 * @fileoverview The optional browser-readability gate for archify diagrams.
 *
 * archify validates a spec's geometry, but only a real browser shows whether the page actually lays the
 * diagram out: fonts measured, every label given a size, no script error. This loads the standalone page
 * in the same headless Chromium that renders Mermaid and reports what is wrong, if anything.
 *
 * @module @memberjunction/actions-core/visualization
 */
import { MermaidRenderer } from './mermaid-renderer';

export type DiagramReadabilityResult =
    | { Checked: true; Problems: string[] }
    | { Checked: false; Reason: string };

/** What the page reports about the diagram it laid out. */
interface DiagramLayout {
    HasSvg: boolean;
    Width: number;
    Height: number;
    Labels: number;
    UnmeasuredLabels: number;
}

/** Loads `html` in headless Chromium and lists readability problems; `Checked: false` when no browser is available. */
export async function CheckDiagramReadability(html: string): Promise<DiagramReadabilityResult> {
    const errors: string[] = [];
    const run = await MermaidRenderer.Instance.WithIsolatedPage(async (page) => {
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setContent(html, { waitUntil: 'load' });
        return page.evaluate((): DiagramLayout => {
            const svg = document.querySelector('.diagram-container svg') ?? document.querySelector('svg');
            if (!svg) {
                return { HasSvg: false, Width: 0, Height: 0, Labels: 0, UnmeasuredLabels: 0 };
            }
            const box = svg.getBoundingClientRect();
            const labels = Array.from(svg.querySelectorAll('text')).filter((t) => (t.textContent ?? '').trim().length > 0);
            return {
                HasSvg: true,
                Width: box.width,
                Height: box.height,
                Labels: labels.length,
                UnmeasuredLabels: labels.filter((t) => t.getBBox().width === 0).length,
            };
        });
    });
    if (run.Success === false) {
        return { Checked: false, Reason: run.Message };
    }
    return { Checked: true, Problems: [...describeLayout(run.Value), ...errors.map((e) => `Page script error: ${e}`)] };
}

function describeLayout(layout: DiagramLayout): string[] {
    if (!layout.HasSvg) {
        return ['The page has no diagram SVG.'];
    }
    const problems: string[] = [];
    if (layout.Width === 0 || layout.Height === 0) {
        problems.push(`The diagram lays out at ${layout.Width}x${layout.Height}px.`);
    }
    if (layout.UnmeasuredLabels > 0) {
        problems.push(`${layout.UnmeasuredLabels} of ${layout.Labels} labels have no measured width.`);
    }
    return problems;
}
