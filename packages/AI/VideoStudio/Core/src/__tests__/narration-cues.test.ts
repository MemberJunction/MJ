import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
    BuildNarrationCueTable,
    BuildNarrationCuesScript,
    CreateMJNarrationCues,
    FindUnresolvedNarrationCues,
    InjectNarrationCuesScriptTag,
    MJ_NARRATION_CUES_PATH,
    MJ_NARRATION_CUES_SCRIPT_TAG,
    NormalizeCueWord,
    WithNarrationCues,
} from '../index.js';
import type { MJNarrationCues, NarrationLine, RenderProjectBundle } from '../index.js';

const LINES: NarrationLine[] = [
    {
        Key: 'line-1',
        BeatKey: 'b1',
        Text: 'Own your data, own your future.',
        StartSeconds: 0.3,
        DurationSeconds: 2.4,
        WordTimings: [
            { Word: 'Own', StartSeconds: 0.3, EndSeconds: 0.5 },
            { Word: 'your', StartSeconds: 0.5, EndSeconds: 0.7 },
            { Word: 'data,', StartSeconds: 0.7, EndSeconds: 1.1 },
            { Word: 'own', StartSeconds: 1.3, EndSeconds: 1.5 },
            { Word: 'your', StartSeconds: 1.5, EndSeconds: 1.7 },
            { Word: 'future.', StartSeconds: 1.7, EndSeconds: 2.2 },
        ],
    },
    { Key: 'line-2', BeatKey: 'b2', Text: 'No timings here.', StartSeconds: 3, DurationSeconds: 1 },
    { Key: 'unfitted', BeatKey: 'b3', Text: 'Never placed.' },
];

describe('NormalizeCueWord', () => {
    it('drops case and punctuation but keeps inner apostrophes', () => {
        expect(NormalizeCueWord('Data,')).toBe('data');
        expect(NormalizeCueWord('“Future.”')).toBe('future');
        expect(NormalizeCueWord("MemberJunction’s")).toBe("memberjunction's");
        expect(NormalizeCueWord('  Own   your  ')).toBe('own your');
    });
});

describe('BuildNarrationCueTable', () => {
    it('keeps placed lines only, with normalized word keys', () => {
        const table = BuildNarrationCueTable(LINES);
        expect(Object.keys(table.Lines)).toEqual(['line-1', 'line-2']);
        expect(table.Lines['line-1'].Start).toBe(0.3);
        expect(table.Lines['line-1'].End).toBe(2.7);
        expect(table.Lines['line-1'].Words[2]).toEqual({ Word: 'data,', Key: 'data', Start: 0.7, End: 1.1 });
        expect(table.Lines['line-2'].Words).toEqual([]);
    });
});

describe('CreateMJNarrationCues', () => {
    const cues = CreateMJNarrationCues(BuildNarrationCueTable(LINES));

    it('finds a word, the nth occurrence, and a phrase', () => {
        expect(cues.Cue('line-1', 'DATA')).toBe(0.7);
        expect(cues.CueEnd('line-1', 'data')).toBe(1.1);
        expect(cues.Cue('line-1', 'own', 2)).toBe(1.3);
        expect(cues.Cue('line-1', 'own your future')).toBe(1.3);
        expect(cues.CueEnd('line-1', 'own your future')).toBe(2.2);
        expect(cues.Has('line-1', 'your', 3)).toBe(false);
    });

    it('falls back to the line start (or 0 for an unknown line) and records the miss', () => {
        expect(cues.Cue('line-1', 'kingdom')).toBe(0.3);
        expect(cues.CueEnd('line-1', 'kingdom')).toBe(2.7);
        expect(cues.Cue('missing', 'x')).toBe(0);
        expect(cues.Line('missing')).toBeNull();
        expect(cues.Line('line-2')).toEqual({ Start: 3, End: 4 });
        expect(cues.Misses).toEqual(['line-1:kingdom', 'missing:x']);
    });
});

