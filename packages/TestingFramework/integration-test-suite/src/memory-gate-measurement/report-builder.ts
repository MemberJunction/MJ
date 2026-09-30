/**
 * @fileoverview Renders memory note gate measurement reports (markdown and JSON)
 * containing IDs and metrics only, never raw scenario or note text.
 *
 * @module @memberjunction/integration-test-suite
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssertOutputOutsideRepo } from '@memberjunction/testing-engine';
import type { MeasurementReportJson, OperatingThresholdMetrics } from './corpus-types';

/** Formats a numeric value or returns '-' if null/undefined. */
function fmt(val: number | null | undefined, digits: number = 3): string {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    return val.toFixed(digits);
}

/** Formats a percentage value. */
function fmtPct(val: number | null | undefined): string {
    if (val === null || val === undefined || Number.isNaN(val)) return '-';
    return `${(val * 100).toFixed(1)}%`;
}

/** Renders markdown table for operating threshold metrics. */
function renderOperatingTable(points: readonly OperatingThresholdMetrics[]): string {
    const lines = [
        '| Threshold | Precision | Recall | F1 | Durable Kept | Ephemeral Kept | Wrong Kept | Speculative Kept |',
        '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |'
    ];

    for (const p of points) {
        lines.push(
            `| ${p.Threshold} | ${fmt(p.Precision)} | ${fmt(p.Recall)} | ${fmt(p.F1)} | ` +
            `${fmtPct(p.KeptShareByLabel.durable)} | ${fmtPct(p.KeptShareByLabel.ephemeral)} | ` +
            `${fmtPct(p.KeptShareByLabel.wrong)} | ${fmtPct(p.KeptShareByLabel.speculative)} |`
        );
    }

    return lines.join('\n');
}

/**
 * Renders the markdown measurement report.
 * Strict requirement: Scenario and note IDs only, never text!
 */
export function RenderMeasurementReportMarkdown(report: MeasurementReportJson): string {
    const modelsList = report.Models.length > 0 ? report.Models.join(', ') : 'None';
    const ciRaw = report.DecisionRawArm.AucBootstrapCi
        ? ` [${fmt(report.DecisionRawArm.AucBootstrapCi.Low)}, ${fmt(report.DecisionRawArm.AucBootstrapCi.High)}]`
        : '';
    const ciCal = report.DecisionCalibratedArm.AucBootstrapCi
        ? ` [${fmt(report.DecisionCalibratedArm.AucBootstrapCi.Low)}, ${fmt(report.DecisionCalibratedArm.AucBootstrapCi.High)}]`
        : '';

    const plattLines = Object.entries(report.FittedPlattByModel)
        .map(([m, p]) => `- **${m}**: A = ${fmt(p.A, 4)}, B = ${fmt(p.B, 4)}`)
        .join('\n');

    return `# Memory Note Decision Gate Measurement Report

**Generated:** ${report.GeneratedAt}
**Scenarios:** ${report.ScenarioCount}
**Candidate Notes:** ${report.NoteCount} (Durable: ${report.LabelDistribution.durable}, Ephemeral: ${report.LabelDistribution.ephemeral}, Wrong: ${report.LabelDistribution.wrong}, Speculative: ${report.LabelDistribution.speculative})
**Evaluated Models:** ${modelsList}
**Reps:** ${report.Reps}

---

## 1. Executive Summary: AUC Comparison

| Arm | AUC | 95% Bootstrap CI | Notes |
| :--- | :--- | :--- | :--- |
| **Proxy Self-Report (Baseline)** | ${fmt(report.SelfConfidenceArm.Auc)} | - | 0-100 score normalized |
| **Decision Gate (Raw)** | ${fmt(report.DecisionRawArm.Auc)} | ${ciRaw.trim() || '-'} | Direct Likelihood output |
| **Decision Gate (Calibrated)** | ${fmt(report.DecisionCalibratedArm.Auc)} | ${ciCal.trim() || '-'} | 5-fold out-of-fold Platt, whole scenarios per fold |

## 2. Model Calibration (Fitted Platt Parameters)

${plattLines.length > 0 ? plattLines : '_No model calibrations fitted._'}

## 3. Telemetry & Repeatability

- **Latency:** p50 = ${fmt(report.Latency.P50Ms, 1)} ms, p95 = ${fmt(report.Latency.P95Ms, 1)} ms
- **Estimated Cost:** $${fmt(report.CostPerThousandNotesUsd, 4)} per 1,000 notes
- **Repeatability Agreement:** ${fmtPct(report.RepeatabilityAgreement)} (the shipped verdict: each model's Platt fit on all points, kept at a calibrated ${report.RepeatabilityThreshold})

## 4. Not Scored

None of these enters a fit, a sweep or an AUC; a failed or missing answer is not a low one.

- **Failed decision calls:** ${report.Exclusions.FailedCalls} (one per scenario and rep)
- **Notes without a usable answer, per rep:** ${report.Exclusions.NoAnswer}
- **Notes left out, no usable answer in any rep:** ${report.Exclusions.UnscoredNotes}
- **Notes left out, no label:** ${report.Exclusions.UnlabelledNotes}

---

## 5. Operating Points: Proxy Self-Report Scorer (>= 80)

A separate scoring call with its own rubric, not the Memory Manager's Extract Notes template and its skip rules.

${renderOperatingTable(report.SelfConfidenceArm.OperatingPoints)}

---

## 6. Operating Points: Decision Gate (Raw Likelihood)

${renderOperatingTable(report.DecisionRawArm.OperatingPoints)}

---

## 7. Operating Points: Decision Gate (Platt Calibrated)

${report.DecisionCalibratedArm.OperatingPoints.length > 0
        ? renderOperatingTable(report.DecisionCalibratedArm.OperatingPoints)
        : '_Too few scenarios to calibrate out of fold._'}
`;
}

/**
 * Writes report.json and report.md to target directory outside repository.
 */
export function WriteMeasurementReportFiles(
    outDir: string,
    report: MeasurementReportJson,
    repoRoots: readonly string[] = []
): { jsonPath: string; mdPath: string } {
    const checkedOutDir = AssertOutputOutsideRepo(outDir, repoRoots);
    mkdirSync(checkedOutDir, { recursive: true });

    const jsonPath = join(checkedOutDir, 'report.json');
    const mdPath = join(checkedOutDir, 'report.md');

    writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    writeFileSync(mdPath, RenderMeasurementReportMarkdown(report), 'utf-8');

    return { jsonPath, mdPath };
}
