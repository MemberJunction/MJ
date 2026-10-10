/**
 * E2's audit of the client drivers, kept true: every realtime client driver this package registers is in the table,
 * each row's video columns match the code, and each row the video conformance kit covers names a run that uses that
 * driver. A new driver fails here until it is audited.
 *
 * - **Agent video** `'none'`: no class in the driver's chain (below `BaseRealtimeClient`) calls `emitRemoteVideo`, so
 *   the driver can never hand the host a video and the host never shows an avatar for it. `'when-granted'`: the chain
 *   hands video over; the kit runs prove it does so only when the server granted an avatar and the host shows it.
 * - **Inbound video** `'none'`: the chain declares no `SendVideoFrame`. `'profile'`: it does, and the minted model
 *   profile decides whether the model takes video.
 *
 * The server drivers and the UI are audited in the PR's tables, from their own tests.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { BaseRealtimeClient } from '../generic/baseRealtimeClient';
import { CreateConformanceMicrophone, RecordingPcmPlayback, RecordingVideoPlayout, type IRealtimeVideoConformanceHarness, type RealtimeVideoConformanceMedia } from '../testing';
import { PACKAGE_ROOT } from './helpers/entry-boundary';
import { GeminiDeveloperHarness } from './video-conformance/gemini-harness';
import { GeminiEnterpriseHarness } from './video-conformance/gemini-enterprise-harness';
import { OpenAIHarness } from './video-conformance/openai-harness';

interface ClientDriverAuditRow {
    /** The ClassFactory key: the `Provider` the server driver mints. */
    Key: string;
    /** The class registered under the key. */
    Class: string;
    AgentVideo: 'none' | 'when-granted';
    InboundVideo: 'none' | 'profile';
    /** The kit runs that use this driver; none means the row rests on the source alone. */
    KitRuns: string[];
}

