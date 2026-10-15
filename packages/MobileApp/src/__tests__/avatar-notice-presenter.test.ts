import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeAvatarNotice } from '@memberjunction/realtime-runtime';
import { AVATAR_NOTICE_HIDE_AFTER_MS, AvatarNoticePresenter, type AvatarNoticeSource } from '@/voice/avatar-notice-presenter';

/**
 * Tests for when the voice screen shows the "Audio only" notice.
 *
 * The rules are the web overlay's: once per call, gone on ✕ or after ten seconds, gone when the
 * session ends. The runtime decides whether there is a notice at all; these tests feed the presenter
 * the way the runtime's `AvatarNotice$` does and assert what the screen is told to show.
 */

/** Plays the runtime's `AvatarNotice$`: a new subscriber gets the latest value, like a BehaviorSubject. */
class FakeNoticeStream implements AvatarNoticeSource {
    private readonly listeners = new Set<(notice: RealtimeAvatarNotice | null) => void>();
    private latest: RealtimeAvatarNotice | null = null;

    public subscribe(next: (notice: RealtimeAvatarNotice | null) => void): { unsubscribe(): void } {
        this.listeners.add(next);
        next(this.latest);
        return { unsubscribe: () => this.listeners.delete(next) };
    }

    public Emit(notice: RealtimeAvatarNotice | null): void {
        this.latest = notice;
        this.listeners.forEach((listener) => listener(notice));
    }

    public get ListenerCount(): number {
        return this.listeners.size;
    }
}

const HOST: RealtimeAvatarNotice = { Reason: 'host' };
const ENDPOINT: RealtimeAvatarNotice = { Reason: 'endpoint' };

/** A presenter on a fresh stream, recording every change it reports to the screen. */
function startCall(stream = new FakeNoticeStream()) {
    const changes: Array<RealtimeAvatarNotice | null> = [];
    const presenter = new AvatarNoticePresenter(stream, (notice) => changes.push(notice));
    return { stream, changes, presenter };
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('AvatarNoticePresenter', () => {
    it('shows nothing while the runtime has no notice', () => {
        const { changes, presenter } = startCall();
        expect(changes).toEqual([]);
        expect(presenter.Current).toBeNull();
    });

    it('shows the first notice of the call', () => {
        const { stream, changes, presenter } = startCall();
        stream.Emit(HOST);
        expect(changes).toEqual([HOST]);
        expect(presenter.Current).toBe(HOST);
    });

    it('shows a notice the runtime set before the screen subscribed', () => {
        // The runtime sets its notice after Connect; a screen that subscribes later still sees it.
        const stream = new FakeNoticeStream();
        stream.Emit(HOST);
        const { changes } = startCall(stream);
        expect(changes).toEqual([HOST]);
    });

    it('hides an undismissed notice after ten seconds, not before', () => {
        const { stream, changes, presenter } = startCall();
        stream.Emit(HOST);
        vi.advanceTimersByTime(AVATAR_NOTICE_HIDE_AFTER_MS - 1);
        expect(presenter.Current).toBe(HOST);
        vi.advanceTimersByTime(1);
        expect(changes).toEqual([HOST, null]);
        expect(presenter.Current).toBeNull();
    });

    it('waits ten seconds by default', () => {
        expect(AVATAR_NOTICE_HIDE_AFTER_MS).toBe(10_000);
    });

    it('hides on dismiss and does not bring the notice back in the same call', () => {
        const { stream, changes, presenter } = startCall();
        stream.Emit(HOST);
        presenter.Dismiss();
        expect(changes).toEqual([HOST, null]);
        // A resume or a re-evaluation can re-emit; the call has already shown its notice.
        stream.Emit(HOST);
        stream.Emit(ENDPOINT);
        vi.advanceTimersByTime(AVATAR_NOTICE_HIDE_AFTER_MS * 2);
        expect(changes).toEqual([HOST, null]);
    });

    it('stops the ten-second timer on dismiss', () => {
        const { stream, presenter } = startCall();
        stream.Emit(HOST);
        presenter.Dismiss();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('shows one notice per call: a second one does not replace the first', () => {
        const { stream, changes, presenter } = startCall();
        stream.Emit(HOST);
        stream.Emit(ENDPOINT);
        expect(changes).toEqual([HOST]);
        expect(presenter.Current).toBe(HOST);
    });

    it('does not bring an expired notice back', () => {
        const { stream, changes } = startCall();
        stream.Emit(HOST);
        vi.advanceTimersByTime(AVATAR_NOTICE_HIDE_AFTER_MS);
        stream.Emit(HOST);
        expect(changes).toEqual([HOST, null]);
    });

    it('hides when the runtime clears its notice at session end', () => {
        const { stream, changes } = startCall();
        stream.Emit(HOST);
        stream.Emit(null);
        expect(changes).toEqual([HOST, null]);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('shows the notice again on the next call', () => {
        const first = startCall();
        first.stream.Emit(HOST);
        first.presenter.Dismiss();
        first.presenter.Dispose();
        const second = startCall();
        second.stream.Emit(HOST);
        expect(second.changes).toEqual([HOST]);
    });

    it('takes the notice down, stops its timer and stops listening when disposed', () => {
        const { stream, changes, presenter } = startCall();
        stream.Emit(HOST);
        presenter.Dispose();
        expect(changes).toEqual([HOST, null]);
        expect(vi.getTimerCount()).toBe(0);
        expect(stream.ListenerCount).toBe(0);
    });

    it('reports nothing when disposed with no notice showing', () => {
        const { changes, presenter } = startCall();
        presenter.Dispose();
        expect(changes).toEqual([]);
    });
});
