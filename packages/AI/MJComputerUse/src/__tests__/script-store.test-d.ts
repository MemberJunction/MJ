/**
 * Type-level tests: the replay script's two declarations must stay identical.
 *
 * ## Why these exist
 *
 * The script shape is declared twice, and has to be:
 *
 *  - `ComputerUseTrace` in `@memberjunction/computer-use` — what the engine records
 *    and replays.
 *  - `MJTestEntity_ITestJSONScript` in `@memberjunction/core-entities` — what CodeGen
 *    emits from the JSONType definition at
 *    `metadata/entities/JSONType-interfaces/ITestConfiguration.ts`.
 *
 * CodeGen inlines a JSONType definition verbatim into `core-entities`, which sits
 * below the engine package and can import nothing from it, so the second declaration
 * cannot simply reference the first. This package depends on both, which makes it the
 * only place the two can be compared at all.
 *
 * The failure mode is quiet. Add a field to `ComputerUseTrace` and forget the JSONType,
 * and everything still compiles and every runtime test still passes — the recorder
 * writes the field, the JSON column stores it, and `ConfigurationObject` hands it back
 * as a property TypeScript says does not exist. Callers lose the field silently.
 *
 * Ordinary vitest transpiles without typechecking, so a `.test.ts` cannot catch that.
 * This is a `*.test-d.ts`, checked by tsc via `typecheck` in `vitest.config.ts`, and
 * checked again by the package build (the build tsconfig includes `src/**` and this
 * package sets `strict: true`).
 *
 * ## Verified, not assumed
 *
 * Both directions were confirmed to fail before being committed, by renaming `TestId`
 * to `TestIdRENAMED` in the generated interface, and separately by making the required
 * `GoalHash` optional. `strict: true` is what makes the second case work — under a
 * package without `strictNullChecks`, required-vs-optional drift would pass silently.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { MJTestEntity_ITestJSONScript, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import type { ComputerUseTrace } from '@memberjunction/computer-use';

describe('the stored replay script and the engine trace are the same type', () => {
    it('accepts a stored script wherever the engine wants a trace (the replay path)', () => {
        expectTypeOf<MJTestEntity_ITestJSONScript>().toExtend<ComputerUseTrace>();
    });

    it('accepts an engine trace wherever the row wants a script (the record path)', () => {
        expectTypeOf<ComputerUseTrace>().toExtend<MJTestEntity_ITestJSONScript>();
    });

    it('holds field-for-field, so neither side can add, drop, or retype in isolation', () => {
        expectTypeOf<MJTestEntity_ITestJSONScript>().toEqualTypeOf<ComputerUseTrace>();
    });
});

describe('Test.Configuration is typed the way the driver reads it', () => {
    it('types the script property as the script, not as a string or a loose object', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['TestJSONScript']>()
            .toEqualTypeOf<MJTestEntity_ITestJSONScript | undefined>();
    });

    it('types the fallback switch as an optional boolean, so absent can mean "default true"', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['AllowLLMFallback']>()
            .toEqualTypeOf<boolean | undefined>();
    });

    it('carries each driver\'s own configuration through the index signature', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['someDriverSpecificKey']>().toEqualTypeOf<unknown>();
    });
});
