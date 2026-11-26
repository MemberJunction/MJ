/**
 * @fileoverview Abstract base class for session directors (`BaseTourDirector`).
 * A `TourSession` has one active director at a time (Visual, Chat, Voice, Verify, Recorder).
 * @module @memberjunction/tours-runtime
 */

import { RequiresSubclass } from '@memberjunction/global';
import type { TourSession } from '../tour-session';

export interface TourDirectorAttachOptions {
    Session: TourSession;
    DirectorToken: string;
}

/**
 * Director plugin controlling a `TourSession`.
 * Registered via `@RegisterClass(BaseTourDirector, '<DirectorType>')`.
 */
@RequiresSubclass()
export abstract class BaseTourDirector {
    public abstract readonly DirectorType: string;

    protected Session: TourSession | null = null;
    protected DirectorToken: string | null = null;

    public Attach(options: TourDirectorAttachOptions): void {
        this.Session = options.Session;
        this.DirectorToken = options.DirectorToken;
    }

    public Detach(): void {
        this.Session = null;
        this.DirectorToken = null;
    }
}
