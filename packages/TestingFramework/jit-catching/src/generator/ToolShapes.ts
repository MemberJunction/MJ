import { z } from 'zod';

/** A mutant: one or more find/replace edits applied to base source files. */
export const MutantSchema = z.object({ Edits: z.array(z.object({ File: z.string(), Find: z.string(), Replace: z.string() })).min(1) });
/** Arguments of the run_test tool. */
export const RunTestShape = { File: z.string(), Mutant: MutantSchema.optional() };
/** Arguments of the write_test tool. */
export const WriteTestShape = { File: z.string(), Source: z.string() };
