import { describe, it, expect } from 'vitest';
import { ShortBadgeText, BadgeTextForAttachment } from '../lib/util/attachment-badge';
import type { MessageAttachment } from '../lib/components/message/message-item.component';

function makeAttachment(overrides: Partial<MessageAttachment>): MessageAttachment {
    return {
        id: 'a1',
        type: 'Document',
        mimeType: 'text/plain',
        fileName: null,
        sizeBytes: 0,
        ...overrides
    } as MessageAttachment;
}

describe('ShortBadgeText', () => {
    it('returns "FILE" for empty or whitespace-only input', () => {
        expect(ShortBadgeText('')).toBe('FILE');
        expect(ShortBadgeText('   ')).toBe('FILE');
        expect(ShortBadgeText(null)).toBe('FILE');
        expect(ShortBadgeText(undefined)).toBe('FILE');
    });

    it('uppercases names that already fit within 10 characters', () => {
        expect(ShortBadgeText('Report')).toBe('REPORT');
        expect(ShortBadgeText('Snapshot')).toBe('SNAPSHOT');
        expect(ShortBadgeText('json')).toBe('JSON');
    });

    it('takes the last word when the full name is too long', () => {
        expect(ShortBadgeText('Data Snapshot')).toBe('SNAPSHOT');
        expect(ShortBadgeText('Business Intelligence Dashboard')).toBe('DASHBOARD');
        expect(ShortBadgeText('Skip Report')).toBe('REPORT');
    });

    it('truncates with ellipsis when the last word is still too long', () => {
        expect(ShortBadgeText('Monstrouslylongword')).toBe('MONSTROUS…');
    });

    it('trims surrounding whitespace before measuring length', () => {
        expect(ShortBadgeText('  Report  ')).toBe('REPORT');
    });
});

describe('BadgeTextForAttachment', () => {
    it('prefers the artifact type name over the file extension', () => {
        const a = makeAttachment({
            artifactTypeName: 'Data Snapshot',
            fileName: 'snapshot.json'
        });
        expect(BadgeTextForAttachment(a)).toBe('SNAPSHOT');
    });

    it('uses the file extension when no artifact type is present', () => {
        expect(BadgeTextForAttachment(makeAttachment({ fileName: 'Q1_deck.pdf' }))).toBe('PDF');
        expect(BadgeTextForAttachment(makeAttachment({ fileName: 'data.csv' }))).toBe('CSV');
    });

    it('uppercases the extension and caps at 10 characters', () => {
        expect(BadgeTextForAttachment(makeAttachment({ fileName: 'weird.abcdefghijklmnop' }))).toBe('ABCDEFGHIJ');
    });

    it('falls back to the mime subtype when the filename has no extension', () => {
        expect(BadgeTextForAttachment(makeAttachment({ fileName: 'noext', mimeType: 'application/pdf' }))).toBe('PDF');
    });

    it('strips mime parameters (e.g. charset) before using as a fallback', () => {
        expect(BadgeTextForAttachment(makeAttachment({ fileName: null, mimeType: 'text/plain; charset=utf-8' }))).toBe('PLAIN');
    });

    it('returns "FILE" when neither extension nor usable mime is available', () => {
        expect(BadgeTextForAttachment(makeAttachment({ fileName: null, mimeType: '' }))).toBe('FILE');
    });

    it('ignores a leading dot filename (e.g. ".gitignore") and falls back to mime', () => {
        // lastIndexOf('.') === 0 → dot is not > 0, so we fall through to mime
        expect(BadgeTextForAttachment(makeAttachment({ fileName: '.gitignore', mimeType: 'text/plain' }))).toBe('PLAIN');
    });
});
