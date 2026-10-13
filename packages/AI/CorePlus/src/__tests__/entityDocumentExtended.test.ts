import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {
        ContextCurrentUser: null;
        Fields: [];
        Get(_fieldName: string) { return ''; }
        Set(_fieldName: string, _value: unknown) {}
        get Dirty() { return false; }
        async LoadFromData(_data: unknown) { return true; }
        async InnerLoad(_key: unknown) { return true; }
    },
    CompositeKey: class CompositeKey {},
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string, b: string) => a === b,
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJEntityDocumentEntity: class MJEntityDocumentEntity {
        TemplateID: string | null = null;
        Get(_fieldName: string) { return ''; }
        Set(_fieldName: string, _value: unknown) {}
        get Dirty() { return false; }
        async LoadFromData(_data: unknown) { return true; }
        async InnerLoad(_key: unknown) { return true; }
    },
}));

const { contents } = vi.hoisted(() => ({
    contents: [] as Array<{ ID: string; TemplateID: string; TemplateText: string; Priority: number; __mj_UpdatedAt: Date }>,
}));
vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            TemplateContents: contents,
            /** The row the template renders: the lowest Priority (the real selection is tested in MJCoreEntities). */
            FindRenderedContent: (templateID: string) => contents.filter((c) => c.TemplateID === templateID).sort((a, b) => a.Priority - b.Priority)[0],
        },
    },
}));

import type { EntityInfo } from '@memberjunction/core';
import { MJEntityDocumentEntityExtended } from '../MJEntityDocumentEntityExtended';

/** The mocked base class ignores its entity metadata; the real constructor requires one. */
const UNUSED_ENTITY_INFO = {} as EntityInfo;

describe('MJEntityDocumentEntityExtended', () => {
    let ed: MJEntityDocumentEntityExtended;

    beforeEach(() => {
        ed = new MJEntityDocumentEntityExtended(UNUSED_ENTITY_INFO);
        // Reset the shared mock cache between tests so cross-test leakage
        // can't make `LoadTemplateText` see stale content.
        contents.length = 0;
    });

    describe('TemplateText virtual property', () => {
        it('defaults to empty string', () => {
            expect(ed.TemplateText).toBe('');
        });

        it('round-trips through getter/setter', () => {
            ed.TemplateText = 'Hello {{Name}}';
            expect(ed.TemplateText).toBe('Hello {{Name}}');
        });
    });

    describe('TemplateTextDirty', () => {
        it('is false when TemplateText has not changed', () => {
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('is true after assigning a new TemplateText', () => {
            ed.TemplateText = 'New text';
            expect(ed.TemplateTextDirty).toBe(true);
        });
    });

    describe('Set() routes TemplateText into the virtual property', () => {
        it('routes "TemplateText" exactly', () => {
            ed.Set('TemplateText', 'Routed');
            expect(ed.TemplateText).toBe('Routed');
        });

        it('routes case-insensitively', () => {
            ed.Set('templatetext', 'lowercase');
            expect(ed.TemplateText).toBe('lowercase');
        });

        it('routes with leading/trailing whitespace in field name', () => {
            ed.Set('  TemplateText  ', 'trimmed');
            expect(ed.TemplateText).toBe('trimmed');
        });
    });

    describe('Dirty override', () => {
        it('returns false on a freshly-constructed instance', () => {
            expect(ed.Dirty).toBe(false);
        });

        it('returns true when TemplateText has been changed', () => {
            ed.TemplateText = 'Dirty content';
            expect(ed.Dirty).toBe(true);
        });
    });

    describe('LoadFromData hydrates TemplateText from the template cache', () => {
        it('loads the content the template renders (highest priority), not the oldest row', async () => {
            contents.push({ ID: 'c-old', TemplateID: 'tmpl-1', TemplateText: 'oldest, priority 2', Priority: 2, __mj_UpdatedAt: new Date('2026-01-01') });
            contents.push({ ID: 'c-new', TemplateID: 'tmpl-1', TemplateText: 'rendered, priority 1', Priority: 1, __mj_UpdatedAt: new Date('2026-02-01') });

            ed.TemplateID = 'tmpl-1';
            await ed.LoadFromData({});

            expect(ed.TemplateText).toBe('rendered, priority 1');
            // Snapshot must align so the next mutation cleanly marks dirty.
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('leaves TemplateText empty when no TemplateID is set', async () => {
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('');
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('leaves TemplateText empty when TemplateID has no matching content', async () => {
            ed.TemplateID = 'tmpl-missing';
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('');
        });

        it('clears the text on a reload whose template no longer has content', async () => {
            contents.push({ ID: 'c-1', TemplateID: 'tmpl-1', TemplateText: 'v1', Priority: 1, __mj_UpdatedAt: new Date('2026-01-01') });
            ed.TemplateID = 'tmpl-1';
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('v1');
            contents.length = 0; // the content row was deleted and the engine reloaded
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('');
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('reads through to an edited Template Content without reloading the document, and keeps an unsaved edit', async () => {
            contents.push({ ID: 'c-1', TemplateID: 'tmpl-1', TemplateText: 'v1', Priority: 1, __mj_UpdatedAt: new Date('2026-01-01') });
            ed.TemplateID = 'tmpl-1';
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('v1');
            contents[0] = { ...contents[0], TemplateText: 'v2', __mj_UpdatedAt: new Date('2026-01-02') }; // the engine reloaded
            expect(ed.TemplateText).toBe('v2');
            expect(ed.TemplateTextDirty).toBe(false);
            ed.TemplateText = 'local edit';
            contents[0] = { ...contents[0], TemplateText: 'v3', __mj_UpdatedAt: new Date('2026-01-03') };
            expect(ed.TemplateText).toBe('local edit');
        });
    });
});
