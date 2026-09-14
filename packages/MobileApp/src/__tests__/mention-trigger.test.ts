import { describe, it, expect } from 'vitest';
import { FindActiveTrigger, SerializeMention, ApplyMention, SerializeDraft } from '@/chat/mentions/trigger';

/**
 * Unit tests for composer trigger detection.
 *
 * The interesting cases are all "this looks like a trigger but isn't": an email address, a URL
 * path, a token the user already inserted. Each of those is something people type into a chat box
 * constantly, and each would otherwise pop a picker over what they were writing.
 */
describe('FindActiveTrigger', () => {
    it('opens on @ at the start of the text', () => {
        expect(FindActiveTrigger('@sa', 3)).toMatchObject({ Trigger: '@', Query: 'sa', StartIndex: 0, EndIndex: 3 });
    });

    it('opens on a trigger after whitespace', () => {
        expect(FindActiveTrigger('hello @re', 9)).toMatchObject({ Trigger: '@', Query: 're', StartIndex: 6 });
    });

    it('reports an empty query the moment the trigger is typed', () => {
        // The full list should show immediately, before any filtering.
        expect(FindActiveTrigger('hi /', 4)).toMatchObject({ Trigger: '/', Query: '' });
    });

    it('distinguishes the three triggers', () => {
        expect(FindActiveTrigger('@a', 2)?.Trigger).toBe('@');
        expect(FindActiveTrigger('#a', 2)?.Trigger).toBe('#');
        expect(FindActiveTrigger('/a', 2)?.Trigger).toBe('/');
    });

    it('does NOT open inside an email address', () => {
        // The single most common false positive in a chat composer.
        expect(FindActiveTrigger('mail me at amith@bluecypress.io', 24)).toBeNull();
    });

    it('does NOT open on a slash inside a URL or path', () => {
        expect(FindActiveTrigger('see docs/guide', 13)).toBeNull();
        expect(FindActiveTrigger('https://x.test/a', 16)).toBeNull();
    });

    it('closes once the user types a space', () => {
        // Finishing a word ends the query, matching the web composer.
        expect(FindActiveTrigger('@sage hello', 11)).toBeNull();
    });

    it('does NOT reopen inside a mention the user already inserted', () => {
        const text = '@{"type":"agent","id":"1","name":"Sage"} ';
        expect(FindActiveTrigger(text, text.length - 1)).toBeNull();
    });

    it('tracks the caret rather than the end of the text', () => {
        // Editing mid-message must filter on what is left of the caret, not the whole line.
        const text = '@re and more text';
        expect(FindActiveTrigger(text, 3)).toMatchObject({ Query: 're', EndIndex: 3 });
    });

    it('returns null for text with no trigger at all', () => {
        expect(FindActiveTrigger('just a message', 14)).toBeNull();
        expect(FindActiveTrigger('', 0)).toBeNull();
    });

    it('clamps a caret past the end rather than throwing', () => {
        expect(FindActiveTrigger('@ab', 99)).toMatchObject({ Query: 'ab' });
    });
});

describe('SerializeMention', () => {
    it('produces the JSON token the runtime parser reads', () => {
        // Byte-compatible with the Angular editor: a message composed on a phone and one composed
        // in a browser must be the same message.
        expect(SerializeMention('agent', 'a1', 'Sage')).toBe('@{"type":"agent","id":"a1","name":"Sage"}');
    });

    it('carries an agent configuration preset when one is chosen', () => {
        expect(SerializeMention('agent', 'a1', 'Sage', 'p1')).toContain('"configId":"p1"');
    });

    it('escapes a name containing quotes rather than producing broken JSON', () => {
        const token = SerializeMention('skill', 's1', 'The "Best" Skill');
        expect(() => JSON.parse(token.slice(1))).not.toThrow();
        expect(JSON.parse(token.slice(1)).name).toBe('The "Best" Skill');
    });
});

describe('ApplyMention', () => {
    it('replaces the trigger text and leaves the caret after a trailing space', () => {
        const trigger = FindActiveTrigger('hi @sa', 6)!;
        const result = ApplyMention('hi @sa', trigger, '@TOKEN');
        expect(result.Text).toBe('hi @TOKEN ');
        expect(result.Caret).toBe(result.Text.length);
    });

    it('preserves text after the caret when inserting mid-message', () => {
        const text = '@sa rest';
        const trigger = FindActiveTrigger(text, 3)!;
        const result = ApplyMention(text, trigger, '@TOKEN');
        expect(result.Text).toBe('@TOKEN  rest');
        expect(result.Caret).toBe('@TOKEN '.length);
    });
});

describe('SerializeDraft', () => {
    const sage = { Type: 'agent', ID: 'a1', Name: 'Sage', Prefix: '@' } as const;
    const skill = { Type: 'skill', ID: 's1', Name: 'Summarize', Prefix: '/' } as const;

    it('converts a readable draft back to the wire format', () => {
        // The composer shows `@Sage` because a TextInput can only display its own string, and
        // showing raw JSON while someone types is indefensible. The conversion happens here.
        const out = SerializeDraft('@Sage what is on my plate', [sage]);
        expect(out).toBe('@{"type":"agent","id":"a1","name":"Sage"} what is on my plate');
    });

    it('keeps the trigger the user typed, so a skill reads as /Name not @Name', () => {
        // The wire format is always `@{…}`; the DISPLAY should match how it was invoked.
        const out = SerializeDraft('/Summarize this', [skill]);
        expect(out).toBe('@{"type":"skill","id":"s1","name":"Summarize"} this');
    });

    it('converts several mentions, each exactly once', () => {
        const out = SerializeDraft('@Sage please /Summarize this', [sage, skill]);
        expect(out).toContain('"id":"a1"');
        expect(out).toContain('"id":"s1"');
        expect(out.match(/@\{/g)).toHaveLength(2);
    });

    it('drops a mention the user deleted', () => {
        // Removing the text is how a user un-mentions someone; the tracked id must not resurrect it.
        expect(SerializeDraft('never mind', [sage])).toBe('never mind');
    });

    it('leaves text with no mentions untouched', () => {
        expect(SerializeDraft('just a message', [])).toBe('just a message');
    });

    it('does not double-replace when the same name appears twice', () => {
        // One tracked mention means one token, even if the name occurs again as ordinary words.
        const out = SerializeDraft('@Sage ask @Sage again', [sage]);
        expect(out.match(/@\{/g)).toHaveLength(1);
        expect(out).toContain('ask @Sage again');
    });
});
