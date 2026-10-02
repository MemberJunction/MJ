/**
 * `DeleteOptionsInput.SkipRecordChanges` is optional on the wire.
 *
 * The field arrived in 6.1.0 as `Boolean!`. 5.51.x clients spell out every delete option in
 * `options___`, and none of them knows this field, so on 6.1.0 to 6.1.3 every such delete failed
 * schema validation with `Field "DeleteOptionsInput.SkipRecordChanges" of required type
 * "Boolean!" was not provided` (Izzy, 6.1 certification gate 5). The server never honours the
 * flag from the wire anyway (see SanitizeFromWire), so absent and `false` are the same request.
 *
 * These tests pin the built schema type, which is what a client's validation runs against, and the
 * sanitizer's behaviour on a 5.51-shaped request that omits the field entirely.
 */
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Arg, buildSchema, Mutation, Query, Resolver } from 'type-graphql';
import type { GraphQLInputObjectType } from 'graphql';
import { DeleteOptionsInput } from '../generic/DeleteOptionsInput.js';

@Resolver()
class ProbeResolver {
    // type-graphql refuses a schema with no Query type; the probe only needs the mutation.
    @Query(() => Boolean)
    Ping(): boolean {
        return true;
    }

    @Mutation(() => Boolean)
    Probe(@Arg('options___', () => DeleteOptionsInput) options: DeleteOptionsInput): boolean {
        return options.SkipRecordChanges === true;
    }
}

describe('DeleteOptionsInput wire shape', () => {
    it('builds SkipRecordChanges as optional with a false default, every other field required', async () => {
        const schema = await buildSchema({ resolvers: [ProbeResolver], validate: false });
        // Read the built type directly rather than printing the schema: printSchema runs
        // instanceOf checks that fail when type-graphql and the test resolve separate copies
        // of `graphql`, and the field objects carry everything the assertion needs.
        const input = schema.getType('DeleteOptionsInput') as GraphQLInputObjectType;
        expect(input).toBeDefined();
        const fields = input.getFields();
        expect(String(fields['SkipRecordChanges'].type)).toBe('Boolean');
        expect(fields['SkipRecordChanges'].defaultValue).toBe(false);
        for (const required of ['SkipEntityAIActions', 'SkipEntityActions', 'ReplayOnly', 'IsParentEntityDelete']) {
            expect(String(fields[required].type), required).toBe('Boolean!');
            expect(fields[required].defaultValue, required).toBeUndefined();
        }
    });

    it('sanitizer treats a 5.51-shaped request that omits the field as the ordinary case', () => {
        const legacy = {
            SkipEntityAIActions: false,
            SkipEntityActions: true,
            ReplayOnly: false,
            IsParentEntityDelete: false,
        } as DeleteOptionsInput;
        const sanitized = DeleteOptionsInput.SanitizeFromWire(legacy, 'Customers', 'user@example.test');
        expect(sanitized).toBe(legacy);
        expect(sanitized.SkipRecordChanges).toBeUndefined();
        expect(sanitized.SkipEntityActions).toBe(true);
    });
});
