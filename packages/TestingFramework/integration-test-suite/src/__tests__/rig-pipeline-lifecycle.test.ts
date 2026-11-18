/**
 * rig-pipeline-lifecycle.test.ts — every rig that creates its own ML Training Pipeline gives it a Prediction Unit and
 * Evaluation Protocol the way the gate harness does, and deletes what it created with the harness's cleanup.
 *
 * Training refuses a pipeline with no Prediction Unit (`unit-required`, `UNIT_REQUIRED` over the wire), and a run writes
 * a Training Snapshot, a unit and a protocol that a hand-written "runs → model → pipeline" cleanup leaves behind (the
 * snapshot's foreign key then makes the pipeline delete fail silently). The gates bind through the pipeline migration
 * (`PipelineMigration.EnsurePipelineUnitAndProtocol`, reached from the rigs through `lib/ps-rig-lifecycle.ts`) and
 * clean up through `HarnessCleanup.DeleteRecorded`. `tsc` cannot see a rig that skipped either, so this test reads the
 * sources.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RIGS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../rigs');

/** A rig that saves a new pipeline of its own (a pipeline entity object followed by `NewRecord()`; loading one is not creating it). */
const CREATES_PIPELINE = /GetEntityObject<MJMLTrainingPipelineEntity>\('MJ: ML Training Pipelines'[^;]*;\s*\w+\.NewRecord\(\)/;
/** The harness's ways of binding a unit and protocol. */
const BINDS = /BindUnitAndProtocol\(|TrainBoundPipeline\(|PipelineMigration\.(EnsurePipelineUnitAndProtocol|MigratePipelines)\(/;
/** The harness's cleanup, directly or through the rig lifecycle lib. */
const CLEANS_UP = /DeleteRecordedRows\(|HarnessCleanup\.DeleteRecorded\(/;

function rigSource(name: string): string {
    return readFileSync(join(RIGS_DIR, name), 'utf8');
}

function pipelineRigs(): string[] {
    return readdirSync(RIGS_DIR).filter((f) => f.endsWith('.ts') && CREATES_PIPELINE.test(rigSource(f))).sort();
}

describe('rigs that create a pipeline bind it and clean it up through the harness', () => {
    it('finds the pipeline-creating rigs', () => {
        expect(pipelineRigs().length).toBeGreaterThanOrEqual(9);
    });

    it.each(pipelineRigs())('%s binds a Prediction Unit and Evaluation Protocol through the harness path', (rig) => {
        expect(rigSource(rig)).toMatch(BINDS);
    });

    it.each(pipelineRigs())('%s deletes what it created through the harness cleanup', (rig) => {
        expect(rigSource(rig)).toMatch(CLEANS_UP);
    });
});
