import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    FfmpegLocator,
    IsFfmpegVersionAtLeast,
    MINIMUM_FFMPEG_VERSION,
    ParseFfmpegDecoders,
    ParseFfmpegVersion,
    ResolveFfmpegPath,
    type FfmpegRunner,
} from '../ffmpeg-locator';

const DECODERS = `Decoders:
 V..... = Video
 A..... = Audio
 ------
 VFS..D h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10
 A....D aac                  AAC (Advanced Audio Coding)
 A....D aac_at               aac (AudioToolbox) (codec aac)
`;

/** A runner answering `-version` and `-decoders` as given, recording each call. */
function runner(version: string | Error, decoders: string | Error = DECODERS): FfmpegRunner & { Calls: string[][] } {
    const calls: string[][] = [];
    const run: FfmpegRunner = async (path, args) => {
        calls.push([path, ...args]);
        const answer = args.includes('-version') ? version : decoders;
        if (answer instanceof Error) {
            throw answer;
        }
        return answer;
    };
    return Object.assign(run, { Calls: calls });
}

const hasFfmpeg = ((): boolean => {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
})();

afterEach(() => FfmpegLocator.Instance.Configure());

describe('ResolveFfmpegPath', () => {
    it('uses MJ_FFMPEG_PATH when it names a binary, else ffmpeg on the PATH', () => {
        expect(ResolveFfmpegPath({ MJ_FFMPEG_PATH: ' /opt/ffmpeg/bin/ffmpeg ' })).toBe('/opt/ffmpeg/bin/ffmpeg');
        expect(ResolveFfmpegPath({ MJ_FFMPEG_PATH: '   ' })).toBe('ffmpeg');
        expect(ResolveFfmpegPath({})).toBe('ffmpeg');
    });
});

describe('ParseFfmpegVersion', () => {
    it('reads release builds: Homebrew, BtbN, Ubuntu', () => {
        expect(ParseFfmpegVersion('ffmpeg version 9.0.2 Copyright (c) 2000-2026')).toMatchObject({ Major: 9, Minor: 0, Text: '9.0.2' });
        expect(ParseFfmpegVersion('ffmpeg version n7.1.1-22-g0f1fe3d153-20250430 Copyright')).toMatchObject({ Major: 7, Minor: 1 });
        expect(ParseFfmpegVersion('ffmpeg version 4.2.7-0ubuntu0.1 Copyright (c) 2000-2022')).toMatchObject({ Major: 4, Minor: 2 });
    });

    it('maps a development build by its libavformat version', () => {
        const dev = (lavf: string): string => `ffmpeg version N-117541-g1234abcd-20241030 Copyright\nlibavutil      59. 39.100\nlibavformat    ${lavf} / ${lavf}\n`;
        expect(ParseFfmpegVersion(dev('61.  7.100'))).toMatchObject({ Major: 7, Minor: 0 });
        expect(ParseFfmpegVersion(dev('59. 27.100'))).toMatchObject({ Major: 5, Minor: 1 });
        expect(ParseFfmpegVersion(dev('59. 16.100'))).toMatchObject({ Major: 5, Minor: 0 });
        expect(ParseFfmpegVersion(dev('58. 29.100'))).toMatchObject({ Major: 4, Minor: 2 });
        expect(ParseFfmpegVersion(dev('58. 20.100'))).toMatchObject({ Major: 4, Minor: 1 });
    });

    it('is null for anything else', () => {
        expect(ParseFfmpegVersion('command not found')).toBeNull();
    });

    it('compares versions', () => {
        expect(IsFfmpegVersionAtLeast({ Major: 4, Minor: 2, Text: '' }, MINIMUM_FFMPEG_VERSION)).toBe(true);
        expect(IsFfmpegVersionAtLeast({ Major: 4, Minor: 1, Text: '' }, MINIMUM_FFMPEG_VERSION)).toBe(false);
        expect(IsFfmpegVersionAtLeast({ Major: 5, Minor: 0, Text: '' }, MINIMUM_FFMPEG_VERSION)).toBe(true);
    });
});

describe('ParseFfmpegDecoders', () => {
    it('lists the decoder names, not the legend', () => {
        const names = ParseFfmpegDecoders(DECODERS);
        expect([...names]).toEqual(['h264', 'aac', 'aac_at']);
    });
});

describe('FfmpegLocator', () => {
    it('finds a usable ffmpeg at MJ_FFMPEG_PATH and probes it once', async () => {
        const run = runner('ffmpeg version 7.1.1 Copyright');
        FfmpegLocator.Instance.Configure(run, { MJ_FFMPEG_PATH: '/opt/ffmpeg' });
        const first = await FfmpegLocator.Instance.Probe();
        const second = await FfmpegLocator.Instance.Probe();
        expect(first).toEqual({ Available: true, Path: '/opt/ffmpeg', Version: { Major: 7, Minor: 1, Text: '7.1.1' } });
        expect(second).toBe(first);
        expect(run.Calls).toEqual([['/opt/ffmpeg', '-version'], ['/opt/ffmpeg', '-hide_banner', '-decoders']]);
    });

    it('says why there is none: not found, too old, a decoder missing, or the list unreadable', async () => {
        const cases: Array<[FfmpegRunner, RegExp]> = [
            [runner(Object.assign(new Error('spawn ffmpeg ENOENT'), { code: 'ENOENT' })), /could not be run at ffmpeg \(set MJ_FFMPEG_PATH/],
            [runner('ffmpeg version 4.1.3 Copyright'), /older than 4\.2/],
            [runner('ffmpeg version 9.0 Copyright', DECODERS.replace(/ A....D aac .*\n/, '')), /has no aac decoder/],
            [runner('ffmpeg version 9.0 Copyright', new Error('timed out')), /did not list its decoders/],
            [runner('not ffmpeg'), /printed no ffmpeg version/],
        ];
        for (const [run, reason] of cases) {
            FfmpegLocator.Instance.Configure(run, {});
            const result = await FfmpegLocator.Instance.Probe();
            expect(result.Available).toBe(false);
            expect(result.Available === false ? result.Reason : '').toMatch(reason);
        }
    });

    it('probes again after Configure', async () => {
        const run = vi.fn(runner('ffmpeg version 9.0 Copyright'));
        FfmpegLocator.Instance.Configure(run, {});
        await FfmpegLocator.Instance.Probe();
        FfmpegLocator.Instance.Configure(run, {});
        await FfmpegLocator.Instance.Probe();
        expect(run).toHaveBeenCalledTimes(4);
    });

    it.skipIf(!hasFfmpeg)('finds the installed ffmpeg: a supported version with the h264 and aac decoders', async () => {
        FfmpegLocator.Instance.Configure(undefined, {});
        const result = await FfmpegLocator.Instance.Probe();
        expect(result.Available).toBe(true);
        expect(result.Available === true && IsFfmpegVersionAtLeast(result.Version, MINIMUM_FFMPEG_VERSION)).toBe(true);
    });
});
