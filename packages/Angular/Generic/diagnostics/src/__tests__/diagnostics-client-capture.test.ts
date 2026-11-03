import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
    DiagnosticsBuildBundleOperation,
    DiagnosticsGetMySessionStatusOperation,
    DiagnosticsGetMySessionStatusOutput,
    DiagnosticsSendBundleOperation,
    DiagnosticsUploadClientCaptureOperation,
} from '@memberjunction/core-entities';
import { DiagnosticLogEntry, ParseBundleDataFromArchive, VerifyBundleArchive } from '@memberjunction/diagnostics';
import { GraphQLDataProvider, PACKAGE_VERSION } from '@memberjunction/graphql-dataprovider';
import { DescribeClickTarget } from '../lib/breadcrumbs';
import { MJDiagnosticsService } from '../lib/diagnostics.service';

vi.mock('@memberjunction/graphql-dataprovider', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/graphql-dataprovider')>()),
    RegisterNetworkDiagnosticObserver: vi.fn(() => () => undefined),
    RegisterResponseHeaderObserver: vi.fn(() => () => undefined),
}));

/** A signed-in GraphQL provider stand-in. */
function signedInProvider(): GraphQLDataProvider {
    const provider = Object.create(GraphQLDataProvider.prototype);
    Object.defineProperties(provider, {
        CurrentUser: { value: { ID: 'USER-1', Type: 'User', UserRoles: [] } },
        Authorizations: { value: [] },
        sessionId: { value: 'tab-1' },
        SetDynamicHeader: { value: vi.fn() },
        RemoveDynamicHeader: { value: vi.fn() },
    });
    return provider;
}

function mockStatus(output: Partial<DiagnosticsGetMySessionStatusOutput>) {
    return vi.spyOn(DiagnosticsGetMySessionStatusOperation.prototype, 'Execute').mockResolvedValue({
        Success: true,
        Output: { Active: false, SelfServiceRecordingAllowed: false, ...output },
    });
}

function mockSubmitPipeline() {
    const upload = vi.spyOn(DiagnosticsUploadClientCaptureOperation.prototype, 'Execute').mockImplementation(async (input) => ({
        Success: true,
        Output: { SessionID: input.SessionID ?? 'srv-new', ChunksWritten: 1, TotalBytesWritten: 1 },
    }));
    const build = vi.spyOn(DiagnosticsBuildBundleOperation.prototype, 'Execute').mockResolvedValue({
        Success: true,
        Output: { BundleID: 'b-1', Status: 'Ready', SizeBytes: 1, SHA256: 'x', FindingsCount: 0 },
    });
    vi.spyOn(DiagnosticsSendBundleOperation.prototype, 'Execute').mockResolvedValue({
        Success: true,
        Output: { BundleID: 'b-1', Status: 'Sent', Destination: 'MJC' },
    });
    return { upload, build };
}

const logEntry = (message: string): DiagnosticLogEntry => ({
    timestamp: new Date().toISOString(),
    severity: 'info',
    source: 'client',
    message,
});

type Listener = (event: object) => void;

/** A document or window stand-in that counts its listeners. */
function fakeEventTarget(extra: Record<string, unknown> = {}) {
    const listeners = new Map<string, Set<Listener>>();
    return {
        ...extra,
        addEventListener: (type: string, fn: Listener) => {
            const set = listeners.get(type) ?? new Set<Listener>();
            set.add(fn);
            listeners.set(type, set);
        },
        removeEventListener: (type: string, fn: Listener) => {
            listeners.get(type)?.delete(fn);
        },
        get listenerCount() {
            return [...listeners.values()].reduce((n, set) => n + set.size, 0);
        },
    };
}

