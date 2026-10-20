/**
 * @fileoverview Unit tests for report rendering and strict record-text sanitization.
 *
 * Verifies that:
 * - RenderMarkdownReport and the report JSON hold record IDs only.
 * - Under NO circumstances does any record text (names, descriptions, values) leak into
 *   report.md or report.json.
 * - Out-of-repo path enforcement operates via AssertOutputOutsideRepo.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    AssertNoRecordTextInReport,
    BuildMeasurementReport,
    RenderMarkdownReport,
    WriteReportFiles,
} from '../../dupe-check-measurement/evaluator';
import type {
    CorpusRecord,
    RecordCheckObservation,
} from '../../dupe-check-measurement/types';

describe('Report Rendering and Text Sanitization', () => {
    // A mock corpus full of distinctive sensitive text
    const sensitiveCorpus: CorpusRecord[] = [
        {
            Id: 'rec-uuid-1111-2222-3333',
            Values: {
                Name: 'SecretInternalOperationAlpha',
                Description: 'Confidential Proprietary Workflow Details for Project Topaz',
            },
        },
        {
            Id: 'rec-uuid-4444-5555-6666',
            Values: {
                Name: 'UniqueCustomerRecordBeta',
                Description: 'Sensitive Financial Transaction Reconciliation Routine',
            },
        },
    ];

    const mockChecks: RecordCheckObservation[] = [
        {
            Rep: 1,
            RecordId: 'rec-uuid-1111-2222-3333',
            Label: { Id: 'rec-uuid-1111-2222-3333', Label: 'duplicate', SourceRecordId: 'cand-uuid-9999' },
            RetrievalLatencyMs: 40,
            PreparationLatencyMs: 90,
            ThresholdLatencyMs: 2,
            DecisionResult: {
                LatencyMs: 250,
                Model: 'test-model-4o',
                PromptRunId: 'pr-run-12345',
                CostUSD: 0.0035,
                Success: true,
                MissingAnswers: 0,
            },
            PromptResult: {
                LatencyMs: 450,
                PromptRunId: 'pr-run-67890',
                CostUSD: 0.012,
                Success: true,
                MissingAnswers: 0,
            },
            Candidates: [
                {
                    RecordId: 'rec-uuid-1111-2222-3333',
                    CandidateId: 'cand-uuid-9999',
                    IsDuplicatePair: true,
                    VectorScore: 0.92,
                    InTopK: true,
                    PassedThreshold: true,
                    ThresholdFlagged: true,
                    DecisionProbability: 0.88,
                    DecisionFlagged: true,
                    PromptRecommendation: 'Merge',
                    PromptFlagged: true,
                },
            ],
        },
    ];

    it('builds a report containing metrics and IDs, but ZERO record text', () => {
        const report = BuildMeasurementReport(mockChecks, {
            EntityName: 'MJ: Actions',
            CorpusPath: '/mock/outside/corpus',
            DuplicatesCount: 1,
            NewCount: 0,
            Reps: 1,
            TopK: 5,
            DecisionPrompt: 'Default Decision',
        });

        const mdContent = RenderMarkdownReport(report);
        const jsonContent = JSON.stringify(report, null, 2);

        // Assert that the record IDs ARE present
        expect(mdContent).toContain('MJ: Actions');

        // Assert that NONE of the sensitive record text appears in markdown
        expect(mdContent).not.toContain('SecretInternalOperationAlpha');
        expect(mdContent).not.toContain('Confidential Proprietary Workflow Details');
        expect(mdContent).not.toContain('Project Topaz');
        expect(mdContent).not.toContain('UniqueCustomerRecordBeta');
        expect(mdContent).not.toContain('Sensitive Financial Transaction');

        // Assert that NONE of the sensitive record text appears in json
        expect(jsonContent).not.toContain('SecretInternalOperationAlpha');
        expect(jsonContent).not.toContain('Confidential Proprietary Workflow Details');
        expect(jsonContent).not.toContain('Project Topaz');
        expect(jsonContent).not.toContain('UniqueCustomerRecordBeta');
        expect(jsonContent).not.toContain('Sensitive Financial Transaction');

        // Assert sanitization verification passes
        expect(() => AssertNoRecordTextInReport(mdContent, sensitiveCorpus)).not.toThrow();
        expect(() => AssertNoRecordTextInReport(jsonContent, sensitiveCorpus)).not.toThrow();
    });

    it('AssertNoRecordTextInReport catches and throws on accidental record text inclusion', () => {
        const dirtyReport = 'Here is a report mentioning SecretInternalOperationAlpha in the text.';
        expect(() => AssertNoRecordTextInReport(dirtyReport, sensitiveCorpus)).toThrow(
            /Sanitization violation: record text "SecretInternalOperationAlpha\.\.\." found/
        );
    });

    it('refuses writing report inside the repository', () => {
        const repoPath = join(process.cwd(), 'scratch-report-out');
        const report = BuildMeasurementReport(mockChecks, {
            EntityName: 'MJ: Actions',
            CorpusPath: '/mock/outside/corpus',
            DuplicatesCount: 1,
            NewCount: 0,
            Reps: 1,
            TopK: 5,
            DecisionPrompt: 'Default Decision',
        });

        expect(() => WriteReportFiles(repoPath, report, sensitiveCorpus)).toThrow(OutputInsideRepoError);
    });

    it('writes report.md and report.json outside the repository with sanitization check', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'mj-dupe-report-test-'));
        try {
            const report = BuildMeasurementReport(mockChecks, {
                EntityName: 'MJ: Actions',
                CorpusPath: '/mock/outside/corpus',
                DuplicatesCount: 1,
                NewCount: 0,
                Reps: 1,
                TopK: 5,
                DecisionPrompt: 'Default Decision',
            });

            WriteReportFiles(tempDir, report, sensitiveCorpus);

            const mdFile = join(tempDir, 'report.md');
            const jsonFile = join(tempDir, 'report.json');

            expect(existsSync(mdFile)).toBe(true);
            expect(existsSync(jsonFile)).toBe(true);

            const md = readFileSync(mdFile, 'utf-8');
            const json = readFileSync(jsonFile, 'utf-8');

            expect(md).toContain('# Duplicate Check Measurement: MJ: Actions');
            expect(json).toContain('"EntityName": "MJ: Actions"');

            // Neither file may contain any record text
            expect(md).not.toContain('SecretInternalOperationAlpha');
            expect(json).not.toContain('SecretInternalOperationAlpha');
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
