/**
 * Type-level tests for CodeGen-emitted related-record collections.
 *
 * ## Why these exist
 *
 * CodeGen emits a collection's element type from `EntityRelationship.RelatedEntityClassName`:
 *
 * ```typescript
 * public readonly Params = this.DeclareRelatedRecords<MJActionParamEntity>({ … });
 * ```
 *
 * That generic is the entire type story. Everything a caller touches — `Items`, `Create()`, `Add()`,
 * iteration, `Removed` — is parameterized on it. If the generator ever emits the wrong symbol, or
 * `BaseEntity`, or the declaration is dropped, **runtime tests keep passing**: the code still runs,
 * it just stops being typed. Callers silently lose IntelliSense and compile-time checking, and the
 * first symptom is a field typo shipping to production.
 *
 * That is not hypothetical. The emitter's first version used `RelatedEntityClassName` verbatim
 * (`MJActionParam`) rather than the generated class (`MJActionParamEntity`). Thirty fixture-based
 * generator tests passed, because the fixture pre-suffixed its input the way real metadata never
 * does. The break only surfaced when CodeGen ran against a live database.
 *
 * Ordinary vitest transpiles without typechecking, so a `.test.ts` could not catch any of this.
 * These are `*.test-d.ts` files, checked by tsc via `typecheck` in `vitest.config.ts`.
 *
 * ## What is asserted
 *
 * The four core collections shipped in 6.2, chosen to cover every axis:
 *
 * | Collection | Covers |
 * |---|---|
 * | `MJActionEntity.Params` | cache-sourced, read-only, lazy |
 * | `MJAIAgentEntity.Prompts` | database-sourced, writable, sequenced |
 * | `MJAIAgentEntity.SubAgents` | **self-referential** — element type is the parent's own type |
 * | `MJAPIKeyEntity.Scopes` | a third entity, so a single wrong shared type cannot satisfy them all |
 */
import { describe, it, expectTypeOf } from 'vitest';
import { BaseEntity } from '@memberjunction/core';
import type { RelatedRecordCollection } from '@memberjunction/core';
import {
    MJActionEntity,
    MJActionParamEntity,
    MJAIAgentEntity,
    MJAIAgentPromptEntity,
    MJAPIKeyEntity,
    MJAPIKeyScopeEntity,
} from '../generated/entity_subclasses';

describe('generated related-record collections are strongly typed', () => {
    it('declares the collection as RelatedRecordCollection of the SPECIFIC related entity', () => {
        expectTypeOf<MJActionEntity['Params']>().toEqualTypeOf<RelatedRecordCollection<MJActionParamEntity>>();
        expectTypeOf<MJAIAgentEntity['Prompts']>().toEqualTypeOf<RelatedRecordCollection<MJAIAgentPromptEntity>>();
        expectTypeOf<MJAPIKeyEntity['Scopes']>().toEqualTypeOf<RelatedRecordCollection<MJAPIKeyScopeEntity>>();
    });

    it('never degrades to BaseEntity — the regression this file exists to catch', () => {
        // `RelatedRecordCollection<BaseEntity>` is what a dropped or mis-resolved generic produces,
        // and it is assignable-looking enough to pass unnoticed without an explicit assertion.
        expectTypeOf<MJActionEntity['Params']>().not.toEqualTypeOf<RelatedRecordCollection<BaseEntity>>();
        expectTypeOf<MJAIAgentEntity['Prompts']>().not.toEqualTypeOf<RelatedRecordCollection<BaseEntity>>();
    });

    it('never degrades to any', () => {
        expectTypeOf<MJActionEntity['Params']>().not.toBeAny();
        expectTypeOf<MJActionEntity['Params']['Items']>().not.toBeAny();
    });

    it('keeps distinct entities distinct — one shared type cannot satisfy them all', () => {
        expectTypeOf<MJActionEntity['Params']>().not.toEqualTypeOf<MJAIAgentEntity['Prompts']>();
        expectTypeOf<MJAPIKeyEntity['Scopes']>().not.toEqualTypeOf<MJActionEntity['Params']>();
    });

    it('types a SELF-REFERENTIAL collection as the parent entity itself', () => {
        // SubAgents joins MJ: AI Agents to itself via ParentID. A generator that resolved the
        // element type from the wrong side of the relationship would land somewhere else entirely.
        expectTypeOf<MJAIAgentEntity['SubAgents']>().toEqualTypeOf<RelatedRecordCollection<MJAIAgentEntity>>();
    });
});

describe('the collection API surface carries the element type through', () => {
    it('Items is a readonly array of the element type', () => {
        expectTypeOf<MJActionEntity['Params']['Items']>().toEqualTypeOf<readonly MJActionParamEntity[]>();
        // Readonly is load-bearing: a mutable array would let a caller push around the removal
        // tracking, FK stamping and sequence renumbering the collection exists to guarantee.
        expectTypeOf<MJActionEntity['Params']['Items']>().not.toEqualTypeOf<MJActionParamEntity[]>();
    });

    it('Removed is a readonly array of the element type', () => {
        expectTypeOf<MJAIAgentEntity['Prompts']['Removed']>().toEqualTypeOf<readonly MJAIAgentPromptEntity[]>();
    });

    it('Create() resolves to the element type, not a base class', () => {
        expectTypeOf<MJAIAgentEntity['Prompts']['Create']>().returns.resolves.toEqualTypeOf<MJAIAgentPromptEntity>();
    });

    it('Add() accepts and returns the element type', () => {
        expectTypeOf<MJAIAgentEntity['Prompts']['Add']>().parameter(0).toEqualTypeOf<MJAIAgentPromptEntity>();
        expectTypeOf<MJAIAgentEntity['Prompts']['Add']>().returns.toEqualTypeOf<MJAIAgentPromptEntity>();
    });

    it('Remove() accepts the element type or an index', () => {
        expectTypeOf<MJAIAgentEntity['Prompts']['Remove']>().parameter(0).toEqualTypeOf<MJAIAgentPromptEntity | number>();
    });

    it('iteration yields the element type — spread and for…of stay typed', () => {
        type Iterated = MJActionEntity['Params'] extends Iterable<infer E> ? E : never;
        expectTypeOf<Iterated>().toEqualTypeOf<MJActionParamEntity>();
        expectTypeOf<Iterated>().not.toEqualTypeOf<BaseEntity>();
    });

    it('length and Count are numbers', () => {
        expectTypeOf<MJActionEntity['Params']['length']>().toEqualTypeOf<number>();
        expectTypeOf<MJActionEntity['Params']['Count']>().toEqualTypeOf<number>();
    });
});

describe('element types keep their own generated fields and value-list unions', () => {
    it('exposes fields unique to the related entity', () => {
        expectTypeOf<MJActionParamEntity['ValueType']>().not.toBeNever();
        expectTypeOf<MJAIAgentPromptEntity['ExecutionOrder']>().toEqualTypeOf<number>();
    });

    it('preserves the CodeGen value-list union rather than widening to string', () => {
        // A widened `string` here would mean the generated union stopped flowing through the
        // collection — the same class of silent loss as degrading to BaseEntity.
        expectTypeOf<MJActionParamEntity['ValueType']>().not.toEqualTypeOf<string>();
    });

    it('a collection element and a directly-obtained entity are the same type', () => {
        type FromCollection = MJActionEntity['Params']['Items'][number];
        expectTypeOf<FromCollection>().toEqualTypeOf<MJActionParamEntity>();
    });
});