describe('MJDiagnosticsService client capture', () => {
    let service: MJDiagnosticsService;

    beforeEach(() => {
        vi.restoreAllMocks();
        service = new MJDiagnosticsService();
        service.ClearBuffers();
    });

    afterEach(() => {
        service.Dispose();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    describe('browser storage', () => {
        it('writes nothing to IndexedDB while a recording runs', () => {
            vi.useFakeTimers();
            const open = vi.fn();
            vi.stubGlobal('indexedDB', { open });

            service.StartRecording('srv-1', 'Standard');
            service.RecordLogEntry(logEntry('user alice@example.com saved a record'));
            vi.advanceTimersByTime(5_000);

            expect(open).not.toHaveBeenCalled();
        });
    });

    describe('literal scrubbing', () => {
        it('builds a client bundle with the Standard profile when the server requires literal scrubbing', async () => {
            mockStatus({ CaptureEnabled: true, RequireLiteralScrubbing: true });
            service.Provider = signedInProvider();
            await service.LoadServerStatus();

            const built = await service.BuildClientBundle({ scrubberProfile: 'FullRaw' });

            expect(built.manifest.scrubberProfile).toBe('Standard');
        });

        it('builds the Submit bundle with literal scrubbing when the server requires it, even for FullRaw', async () => {
            mockStatus({ CaptureEnabled: true, RequireLiteralScrubbing: true });
            const { upload, build } = mockSubmitPipeline();
            service.Provider = signedInProvider();
            await service.LoadServerStatus();

            await service.SubmitBundleToSupport({ scrubberProfile: 'FullRaw' });

            expect(upload.mock.calls[0][0].ScrubLiterals).toBe(true);
            expect(build.mock.calls[0][0].ScrubLiterals).toBe(true);
        });

        it('builds the Submit bundle with literal scrubbing when the caller names no profile', async () => {
            const { build } = mockSubmitPipeline();

            await service.SubmitBundleToSupport();

            expect(build.mock.calls[0][0].ScrubLiterals).toBe(true);
        });
    });

    describe('capture switch', () => {
        let doc: ReturnType<typeof fakeEventTarget>;

        beforeEach(() => {
            doc = fakeEventTarget();
            vi.stubGlobal('document', doc);
            vi.stubGlobal('window', fakeEventTarget({ location: { pathname: '/app/home' } }));
            service.Provider = signedInProvider();
        });

        it('does not listen for clicks or record routes when the server does not report capture as enabled', async () => {
            mockStatus({});
            service.Initialize();
            await service.LoadServerStatus();
            service.RecordRouteBreadcrumb('/app/home');

            expect(doc.listenerCount).toBe(0);
            const built = await service.BuildClientBundle();
            expect(ParseBundleDataFromArchive(await VerifyBundleArchive(built.zipBytes)).repro.breadcrumbs).toEqual([]);
        });

        it('captures into memory before the server status is known', async () => {
            service.Provider = null;
            vi.stubGlobal('document', doc);
            service.Initialize();
            service.RecordRouteBreadcrumb('/app/login');

            expect(doc.listenerCount).toBeGreaterThan(0);
            const built = await service.BuildClientBundle();
            expect(ParseBundleDataFromArchive(await VerifyBundleArchive(built.zipBytes)).repro.breadcrumbs).toEqual([
                expect.objectContaining({ type: 'route', target: '/app/login' }),
            ]);
        });

        it('clears what it captured before the status when the server reports capture as off', async () => {
            let answer: (value: Awaited<ReturnType<DiagnosticsGetMySessionStatusOperation['Execute']>>) => void = () => undefined;
            vi.spyOn(DiagnosticsGetMySessionStatusOperation.prototype, 'Execute').mockReturnValue(new Promise((resolve) => (answer = resolve)));
            service.Initialize();
            service.RecordRouteBreadcrumb('/app/login');
            service.RecordLogEntry(logEntry('before the status'));

            answer({ Success: true, Output: { Active: false, SelfServiceRecordingAllowed: false, CaptureEnabled: false } });
            await service.LoadServerStatus();

            expect(doc.listenerCount).toBe(0);
            const data = ParseBundleDataFromArchive(await VerifyBundleArchive((await service.BuildClientBundle()).zipBytes));
            expect(data.repro.breadcrumbs).toEqual([]);
            expect(data.clientLogs).toEqual([]);
        });

        it('keeps capturing into memory when the server status cannot be read', async () => {
            vi.spyOn(DiagnosticsGetMySessionStatusOperation.prototype, 'Execute').mockRejectedValue(new Error('no server'));
            service.Initialize();
            await service.LoadServerStatus();
            service.RecordRouteBreadcrumb('/app/login');

            expect(doc.listenerCount).toBeGreaterThan(0);
            const built = await service.BuildClientBundle();
            expect(ParseBundleDataFromArchive(await VerifyBundleArchive(built.zipBytes)).repro.breadcrumbs).toHaveLength(1);
        });

        it('listens for clicks once the server reports capture as enabled', async () => {
            mockStatus({ CaptureEnabled: true });
            service.Initialize();
            await service.LoadServerStatus();

            expect(doc.listenerCount).toBeGreaterThan(0);
        });
    });

    describe('click breadcrumbs', () => {
        function element(tagName: string, attributes: Record<string, string>, text: string) {
            const el = {
                tagName,
                id: attributes['id'] ?? '',
                textContent: text,
                getAttribute: (name: string) => attributes[name] ?? null,
                closest: () => el,
            };
            return el as unknown as Element;
        }

        it('names a control by tag, role, type and identifier attributes, never by its visible text', () => {
            const link = element('A', { id: 'open-record', role: 'menuitem', 'aria-label': 'Open Alice Smith', title: 'alice@example.com' }, 'Alice Smith');
            const field = element('INPUT', { type: 'email', name: 'email', 'data-testid': 'contact-email', placeholder: 'alice@example.com' }, '');

            expect(DescribeClickTarget(link)).toBe('a#open-record[role=menuitem]');
            expect(DescribeClickTarget(field)).toBe('input[type=email][name=email][data-testid=contact-email]');
        });

        it('leaves out an identifier attribute that repeats the element text', () => {
            const button = element('BUTTON', { 'data-test-id': 'Alice Smith' }, 'Alice Smith');

            expect(DescribeClickTarget(button)).toBe('button');
        });
    });

    describe('server trigger', () => {
        it('keeps an active user recording and its session header when a server trigger arrives', async () => {
            const { upload } = mockSubmitPipeline();
            const hook = vi.fn();
            service.RegisterSessionHeaderHook(hook);
            service.StartRecording('user-rec', 'Standard');
            hook.mockClear();

            await service.HandleServerTriggerHeader('watch-9');

            expect(service.CurrentRecordingState.sessionId).toBe('user-rec');
            expect(hook).not.toHaveBeenCalled();
            expect(upload.mock.calls[0][0].SessionID).toBe('watch-9');
        });

        it('uploads only entries captured from the trigger time on', async () => {
            const { upload } = mockSubmitPipeline();
            const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
            service.RecordLogEntry(logEntry('before the trigger'));

            await service.HandleServerTriggerHeader('watch-2');
            const late = logEntry('after the trigger');
            service.RecordLogEntry(late);
            now.mockReturnValue(1_000_000 + 60_000);
            await service.HandleServerTriggerHeader('watch-2');

            expect(upload.mock.calls.map((c) => c[0].ClientLogs)).toEqual([[], [late]]);
        });
    });

    describe('MJ version', () => {
        it('reports the running MJ version in uploads and client bundles', async () => {
            const { upload } = mockSubmitPipeline();

            await service.HandleServerTriggerHeader('watch-v');
            const built = await service.BuildClientBundle();

            expect(upload.mock.calls[0][0].Environment?.['mjVersion']).toBe(PACKAGE_VERSION);
            expect(ParseBundleDataFromArchive(await VerifyBundleArchive(built.zipBytes)).environment.mjVersion).toBe(PACKAGE_VERSION);
        });
    });
});
