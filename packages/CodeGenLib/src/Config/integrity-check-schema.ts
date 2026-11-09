import { z } from 'zod';

// Its own file so the test can read the schema without `index.ts` (which re-exports all of
// `config.ts`) publishing it as package API.
export const IntegrityCheckConfigSchema = z.object({
  /**
   * Master switch for the integrity checks. When false no check runs, and `runCodeGen` warns rather
   * than ticking green — nothing was measured, which is not the same claim as "everything passed".
   *
   * There is deliberately NO `failOnError` knob here. A failing integrity check always fails the
   * run (see `runCodeGen`): these checks report `EntityField` Sequence drift, which corrupts the
   * column ordering that `spCreate`/`spUpdate` depend on, so there is no state of the world in
   * which a caller wants the finding reported and the run still green. Turning the checks off is
   * the supported way to opt out, and it says so in the output instead of passing silently.
   */
  enabled: z.boolean(),
  entityFieldsSequenceCheck: z.boolean(),
});
