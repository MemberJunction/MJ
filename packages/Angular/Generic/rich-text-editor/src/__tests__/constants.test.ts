import { describe, it, expect } from 'vitest';
import {
    BLOCK_TAGS,
    DEFAULT_BLOCK_TAG,
    FIX_CONTAINER_SKIP_TAGS,
    HEADING_TAGS,
    INLINE_TAGS,
    LEAF_TAGS,
    NON_BREAKING_SPACE,
    TAG_AFTER_SPLIT,
    ZERO_WIDTH_SPACE,
    ZERO_WIDTH_SPACE_PATTERN,
} from '../lib/engine/constants';

/**
 * These are invariant tests, not coverage filler. The tag tables are consulted on every
 * node classification, so a tag landing in two mutually-exclusive sets would produce a
 * misclassification that is very hard to trace back from the symptom.
 */
describe('engine constants', () => {
    describe('sentinel characters', () => {
        it('uses the real zero-width space code point', () => {
            expect(ZERO_WIDTH_SPACE).toHaveLength(1);
            expect(ZERO_WIDTH_SPACE.charCodeAt(0)).toBe(0x200b);
        });

        it('uses the real non-breaking space code point', () => {
            expect(NON_BREAKING_SPACE).toHaveLength(1);
            expect(NON_BREAKING_SPACE.charCodeAt(0)).toBe(0x00a0);
        });

        it('strips runs of zero-width spaces without touching ordinary text', () => {
            const input = `a${ZERO_WIDTH_SPACE}${ZERO_WIDTH_SPACE}b${ZERO_WIDTH_SPACE}c`;
            expect(input.replace(ZERO_WIDTH_SPACE_PATTERN, '')).toBe('abc');
        });

        it('keeps a global regex usable across calls', () => {
            // A global regex carries lastIndex; `replace` resets it but `test` does not.
            // Anything relying on this pattern must therefore use replace/match, not test.
            const subject = `x${ZERO_WIDTH_SPACE}`;
            expect(subject.replace(ZERO_WIDTH_SPACE_PATTERN, '')).toBe('x');
            expect(subject.replace(ZERO_WIDTH_SPACE_PATTERN, '')).toBe('x');
        });
    });

    describe('tag tables', () => {
        it('never classifies a tag as both inline and block', () => {
            const overlap = [...INLINE_TAGS].filter((tag) => BLOCK_TAGS.has(tag));
            expect(overlap).toEqual([]);
        });

        it('holds every tag in uppercase, matching Node.nodeName', () => {
            const tables = [INLINE_TAGS, BLOCK_TAGS, LEAF_TAGS, FIX_CONTAINER_SKIP_TAGS, HEADING_TAGS];
            for (const table of tables) {
                for (const tag of table) {
                    expect(tag).toBe(tag.toUpperCase());
                }
            }
        });

        it('only skips container-fixing for tags that are themselves block-level', () => {
            // A skip entry that is not a block tag would mean fixContainer is declining to
            // wrap children of something the node model considers inline — incoherent.
            const nonBlock = [...FIX_CONTAINER_SKIP_TAGS].filter((tag) => !BLOCK_TAGS.has(tag));
            expect(nonBlock).toEqual([]);
        });

        it('treats every heading as a block', () => {
            const nonBlock = [...HEADING_TAGS].filter((tag) => !BLOCK_TAGS.has(tag));
            expect(nonBlock).toEqual([]);
        });
    });

    describe('enter-key behavior', () => {
        it('drops out of a heading into the default block', () => {
            for (const heading of HEADING_TAGS) {
                expect(TAG_AFTER_SPLIT[heading]).toBeNull();
            }
        });

        it('stays in the same tag for list items and preformatted blocks', () => {
            expect(TAG_AFTER_SPLIT['LI']).toBe('LI');
            expect(TAG_AFTER_SPLIT['PRE']).toBe('PRE');
        });

        it('alternates definition-list terms and descriptions', () => {
            expect(TAG_AFTER_SPLIT['DT']).toBe('DD');
            expect(TAG_AFTER_SPLIT['DD']).toBe('DT');
        });

        it('defaults to a DIV block, which renders one line-height in every mail client', () => {
            expect(DEFAULT_BLOCK_TAG).toBe('DIV');
            expect(BLOCK_TAGS.has(DEFAULT_BLOCK_TAG)).toBe(true);
        });
    });
});