/** E2's client-driver table. */
const CLIENT_DRIVER_AUDIT: ClientDriverAuditRow[] = [
    { Key: 'openai', Class: 'OpenAIRealtimeClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: ['openai'] },
    { Key: 'openai-live', Class: 'OpenAILiveClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
    { Key: 'OpenAILiveRealtime', Class: 'OpenAILiveClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
    { Key: 'gemini', Class: 'GeminiRealtimeClient', AgentVideo: 'when-granted', InboundVideo: 'profile', KitRuns: ['gemini-developer', 'gemini-enterprise'] },
    { Key: 'gemini-enterprise', Class: 'GeminiEnterpriseRealtimeClient', AgentVideo: 'when-granted', InboundVideo: 'profile', KitRuns: ['gemini-enterprise'] },
    { Key: 'elevenlabs', Class: 'ElevenLabsRealtimeClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
    { Key: 'assemblyai', Class: 'AssemblyAIRealtimeClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
    { Key: 'xai', Class: 'xAIRealtimeClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
    { Key: 'huggingface', Class: 'HuggingFaceRealtimeClient', AgentVideo: 'none', InboundVideo: 'none', KitRuns: [] },
];

/** The kit runs, by name. */
const KIT_RUNS: Record<string, () => IRealtimeVideoConformanceHarness> = {
    'gemini-developer': () => new GeminiDeveloperHarness(),
    'gemini-enterprise': () => new GeminiEnterpriseHarness(),
    openai: () => new OpenAIHarness(),
};

/** What the source says about one class. */
interface ScannedClass {
    Extends: string | null;
    HandsOverVideo: boolean;
    SendsVideoFrames: boolean;
}

/** What the scan of `src/` (tests and the kit excluded) found: the registered client drivers and every class. */
interface SourceScan {
    Registrations: Array<{ Key: string; Class: string }>;
    Classes: Map<string, ScannedClass>;
}

/** The package's source files, without its tests. */
function sourceFiles(dir: string = resolve(PACKAGE_ROOT, 'src')): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
            return name === '__tests__' ? [] : sourceFiles(path);
        }
        return path.endsWith('.ts') ? [path] : [];
    });
}

/** `@RegisterClass(BaseRealtimeClient, '<key>')` on a class: the key, or `null`. */
function clientRegistrationKey(decorator: ts.Decorator): string | null {
    const call = decorator.expression;
    if (!ts.isCallExpression(call) || call.expression.getText() !== 'RegisterClass' || call.arguments.length < 2) {
        return null;
    }
    const [base, key] = call.arguments;
    return base.getText() === 'BaseRealtimeClient' && ts.isStringLiteral(key) ? key.text : null;
}

/** Whether a class body calls `this.<method>(...)` anywhere. */
function callsThis(node: ts.Node, method: string): boolean {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.expression.kind === ts.SyntaxKind.ThisKeyword && node.expression.name.text === method) {
        return true;
    }
    return ts.forEachChild(node, (child) => callsThis(child, method) || undefined) ?? false;
}

/** Records one class declaration and its client registrations. */
function scanClass(node: ts.ClassDeclaration, scan: SourceScan): void {
    const name = node.name?.text;
    if (!name) {
        return;
    }
    const heritage = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression.getText() ?? null;
    const sendsFrames = node.members.some((m) => ts.isMethodDeclaration(m) && m.name.getText() === 'SendVideoFrame');
    scan.Classes.set(name, { Extends: heritage, HandsOverVideo: callsThis(node, 'emitRemoteVideo'), SendsVideoFrames: sendsFrames });
    for (const decorator of ts.getDecorators(node) ?? []) {
        const key = clientRegistrationKey(decorator);
        if (key !== null) {
            scan.Registrations.push({ Key: key, Class: name });
        }
    }
}

function scanSource(): SourceScan {
    const scan: SourceScan = { Registrations: [], Classes: new Map() };
    for (const path of sourceFiles()) {
        if (relative(resolve(PACKAGE_ROOT, 'src'), path).startsWith('testing')) {
            continue; // The kit registers no driver and hands over no video of its own.
        }
        const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
        file.forEachChild((node) => (ts.isClassDeclaration(node) ? scanClass(node, scan) : undefined));
    }
    return scan;
}

/** The class and its ancestors in this package, below `BaseRealtimeClient`. */
function chainOf(className: string, classes: Map<string, ScannedClass>): ScannedClass[] {
    const chain: ScannedClass[] = [];
    for (let name: string | null = className; name && name !== 'BaseRealtimeClient'; name = classes.get(name)?.Extends ?? null) {
        const scanned = classes.get(name);
        if (!scanned) {
            break;
        }
        chain.push(scanned);
    }
    return chain;
}

/** The class names in an object's prototype chain. */
function classNamesOf(client: BaseRealtimeClient): string[] {
    const names: string[] = [];
    for (let proto: object | null = Object.getPrototypeOf(client); proto; proto = Object.getPrototypeOf(proto)) {
        names.push(proto.constructor.name);
    }
    return names;
}

function noMedia(): RealtimeVideoConformanceMedia {
    return { Microphone: CreateConformanceMicrophone(), Voice: new RecordingPcmPlayback(), CreateVideoPlayer: (options) => new RecordingVideoPlayout(options) };
}

describe("E2's audit of the client drivers", () => {
    const scan = scanSource();

    it('has a row for every registered client driver, and none for a key nobody registers', () => {
        const registered = scan.Registrations.map((r) => `${r.Key} -> ${r.Class}`).sort();
        expect(CLIENT_DRIVER_AUDIT.map((row) => `${row.Key} -> ${row.Class}`).sort()).toEqual(registered);
    });

    it.each(CLIENT_DRIVER_AUDIT)("$Key: the agent video and inbound video columns match the driver's code", (row) => {
        const chain = chainOf(row.Class, scan.Classes);
        expect(chain.length, `no class ${row.Class} in the source`).toBeGreaterThan(0);
        expect(chain.some((c) => c.HandsOverVideo) ? 'when-granted' : 'none').toBe(row.AgentVideo);
        expect(chain.some((c) => c.SendsVideoFrames) ? 'profile' : 'none').toBe(row.InboundVideo);
    });

    it.each(CLIENT_DRIVER_AUDIT.flatMap((row) => row.KitRuns.map((run) => ({ Run: run, Key: row.Key, Class: row.Class }))))(
        '$Key: the $Run kit run uses $Class',
        async ({ Run, Class }) => {
            const harness = KIT_RUNS[Run]?.();
            expect(harness?.Name).toBe(Run);
            try {
                expect(classNamesOf(harness!.CreateClient(noMedia()))).toContain(Class);
            } finally {
                await harness?.Dispose?.();
            }
        }
    );

    it('every driver that can hand over video is covered by a kit run', () => {
        const uncovered = CLIENT_DRIVER_AUDIT.filter((row) => row.AgentVideo !== 'none' && row.KitRuns.length === 0).map((row) => row.Key);
        expect(uncovered).toEqual([]);
    });
});
