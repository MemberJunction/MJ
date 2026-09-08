/**
 * The replay script's two declarations must stay identical.
 *
 * `ComputerUseTrace` (what the engine records and replays) and
 * `MJTestEntity_IReplayScript` (what CodeGen emits from the JSONType) describe
 * one object in two packages. They have to: CodeGen inlines a JSONType verbatim
 * into `core-entities`, which sits below the engine package and can import
 * nothing from it. This package depends on both, so it is the only place they can
 * be compared.
 *
 * The failure mode is quiet — add a field to one and everything still compiles
 * and every runtime test still passes, while `ConfigurationObject` hands back a
 * property TypeScript says does not exist. Ordinary vitest transpiles without
 * typechecking, so these live in a `*.test-d.ts` checked by tsc.
 *
 * Both directions were confirmed to fail before this was committed, by renaming a
 * field and separately by making a required field optional. The second case works
 * only because this package sets `strict: true`.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { MJTestEntity_IReplayScript, MJTestEntity_ITestConfiguration } from '@memberjunction/core-entities';
import type { ComputerUseTrace } from '@memberjunction/computer-use';

describe('the stored replay script and the engine trace are the same type', () => {
    it('accepts a stored script wherever the engine wants a trace (the replay path)', () => {
        expectTypeOf<MJTestEntity_IReplayScript>().toExtend<ComputerUseTrace>();
    });

    it('accepts an engine trace wherever the row wants a script (the record path)', () => {
        expectTypeOf<ComputerUseTrace>().toExtend<MJTestEntity_IReplayScript>();
    });

    it('holds field-for-field, so neither side can add, drop, or retype in isolation', () => {
        expectTypeOf<MJTestEntity_IReplayScript>().toEqualTypeOf<ComputerUseTrace>();
    });
});

describe('Test.Configuration is typed the way the driver reads it', () => {
    it('types the script property as the script, not as a string or a loose object', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['ReplayScript']>()
            .toEqualTypeOf<MJTestEntity_IReplayScript | undefined>();
    });

    it('types the fallback switch as an optional boolean, so absent can mean "default true"', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['AllowLLMFallback']>()
            .toEqualTypeOf<boolean | undefined>();
    });

    it('carries each driver\'s own configuration through the index signature', () => {
        expectTypeOf<MJTestEntity_ITestConfiguration['someDriverSpecificKey']>().toEqualTypeOf<unknown>();
    });
});
