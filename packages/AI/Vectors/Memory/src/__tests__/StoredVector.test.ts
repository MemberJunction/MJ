import { describe, it, expect } from 'vitest';
import { Float32VectorToBase64 } from '@memberjunction/global';
import { DecodeVectorBinary, ParseVectorJSON, ReadStoredVector } from '../models/StoredVector';

/**
 * `StoredVector` — reading the two persisted forms of an embedding (binary float32 column and JSON
 * column). These helpers are the single rule every vector reader in MJ follows, so the validity
 * cases below are deliberately exhaustive: a reader that accepts a NaN, or rejects a good value,
 * silently degrades every similarity search built on it.
 */
describe('StoredVector', () => {
    describe('ParseVectorJSON', () => {
        it('parses a JSON array of finite numbers', () => {
            expect(ParseVectorJSON('[0.5,-1,2e-3]')).toEqual([0.5, -1, 0.002]);
        });

        it.each([
            ['null', null],
            ['undefined', undefined],
            ['the empty string', ''],
        ])('returns null for %s', (_label, value) => {
            expect(ParseVectorJSON(value)).toBeNull();
        });

        it.each([
            ['malformed JSON', '{not json'],
            ['a JSON object', '{"a":1}'],
            ['a JSON number', '3'],
            ['an empty array', '[]'],
            ['an array containing a string', '[1,"2",3]'],
            ['an array containing null', '[1,null]'],
            ['a nested array', '[[1,2]]'],
        ])('returns null for %s', (_label, value) => {
            expect(ParseVectorJSON(value)).toBeNull();
        });
    });

    describe('DecodeVectorBinary', () => {
        it('decodes base64 float32 bytes into a Float32Array', () => {
            const decoded = DecodeVectorBinary(Float32VectorToBase64([1, -0.5, 0.25]));
            expect(decoded).toBeInstanceOf(Float32Array);
            expect(Array.from(decoded ?? [])).toEqual([1, -0.5, 0.25]);
        });

        it('round-trips a 1,536-dimension vector to float32 precision', () => {
            const source = Array.from({ length: 1536 }, (_, i) => Math.sin(i) / 3);
            const decoded = DecodeVectorBinary(Float32VectorToBase64(source));
            expect(decoded?.length).toBe(1536);
            expect(Array.from(decoded ?? [])).toEqual(Array.from(Float32Array.from(source)));
        });

        it.each([
            ['null', null],
            ['undefined', undefined],
            ['the empty string', ''],
            ['invalid base64', '!!not base64!!'],
            ['a byte count that is not a multiple of 4', 'AAAAAP8='],
        ])('returns null for %s', (_label, value) => {
            expect(DecodeVectorBinary(value)).toBeNull();
        });

        it.each([NaN, Infinity, -Infinity])('returns null when the vector holds %s', bad => {
            expect(DecodeVectorBinary(Float32VectorToBase64([0, bad, 0]))).toBeNull();
        });
    });

    describe('ReadStoredVector', () => {
        it('prefers the binary column when both are valid', () => {
            const result = ReadStoredVector(Float32VectorToBase64([1, 0]), '[0,1]');
            expect(result).toBeInstanceOf(Float32Array);
            expect(Array.from(result ?? [])).toEqual([1, 0]);
        });

        it('falls back to JSON when the binary column is missing', () => {
            expect(ReadStoredVector(null, '[0,1]')).toEqual([0, 1]);
            expect(ReadStoredVector(undefined, '[0,1]')).toEqual([0, 1]);
        });

        it('falls back to JSON when the binary column is invalid, so corrupt bytes never hide a good copy', () => {
            expect(ReadStoredVector('garbage!', '[0,1]')).toEqual([0, 1]);
            expect(ReadStoredVector(Float32VectorToBase64([NaN]), '[0,1]')).toEqual([0, 1]);
        });

        it('returns null when neither column holds a usable vector', () => {
            expect(ReadStoredVector(null, null)).toBeNull();
            expect(ReadStoredVector('garbage!', '{not json')).toBeNull();
        });
    });
});
