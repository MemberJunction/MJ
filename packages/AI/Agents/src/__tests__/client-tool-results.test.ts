import { describe, it, expect } from 'vitest';
import {
    BuildClientToolResultMessage,
    FormatClientToolResults,
    IsMediaBlock,
    ReplaceMediaBlocksWithStubs,
    ResolveClientToolResultMaxChars,
} from '../client-tool-results';

const big = { panels: Array.from({ length: 12 }, (_, i) => ({ id: `panel-${i}`, title: `Panel ${i}`, partType: 'View' })) };

describe('FormatClientToolResults', () => {
    it('includes a result longer than 500 characters when no cap is set', () => {
        const text = FormatClientToolResults([{ ToolName: 'GetDashboardState', Success: true, Result: big }], -1);
        expect(JSON.stringify(big).length).toBeGreaterThan(500);
        expect(text).toContain('"panel-11"');
        expect(text).not.toContain('[truncated');
    });

    it('truncates to the cap and says how much was cut', () => {
        const text = FormatClientToolResults([{ ToolName: 'GetDashboardState', Success: true, Result: big }], 100);
        const full = JSON.stringify(big);
        expect(text).toContain(full.slice(0, 100));
        expect(text).not.toContain('"panel-11"');
        expect(text).toContain(`[truncated ${full.length - 100} of ${full.length} chars]`);
    });

    it('does not split a surrogate pair at the cut', () => {
        const withEmoji = 'ab\u{1F600}cd';
        expect(withEmoji.length).toBe(6);
        const text = FormatClientToolResults([{ ToolName: 'Echo', Success: true, Result: withEmoji }], 3);
        expect(text).toBe('Client tool results:\n✓ **Echo**: succeeded\n  Result: ab [truncated 4 of 6 chars]');
    });

    it('keeps the whole result when the cap is not a positive integer', () => {
        for (const cap of [0, -1, 2.5, Number.NaN]) {
            const text = FormatClientToolResults([{ ToolName: 'Echo', Success: true, Result: 'hello' }], cap);
            expect(text).toBe('Client tool results:\n✓ **Echo**: succeeded\n  Result: hello');
        }
    });

    it('reports a failure with its error and no result', () => {
        const text = FormatClientToolResults([{ ToolName: 'AddPanel', Success: false, Result: { panelId: 'p1' }, ErrorMessage: 'Not in edit mode' }], -1);
        expect(text).toBe('1 of 1 client tool(s) failed:\n✗ **AddPanel**: failed — Not in edit mode');
    });

    it('passes a string result through unchanged', () => {
        const text = FormatClientToolResults([{ ToolName: 'Echo', Success: true, Result: 'hello' }], -1);
        expect(text).toBe('Client tool results:\n✓ **Echo**: succeeded\n  Result: hello');
    });
});

describe('ResolveClientToolResultMaxChars', () => {
    it('is -1 when unset', () => expect(ResolveClientToolResultMaxChars(undefined)).toBe(-1));
    it('is -1 for 0, negatives and non-numbers', () => {
        expect(ResolveClientToolResultMaxChars({ clientToolResultMaxChars: 0 })).toBe(-1);
        expect(ResolveClientToolResultMaxChars({ clientToolResultMaxChars: -5 })).toBe(-1);
        expect(ResolveClientToolResultMaxChars({ clientToolResultMaxChars: '800' })).toBe(-1);
    });
    it('returns a positive integer', () => expect(ResolveClientToolResultMaxChars({ clientToolResultMaxChars: 800 })).toBe(800));
});

