import { describe, it, expect, vi } from 'vitest';
import { BehaviorSubject } from 'rxjs';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { Capture, Click, Query, RenderComponentFixture, Text } from '@memberjunction/ng-test-utils';
import { MJDiagnosticRecordingBannerComponent } from './recording-banner.component';
import { ActiveRecordingState, MJDiagnosticsService } from './diagnostics.service';

/**
 * DOM coverage for <mj-diagnostic-recording-banner> — a standalone:false, OnPush banner that
 * renders only while a recording is active. It reads the recording state from MJDiagnosticsService,
 * which is replaced here by a stub that holds the state in a BehaviorSubject.
 */

const IDLE: ActiveRecordingState = {
    isRecording: false,
    sessionId: null,
    serverSessionId: null,
    mode: 'flight-recorder',
    startedAtIso: null,
    scrubberProfile: 'FullRaw',
};

const SERVER_RECORDING: ActiveRecordingState = {
    isRecording: true,
    sessionId: 'rec-42',
    serverSessionId: 'rec-42',
    mode: 'active-recording',
    startedAtIso: '2026-11-02T12:00:00.000Z',
    scrubberProfile: 'Standard',
};

const CLIENT_ONLY_RECORDING: ActiveRecordingState = {
    ...SERVER_RECORDING,
    sessionId: 'rec-1793658993501',
    serverSessionId: null,
};

/** Service stub: stopping a recording sets the state back to idle, as the real service does. */
function createServiceStub(initial: ActiveRecordingState) {
    const state = new BehaviorSubject<ActiveRecordingState>(initial);
    const stub = {
        RecordingState$: state.asObservable(),
        get CurrentRecordingState(): ActiveRecordingState {
            return state.value;
        },
        StopAndPackageRecording: vi.fn(() => state.next(IDLE)),
    } satisfies Pick<MJDiagnosticsService, 'RecordingState$' | 'CurrentRecordingState' | 'StopAndPackageRecording'>;
    return { stub, state };
}

function render(initial: ActiveRecordingState) {
    const service = createServiceStub(initial);
    const fixture = RenderComponentFixture(MJDiagnosticRecordingBannerComponent, {
        imports: [MJButtonDirective],
        declarations: [MJDiagnosticRecordingBannerComponent],
        providers: [{ provide: MJDiagnosticsService, useValue: service.stub }],
    });
    return { fixture, ...service };
}

describe('MJDiagnosticRecordingBannerComponent (DOM)', () => {
    it('renders nothing while no recording is active', () => {
        const { fixture } = render(IDLE);
        expect(Query(fixture, '.mj-diag-recording-banner')).toBeNull();
    });

    it('shows the session ID and no client-only tag for a recording with a server session', () => {
        const { fixture } = render(SERVER_RECORDING);
        const banner = Query(fixture, '.mj-diag-recording-banner');
        expect(banner?.getAttribute('role')).toBe('status');
        expect(Text(fixture, '.mj-diag-label code')).toBe('(rec-42)');
        expect(Query(fixture, '.mj-diag-scope')).toBeNull();
        expect(Text(fixture, '.mj-diag-stop-action button')).toBe('Stop & Package');
    });

    it('tags a recording without a server session as client-only', () => {
        const { fixture } = render(CLIENT_ONLY_RECORDING);
        expect(Text(fixture, '.mj-diag-label code')).toBe('(rec-1793658993501)');
        expect(Text(fixture, '.mj-diag-scope')).toBe('client-only');
    });

    it('appears when a recording starts after the first render', () => {
        const { fixture, state } = render(IDLE);
        state.next(SERVER_RECORDING);
        fixture.detectChanges();
        expect(Text(fixture, '.mj-diag-label code')).toBe('(rec-42)');
    });

    it('Stop & Package packages the recording and emits StopRecordingRequested with the state from before the stop', () => {
        const { fixture, stub } = render(SERVER_RECORDING);
        const requests = Capture(fixture.componentInstance.StopRecordingRequested);

        Click(fixture, '.mj-diag-stop-action button');
        fixture.detectChanges();

        expect(stub.StopAndPackageRecording).toHaveBeenCalledTimes(1);
        expect(requests).toEqual([SERVER_RECORDING]);
        expect(Query(fixture, '.mj-diag-recording-banner')).toBeNull();
    });
});
