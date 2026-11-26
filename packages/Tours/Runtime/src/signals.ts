/**
 * @fileoverview Global component signal bus (`TourSignals`) extending `BaseSingleton<TourSignals>`.
 * Components publish semantic events (`TourSignals.Instance.Emit('sales.deal.stageChanged', payload)`)
 * consumed by `Signal` completion checks and `Signal` triggers.
 * @module @memberjunction/tours-runtime
 */

import { BaseSingleton } from '@memberjunction/global';
import { Observable, Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface TourSignalEvent {
    SignalKey: string;
    Payload?: Record<string, unknown>;
    Timestamp: string;
}

/**
 * Process-wide semantic signal bus for Guided Tours.
 * Uses `BaseSingleton` so duplicated module loads share one bus.
 */
export class TourSignals extends BaseSingleton<TourSignals> {
    private _subject = new Subject<TourSignalEvent>();

    protected constructor() {
        super();
    }

    public static get Instance(): TourSignals {
        return super.getInstance<TourSignals>();
    }

    /** Cold/live stream of emitted signals. */
    public get Signals$(): Observable<TourSignalEvent> {
        return this._subject.asObservable();
    }

    /** Emit a named semantic signal with an optional structured payload. */
    public Emit(signalKey: string, payload?: Record<string, unknown>): void {
        const trimmed = signalKey.trim();
        if (!trimmed) {
            return;
        }
        this._subject.next({
            SignalKey: trimmed,
            Payload: payload,
            Timestamp: new Date().toISOString(),
        });
    }

    /** Filtered observable for a specific signal key. */
    public ForKey(signalKey: string): Observable<TourSignalEvent> {
        const target = signalKey.trim();
        return this._subject.pipe(filter((evt) => evt.SignalKey === target));
    }

    /**
     * Resolves with the next matching signal event, or `null` if `timeoutMs` elapses first.
     */
    public WaitForSignal(signalKey: string, timeoutMs?: number): Promise<TourSignalEvent | null> {
        const target = signalKey.trim();
        return new Promise<TourSignalEvent | null>((resolve) => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const sub = this._subject.subscribe((evt) => {
                if (evt.SignalKey === target) {
                    if (timer !== undefined) {
                        clearTimeout(timer);
                    }
                    sub.unsubscribe();
                    resolve(evt);
                }
            });

            if (typeof timeoutMs === 'number' && timeoutMs >= 0) {
                timer = setTimeout(() => {
                    sub.unsubscribe();
                    resolve(null);
                }, timeoutMs);
            }
        });
    }
}