describe('BuildNarrationCuesScript', () => {
    it('evaluates in a bare browser-like context and exposes window.mjCue', () => {
        const script = BuildNarrationCuesScript(BuildNarrationCueTable(LINES));
        const sandbox: { window: { MJNarration?: MJNarrationCues; mjCue?: (k: string, w: string, n?: number) => number } } = { window: {} };
        runInNewContext(script, sandbox);
        expect(sandbox.window.mjCue?.('line-1', 'future')).toBe(1.7);
        expect(sandbox.window.MJNarration?.Cue('line-1', 'own', 2)).toBe(1.3);
    });

    it('escapes < so the embedded JSON can never close a tag', () => {
        const script = BuildNarrationCuesScript({
            Lines: { x: { Start: 0, End: 1, Words: [{ Word: '</script>', Key: 'script', Start: 0, End: 1 }] } },
        });
        expect(script).not.toContain('</script>');
    });
});

describe('InjectNarrationCuesScriptTag / WithNarrationCues', () => {
    it('injects after <head> without adding a line', () => {
        const html = '<!doctype html>\n<html><head><title>t</title></head>\n<body></body></html>';
        const out = InjectNarrationCuesScriptTag(html);
        expect(out).toContain(`<head>${MJ_NARRATION_CUES_SCRIPT_TAG}<title>`);
        expect(out.split('\n').length).toBe(html.split('\n').length);
        expect(InjectNarrationCuesScriptTag(out)).toBe(out);
    });

    it('injects before the first script when there is no head', () => {
        expect(InjectNarrationCuesScriptTag('<div></div><script src="a.js"></script>')).toBe(
            `<div></div>${MJ_NARRATION_CUES_SCRIPT_TAG}<script src="a.js"></script>`,
        );
    });

    it('stages the script, loads it from the entry file, and never mutates the input', () => {
        const bundle: RenderProjectBundle = {
            Format: '16:9',
            EntryFile: 'index.html',
            Files: [
                { Path: 'index.html', Content: '<html><head></head><body></body></html>' },
                { Path: MJ_NARRATION_CUES_PATH, Content: 'stale' },
            ],
            Assets: [],
            Seed: 1,
        };
        const out = WithNarrationCues(bundle, { Audio: { Narration: { VoiceID: 'v', Provider: 'p', Script: LINES }, Cues: [], Captions: 'None' } });
        expect(bundle.Files[0].Content).not.toContain('narration-cues');
        expect(out.Files.filter((f) => f.Path === MJ_NARRATION_CUES_PATH)).toHaveLength(1);
        expect(out.Files.find((f) => f.Path === MJ_NARRATION_CUES_PATH)?.Content).toContain('"line-1"');
        expect(out.Files.find((f) => f.Path === 'index.html')?.Content).toContain(MJ_NARRATION_CUES_SCRIPT_TAG);
    });

    it('stages an empty table when narration is disabled', () => {
        const bundle: RenderProjectBundle = { Format: '16:9', EntryFile: 'index.html', Files: [{ Path: 'index.html', Content: '<head></head>' }], Assets: [], Seed: 1 };
        const out = WithNarrationCues(bundle, { Audio: { Narration: { Enabled: false, VoiceID: '', Provider: '', Script: LINES }, Cues: [], Captions: 'None' } });
        expect(out.Files.find((f) => f.Path === MJ_NARRATION_CUES_PATH)?.Content).toContain('{"Lines":{}}');
    });
});

describe('FindUnresolvedNarrationCues', () => {
    it('reports unknown lines and unspoken words with file and line; skips lines without timings', () => {
        const files = {
            'index.html': [
                '<script>',
                "const a = mjCue('line-1', 'data');",
                "const b = window.mjCue(\"line-1\", 'kingdom');",
                "const c = MJNarration.CueEnd('nope', 'x');",
                "const d = mjCue('line-2', 'anything');",
                "const e = mjCue(key, 'computed');",
                "const f = mjCue('line-1', 'own', 3);",
                '</script>',
            ].join('\n'),
        };
        const found = FindUnresolvedNarrationCues(files, BuildNarrationCueTable(LINES));
        expect(found).toEqual([
            { File: 'index.html', Line: 3, LineKey: 'line-1', Phrase: 'kingdom', Reason: 'WordNotSpoken' },
            { File: 'index.html', Line: 4, LineKey: 'nope', Phrase: 'x', Reason: 'UnknownLine' },
            { File: 'index.html', Line: 7, LineKey: 'line-1', Phrase: 'own', Reason: 'WordNotSpoken' },
        ]);
    });
});
