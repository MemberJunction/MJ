/**
 * render.ts — renders a {@link MeasurementReport} as `report.md`.
 *
 * Pure: report in, markdown out. It prints only what the report holds (IDs, labels, numbers), and it
 * leaves the per-record rows to `report.json`.
 */
import type { MeasurementReport } from './report';
import { MEASURED_PIPELINE_TYPES } from './types';
import type { MeasuredPipelineType } from './types';

/** The whole markdown report. */
export function RenderReportMarkdown(report: MeasurementReport): string {
    return [
        renderSetup(report),
        renderHeadline(report),
        renderRecall(report),
        renderAgreement(report),
        renderCalibration(report),
        renderEscalation(report),
        renderNotes(report),
    ].join('\n\n') + '\n';
}

/** A rate as a percentage with one decimal, or `n/a`. */
export function FormatPercent(value: number | null): string {
    return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

/** A cost with six decimals and its currency, or `n/a`. */
export function FormatCost(value: number | null, currencies: readonly string[]): string {
    if (value === null) {
        return 'n/a';
    }
    const unit = currencies.length === 1 ? ` ${currencies[0]}` : currencies.length > 1 ? ` (mixed: ${currencies.join(', ')})` : '';
    return `${value.toFixed(6)}${unit}`;
}

function formatSeconds(ms: number | null): string {
    return ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
}

function formatMs(ms: number | null): string {
    return ms === null ? 'n/a' : `${Math.round(ms)} ms`;
}

function table(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
    const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
    return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function renderSetup(report: MeasurementReport): string {
    const s = report.Setup;
    const perValue = Object.entries(report.Sample.PerValue).map(([value, count]) => `${value} ${count}`).join(', ');
    return [
        `# Feature Pipeline type measurement: ${s.EntityName}.${s.LabelColumn}`,
        `Generated ${report.GeneratedAt}.`,
        table(['Setting', 'Value'], [
            ['Entity', s.EntityName], ['Label', `${s.LabelField} (column ${s.LabelColumn})`], ['Text fields', s.TextFields.join(', ')],
            ['Values', s.Values.join(', ')], ['Sample', `${report.Sample.Size} of ${s.RequestedSampleSize} requested (${perValue})`],
            ['Reps', String(s.Reps)], ['Seed', String(s.Seed)], ['Batch size', String(s.BatchSize)],
            ['LLM prompt', s.LLMPrompt], ['Decision prompt', s.DecisionPrompt],
        ]),
    ].join('\n\n');
}

function renderHeadline(report: MeasurementReport): string {
    const cell = (fn: (type: MeasuredPipelineType) => string): string[] => MEASURED_PIPELINE_TYPES.map(fn);
    const t = report.Types;
    const ci = (type: MeasuredPipelineType): string => {
        const interval = t[type].Accuracy.CI95;
        return interval ? `${FormatPercent(t[type].Accuracy.Accuracy)} (95% CI ${FormatPercent(interval.Low)} to ${FormatPercent(interval.High)})` : 'n/a';
    };
    return ['## Results', table(['Metric', ...MEASURED_PIPELINE_TYPES], [
        ['Accuracy against labels', ...cell(ci)],
        ['Accuracy per rep', ...cell((type) => t[type].Accuracy.PerRep.map(FormatPercent).join(', '))],
        ['Failed answers per rep', ...cell((type) => t[type].Accuracy.FailuresPerRep.join(', '))],
        ['Repeatability (rep 1 against rep 2)', ...cell((type) => FormatPercent(t[type].Repeatability))],
        ['Wall time per 1,000 records', ...cell((type) => formatSeconds(t[type].WallTime.MsPer1000))],
        ['Cost per 1,000 records', ...cell((type) => FormatCost(t[type].Cost.CostPer1000, t[type].Cost.Currencies))],
        ['Latency p50 / p90', ...cell((type) => `${formatMs(t[type].Latency.P50Ms)} / ${formatMs(t[type].Latency.P90Ms)}`)],
    ])].join('\n\n');
}

function renderRecall(report: MeasurementReport): string {
    const rows = report.Setup.Values.map((value, i) => [
        value,
        String(report.Types.LLM.Recall[i]?.Support ?? 0),
        ...MEASURED_PIPELINE_TYPES.map((type) => FormatPercent(report.Types[type].Recall[i]?.Recall ?? null)),
    ]);
    return ['## Recall per value', table(['Value', 'Records', ...MEASURED_PIPELINE_TYPES], rows)].join('\n\n');
}

function renderAgreement(report: MeasurementReport): string {
    const perRep = report.Agreement.PerRep.map((rate, i) => `rep ${i + 1}: ${FormatPercent(rate)}`).join(', ');
    return `## Agreement between the types\n\n${FormatPercent(report.Agreement.Mean)} on average (${perRep}).`;
}

function renderCalibration(report: MeasurementReport): string {
    const c = report.Calibration;
    const rows = c.Bins.filter((bin) => bin.Count > 0).map((bin) => [
        `${bin.Lower.toFixed(1)}–${bin.Upper.toFixed(1)}`, String(bin.Count), bin.MeanConfidence === null ? 'n/a' : bin.MeanConfidence.toFixed(3), FormatPercent(bin.Accuracy),
    ]);
    const ece = c.ECE === null ? 'n/a' : c.ECE.toFixed(4);
    return [
        '## Decision calibration',
        `ECE ${ece} over ${c.Points} answers with a confidence (${c.Excluded} without one are excluded).`,
        rows.length > 0 ? table(['Confidence', 'Answers', 'Mean confidence', 'Accuracy'], rows) : 'No answers had a confidence.',
    ].join('\n\n');
}

function renderEscalation(report: MeasurementReport): string {
    const currencies = report.Types.Decision.Cost.Currencies;
    const rows = report.Escalation.map((point) => [
        point.Floor.toFixed(2), FormatPercent(point.Accuracy), FormatPercent(point.EscalatedShare), FormatCost(point.CostPer1000, currencies),
    ]);
    return [
        '## Escalation simulation (plan 5.4)',
        'Decision\'s answer, or the same rep\'s LLM answer when Decision\'s confidence is below the floor.',
        table(['Floor', 'Hybrid accuracy', 'Escalated', 'Cost per 1,000'], rows),
    ].join('\n\n');
}

function renderNotes(report: MeasurementReport): string {
    return ['## Notes', report.Notes.map((note) => `- ${note}`).join('\n')].join('\n\n');
}