describe('BuildClientToolResultMessage', () => {
    it('is a plain string message without media', () => {
        const msg = BuildClientToolResultMessage([{ ToolName: 'Echo', Success: true, Result: 'ok' }], 4, -1);
        expect(typeof msg.content).toBe('string');
        expect(msg.metadata).toEqual({ turnAdded: 4, messageType: 'client-tool-result', expirationTurns: 3, expirationMode: 'Remove' });
    });

    it('puts image blocks before the text block and expires after two turns', () => {
        const msg = BuildClientToolResultMessage(
            [{ ToolName: 'GetDashboardScreenshot', Success: true, Result: { width: 10, height: 5 }, Media: [{ MimeType: 'image/jpeg', Base64: 'AAAA', Width: 10, Height: 5 }] }],
            7,
            -1,
        );
        expect(Array.isArray(msg.content)).toBe(true);
        const blocks = msg.content as Array<{ type: string; content: string; mimeType?: string }>;
        expect(blocks[0]).toEqual({ type: 'image_url', content: 'data:image/jpeg;base64,AAAA', mimeType: 'image/jpeg', fileName: 'GetDashboardScreenshot' });
        expect(blocks[1].type).toBe('text');
        expect(blocks[1].content).toContain('GetDashboardScreenshot');
        expect(msg.metadata).toEqual({ turnAdded: 7, messageType: 'client-tool-result', expirationTurns: 2, expirationMode: 'Remove' });
    });

    it('keeps the images of successful results in order, names each after its tool, and leaves out the images of a failed result', () => {
        const msg = BuildClientToolResultMessage(
            [
                { ToolName: 'GetDashboardScreenshot', Success: true, Media: [{ MimeType: 'image/jpeg', Base64: 'AAAA' }, { MimeType: 'image/png', Base64: 'BBBB' }] },
                { ToolName: 'GetPanelScreenshot', Success: true, Media: [{ MimeType: 'image/png', Base64: 'DDDD' }] },
                { ToolName: 'GetChartScreenshot', Success: false, ErrorMessage: 'Capture timed out', Media: [{ MimeType: 'image/webp', Base64: 'CCCC' }] },
            ],
            2,
            -1,
        );
        const blocks = msg.content as Array<{ type: string; content: string; fileName?: string }>;
        expect(blocks.map(b => b.type)).toEqual(['image_url', 'image_url', 'image_url', 'text']);
        expect(blocks.map(b => b.content).slice(0, 3)).toEqual(['data:image/jpeg;base64,AAAA', 'data:image/png;base64,BBBB', 'data:image/png;base64,DDDD']);
        expect(blocks.map(b => b.fileName)).toEqual(['GetDashboardScreenshot', 'GetDashboardScreenshot', 'GetPanelScreenshot', undefined]);
        expect(blocks[3].content).toContain('Capture timed out');
        expect(JSON.stringify(blocks)).not.toContain('CCCC');
    });

    it('cuts only the text when a cap is set and keeps the image block whole', () => {
        const base64 = 'QUJD'.repeat(100);
        const msg = BuildClientToolResultMessage(
            [{ ToolName: 'GetDashboardState', Success: true, Result: big, Media: [{ MimeType: 'image/png', Base64: base64 }] }],
            1,
            100,
        );
        const blocks = msg.content as Array<{ type: string; content: string }>;
        expect(blocks[0].content).toBe(`data:image/png;base64,${base64}`);
        expect(blocks[1].content).toContain('[truncated ');
        expect(blocks[1].content).not.toContain('"panel-11"');
    });

    it('is a plain string message when a successful result has an empty Media list', () => {
        const msg = BuildClientToolResultMessage([{ ToolName: 'GetDashboardScreenshot', Success: true, Result: 'ok', Media: [] }], 5, -1);
        expect(msg.content).toBe('Client tool results:\n✓ **GetDashboardScreenshot**: succeeded\n  Result: ok');
        expect(msg.metadata).toEqual({ turnAdded: 5, messageType: 'client-tool-result', expirationTurns: 3, expirationMode: 'Remove' });
    });

    it('is a plain string message when only a failed result has images', () => {
        const msg = BuildClientToolResultMessage(
            [{ ToolName: 'GetDashboardScreenshot', Success: false, ErrorMessage: 'Tainted canvas', Media: [{ MimeType: 'image/png', Base64: 'BBBB' }] }],
            3,
            -1,
        );
        expect(msg.content).toBe('1 of 1 client tool(s) failed:\n✗ **GetDashboardScreenshot**: failed — Tainted canvas');
        expect(msg.metadata).toEqual({ turnAdded: 3, messageType: 'client-tool-result', expirationTurns: 3, expirationMode: 'Remove' });
    });
});

describe('ReplaceMediaBlocksWithStubs', () => {
    it('keeps text and replaces media', () => {
        const text = ReplaceMediaBlocksWithStubs([
            { type: 'image_url', content: 'data:image/jpeg;base64,AAAA', mimeType: 'image/jpeg' },
            { type: 'text', content: 'Client tool results:' },
        ]);
        expect(text).toBe('[image omitted]\nClient tool results:');
    });
    it('names the kind of each media block in its stub', () => {
        expect(ReplaceMediaBlocksWithStubs([
            { type: 'file_url', content: 'data:application/pdf;base64,JVBE', mimeType: 'application/pdf' },
            { type: 'audio_url', content: 'data:audio/wav;base64,UklG', mimeType: 'audio/wav' },
            { type: 'video_url', content: 'https://example.com/clip.mp4' },
        ])).toBe('[file omitted]\n[audio omitted]\n[video omitted]');
    });
    it('keeps the content of a tool_result block', () => {
        expect(ReplaceMediaBlocksWithStubs([{ type: 'tool_result', content: '{"rows":3}', toolCallId: 'call_1' }])).toBe('{"rows":3}');
    });
    it('returns a string unchanged', () => expect(ReplaceMediaBlocksWithStubs('hi')).toBe('hi'));
});

describe('IsMediaBlock', () => {
    it('is true for image, file, audio and video blocks', () => {
        for (const type of ['image_url', 'file_url', 'audio_url', 'video_url'] as const) {
            expect(IsMediaBlock({ type, content: 'x' })).toBe(true);
        }
    });
    it('is false for text and tool_result blocks', () => {
        expect(IsMediaBlock({ type: 'text', content: 'x' })).toBe(false);
        expect(IsMediaBlock({ type: 'tool_result', content: 'x', toolCallId: 'call_1' })).toBe(false);
    });
});
