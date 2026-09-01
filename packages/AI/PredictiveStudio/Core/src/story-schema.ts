/**
 * @module story-schema
 *
 * Runtime (zod) validator for the LLM-authored {@link ModelStory} — the trust boundary between the
 * one generative step in the promotion path and everything that persists it.
 *
 * The story is prose, so most of what could go wrong is unverifiable. Two things are not, and both
 * are checked here:
 *
 *  1. **Every `InstanceID` must be one of the components that actually exist.** A story attributing
 *     a contribution to a component id the model does not have would attach meaning to the wrong
 *     row — or to nothing — and a later reuse search would surface it as if it were real. This is
 *     the refine that makes the whole story trustworthy as a data structure.
 *  2. **Caveats must not be empty.** Every model has limits; a story that omits them is marketing,
 *     and the one place a business user most needs the truth is the moment a model is published.
 */

import { z } from 'zod';
import type { ModelStory } from './story-spec';

/** zod schema for one component's contribution. */
export const ComponentStoryContributionSchema = z
  .object({
    Role: z.enum(['primary-driver', 'supporting', 'modifier', 'structural', 'marginal'], {
      required_error: 'each contribution needs a Role',
    }),
    Weight: z.number().min(0).max(1).optional(),
    Evidence: z
      .string({ required_error: 'each contribution needs Evidence — the measured fact behind the role' })
      .min(1, 'each contribution needs Evidence — the measured fact behind the role'),
    ReusePotential: z.enum(['high', 'medium', 'low'], { required_error: 'each contribution needs a ReusePotential' }),
    ReuseWhen: z
      .string({ required_error: 'each contribution needs ReuseWhen — when someone else would want this' })
      .min(1, 'each contribution needs ReuseWhen — when someone else would want this'),
  })
  .strip();

/** zod schema for one component's story. */
export const ComponentStorySchema = z
  .object({
    InstanceID: z.string({ required_error: 'each component story must name its InstanceID' }).uuid('InstanceID must be a component id'),
    Headline: z.string({ required_error: 'each component story needs a Headline' }).min(1, 'each component story needs a Headline'),
    Story: z.string({ required_error: 'each component story needs a Story' }).min(1, 'each component story needs a Story'),
    Contribution: ComponentStoryContributionSchema,
  })
  .strip();

/** zod schema for the whole {@link ModelStory}, before the instance-id cross-check. */
export const ModelStorySchema = z
  .object({
    Headline: z.string({ required_error: 'Headline is required' }).min(1, 'Headline is required'),
    Story: z.string({ required_error: 'Story is required' }).min(1, 'Story is required'),
    DataStory: z.string({ required_error: 'DataStory is required' }).min(1, 'DataStory is required'),
    BusinessConnection: z
      .string({ required_error: 'BusinessConnection is required' })
      .min(1, 'BusinessConnection is required'),
    Components: z.array(ComponentStorySchema).default([]),
    Caveats: z
      .array(z.string().min(1))
      .min(1, 'Caveats must not be empty — every model has limits, and a story that omits them is marketing'),
    TrustGrade: z.string({ required_error: 'TrustGrade is required' }).min(1, 'TrustGrade is required'),
  })
  .strip();

/** Discriminated result of validating a story payload. */
export type StoryValidationResult = { ok: true; value: ModelStory } | { ok: false; error: string };

/**
 * Validate an untrusted value as a {@link ModelStory}, additionally proving every `InstanceID` is
 * one of `knownInstanceIds`.
 *
 * The id check is the load-bearing one: prose cannot be verified, but attribution can. A story that
 * hangs a contribution on an id the model does not have would write meaning onto the wrong row, and
 * a later reuse-by-meaning search would surface it as though it were real.
 *
 * @param raw the untrusted payload
 * @param knownInstanceIds the component instance ids that actually exist for this model. Pass an
 *   empty array to skip the cross-check (the story is then only shape-validated) — used when a
 *   caller genuinely has no component rows, e.g. a model trained before materialization existed.
 */
export function validateModelStory(raw: unknown, knownInstanceIds: readonly string[] = []): StoryValidationResult {
  const parsed = ModelStorySchema.safeParse(raw);
  if ('error' in parsed && parsed.error) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.length ? i.path.join('.') + ': ' : ''}${i.message}`)
      .join('; ');
    return { ok: false, error: issues };
  }

  const story = parsed.data as ModelStory;
  if (knownInstanceIds.length > 0) {
    const known = new Set(knownInstanceIds.map((id) => id.toLowerCase()));
    const unknown = story.Components.filter((c) => !known.has(c.InstanceID.toLowerCase())).map((c) => c.InstanceID);
    if (unknown.length > 0) {
      return {
        ok: false,
        error:
          `the story attributes contributions to component id(s) this model does not have: ${unknown.join(', ')}. ` +
          `Every InstanceID must be one of the model's materialized components.`,
      };
    }
  }

  return { ok: true, value: story };
}
