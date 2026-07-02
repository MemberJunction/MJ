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

vi.mock('@memberjunction/templates-base-types', () => ({
    TemplateEngineBase: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
            TemplateContents: [] as Array<{ TemplateID: string; TemplateText: string; __mj_CreatedAt: Date }>,
        },
    },
}));

import { MJEntityDocumentEntityExtended } from '../MJEntityDocumentEntityExtended';
import { TemplateEngineBase } from '@memberjunction/templates-base-types';

describe('MJEntityDocumentEntityExtended', () => {
    let ed: MJEntityDocumentEntityExtended;

    beforeEach(() => {
        ed = new MJEntityDocumentEntityExtended();
        // Reset the shared mock cache between tests so cross-test leakage
        // can't make `LoadTemplateText` see stale content.
        (TemplateEngineBase.Instance.TemplateContents as unknown as unknown[]).length = 0;
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
        it('loads the oldest matching TemplateContent when TemplateID is set', async () => {
            const cache = TemplateEngineBase.Instance.TemplateContents as unknown as Array<{
                TemplateID: string; TemplateText: string; __mj_CreatedAt: Date;
            }>;
            cache.push({ TemplateID: 'tmpl-1', TemplateText: 'newer', __mj_CreatedAt: new Date('2026-02-01') });
            cache.push({ TemplateID: 'tmpl-1', TemplateText: 'oldest', __mj_CreatedAt: new Date('2026-01-01') });

            (ed as unknown as { TemplateID: string }).TemplateID = 'tmpl-1';
            await ed.LoadFromData({});

            expect(ed.TemplateText).toBe('oldest');
            // Snapshot must align so the next mutation cleanly marks dirty.
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('leaves TemplateText empty when no TemplateID is set', async () => {
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('');
            expect(ed.TemplateTextDirty).toBe(false);
        });

        it('leaves TemplateText empty when TemplateID has no matching content', async () => {
            (ed as unknown as { TemplateID: string }).TemplateID = 'tmpl-missing';
            await ed.LoadFromData({});
            expect(ed.TemplateText).toBe('');
        });
    });
});
