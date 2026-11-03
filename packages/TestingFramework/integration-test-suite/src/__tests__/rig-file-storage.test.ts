/**
 * rig-file-storage.test.ts — every rig that trains a Predictive Studio model makes an active File Storage Provider
 * available the way the gate harness does, and puts it back afterwards.
 *
 * Training stores its artifacts through the active `MJ: File Storage Providers` row; a database with none active
 * refuses the artifact save ("Provider ID cannot be null"). The gates get one from the truth-suite harness
 * (`HarnessFileStorage.EnsureActive` when the harness connects, `HarnessFileStorage.Restore` at cleanup), which switches
 * one on only on a private truth-suite database. The rigs reach the same helper through `rigs/lib/rig-storage.ts`, so
 * there is one mechanism. `tsc` cannot see a rig that forgot to call it, so this test reads the sources.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const RIGS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../rigs');

/** Calls that train a model, in-process or through MJAPI. */
const TRAINS = /TrainBoundPipeline\(|TrainingDelegation\.TrainModelViaEngine\(|PredictiveStudioPipelineBuilder\(\)\.Build\(|new AgentRunner\(\)|PredictiveStudioTrainModelOperation\(\)\.Execute\(/;

function rigSource(name: string): string {
    return readFileSync(join(RIGS_DIR, name), 'utf8');
}

/** The top-level rig scripts that train. */
function trainingRigs(): string[] {
    return readdirSync(RIGS_DIR).filter((f) => f.endsWith('.ts') && TRAINS.test(rigSource(f))).sort();
}

describe('rigs that train make a File Storage Provider available', () => {
    it('finds the training rigs', () => {
        expect(trainingRigs().length).toBeGreaterThanOrEqual(12);
    });

    it.each(trainingRigs())('%s switches storage on through RigStorage and restores it', (rig) => {
        const source = rigSource(rig);
        expect(source, `${rig} does not call RigStorage.Activate`).toMatch(/RigStorage\.Activate\(/);
        expect(source, `${rig} does not call RigStorage.Restore`).toMatch(/RigStorage\.Restore\(/);
    });

    it('RigStorage delegates to the gate harness helper and sets no IsActive of its own', () => {
        const source = readFileSync(join(RIGS_DIR, 'lib/rig-storage.ts'), 'utf8');
        expect(source).toMatch(/HarnessFileStorage\.EnsureActive\(/);
        expect(source).toMatch(/HarnessFileStorage\.Restore\(/);
        expect(source).not.toMatch(/\.IsActive\s*=(?!=)/);
    });
});
