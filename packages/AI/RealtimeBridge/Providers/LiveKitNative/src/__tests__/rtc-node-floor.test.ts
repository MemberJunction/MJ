/**
 * The `@livekit/rtc-node` range in this package's `package.json` must not admit a release the room client can't run
 * on. A package manager may satisfy the range with any release it admits, such as an older 0.13.x already in the host's
 * tree, so the range's lowest release must have every entry in {@link NEEDS}: something the client relies on, and the
 * first rtc-node release that has it (from rtc-node's changelog and source). The declared floor is the release the
 * lockfile installs and live meetings ran on, which is above all of them.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** `major.minor.patch` as numbers. */
type Version = [number, number, number];

/** The part of `package.json` this test reads. */
interface PackageManifest {
    optionalDependencies?: Record<string, string>;
}

/** What the room client relies on in `@livekit/rtc-node`, and the first release that has it. */
const NEEDS: { Since: Version; What: string }[] = [
    {
        Since: [0, 13, 12],
        What: 'VideoStream and AudioStream are ReadableStreams (participant video is read through getReader())',
    },
    {
        Since: [0, 13, 19],
        What: "AudioSource.queuedDuration still counts queued voice after a pause (the avatar's face is timed against it)",
    },
    {
        Since: [0, 13, 20],
        What: "AudioSource.clearQueue() resets queuedDuration (barge-in; the avatar's face is timed against it)",
    },
];

function declaredRange(): string {
    const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as PackageManifest;
    return manifest.optionalDependencies?.['@livekit/rtc-node'] ?? '';
}

/** The lowest release a simple range admits (`^0.13.29`, `~0.13.29`, `>=0.13.29 <0.14.0`, `0.13.29`); null for any other form. */
function lowestRelease(range: string): Version | null {
    const match = /^(?:\^|~|>=)?(\d+)\.(\d+)\.(\d+)(?:\s|$)/.exec(range.trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function isAtLeast([major, minor, patch]: Version, [minMajor, minMinor, minPatch]: Version): boolean {
    if (major !== minMajor) {
        return major > minMajor;
    }
    if (minor !== minMinor) {
        return minor > minMinor;
    }
    return patch >= minPatch;
}

describe('the @livekit/rtc-node range this package declares', () => {
    const range = declaredRange();

    it('is an optional dependency with a lowest release', () => {
        expect(range, '@livekit/rtc-node is not in optionalDependencies').not.toBe('');
        expect(lowestRelease(range), `no lowest release can be read from '${range}'`).not.toBeNull();
    });

    for (const need of NEEDS) {
        const since = need.Since.join('.');
        it(`admits no release before ${since}: ${need.What}`, () => {
            const lowest = lowestRelease(range);
            expect(lowest !== null && isAtLeast(lowest, need.Since), `'${range}' admits releases before ${since}`).toBe(true);
        });
    }
});
