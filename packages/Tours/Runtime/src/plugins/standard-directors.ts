/**
 * @fileoverview Standard session directors:
 * - `VisualTourDirector` (`'Visual'`): no-LLM default UI player
 * - `VerifyTourDirector` (`'Verify'`): headless CI replay walker verifying prepare, anchors, and default path
 * - `RecorderTourDirector` (`'Recorder'`): authoring capture helper for Tour Studio
 * @module @memberjunction/tours-runtime
 */

import { RegisterClass } from '@memberjunction/global';
import type { ITourAnchor, TourAnchorResolution, TourStepDefinition } from '../types';
import { BaseTourDirector } from './base-director';

@RegisterClass(BaseTourDirector, 'Visual')
export class VisualTourDirector extends BaseTourDirector {
    public readonly DirectorType = 'Visual';
}

export interface VerifyStepReport {
    StepKey: string;
    Prepared: boolean;
    AnchorResolution: TourAnchorResolution;
    AnchorFound: boolean;
    ErrorMessage?: string;
}

export interface VerifyTourReport {
    TourKey: string;
    Passed: boolean;
    VisitedStepKeys: string[];
    StepReports: VerifyStepReport[];
}

/**
 * Headless CI replay director (`'Verify'`): walks a tour along its default pathway,
 * verifying each step's `Prepare`, anchor resolution, and transition without manual clicks.
 */
@RegisterClass(BaseTourDirector, 'Verify')
export class VerifyTourDirector extends BaseTourDirector {
    public readonly DirectorType = 'Verify';

    public async ReplayAll(): Promise<VerifyTourReport> {
        if (!this.Session || !this.DirectorToken) {
            throw new Error('VerifyTourDirector is not attached to a TourSession.');
        }

        const reports: VerifyStepReport[] = [];
        const visited: string[] = [];

        if (this.Session.Status === 'Pending') {
            const started = await this.Session.Start();
            if (!started) {
                return {
                    TourKey: this.Session.Tour.TourKey,
                    Passed: false,
                    VisitedStepKeys: visited,
                    StepReports: reports,
                };
            }
        }

        let safetyCounter = 0;
        const maxSteps = Math.max(1, this.Session.Tour.Steps.length * 2);

        while (
            this.Session.CurrentStepView &&
            this.Session.Status === 'In Progress' &&
            safetyCounter < maxSteps
        ) {
            safetyCounter++;
            const stepView = this.Session.CurrentStepView;
            visited.push(stepView.StepKey);
            const anchorOk = stepView.Anchor === null || stepView.AnchorResolved;
            reports.push({
                StepKey: stepView.StepKey,
                Prepared: true,
                AnchorResolution: stepView.AnchorResolution,
                AnchorFound: anchorOk,
                ErrorMessage: anchorOk ? undefined : `Anchor failed to resolve for step '${stepView.StepKey}'.`,
            });

            await this.Session.Advance(this.DirectorToken, {
                Outcome: anchorOk ? 'Completed' : 'Anchor Missing',
                AnchorResolution: stepView.AnchorResolution,
            });
        }

        const passed =
            this.Session.Status === 'Completed' &&
            reports.every((r) => r.AnchorFound);

        return {
            TourKey: this.Session.Tour.TourKey,
            Passed: passed,
            VisitedStepKeys: visited,
            StepReports: reports,
        };
    }
}

export interface RecordedStepCapture {
    StepKey: string;
    Anchor: ITourAnchor;
    ActionKind: 'click' | 'input' | 'navigate';
    Label?: string;
    Timestamp: string;
}

/**
 * Authoring capture director (`'Recorder'`) used by Tour Studio to record user actions
 * into draft `TourStepDefinition` rows.
 */
@RegisterClass(BaseTourDirector, 'Recorder')
export class RecorderTourDirector extends BaseTourDirector {
    public readonly DirectorType = 'Recorder';
    private readonly _captures: RecordedStepCapture[] = [];

    public RecordInteraction(capture: Omit<RecordedStepCapture, 'Timestamp'>): void {
        this._captures.push({
            ...capture,
            Timestamp: new Date().toISOString(),
        });
    }

    public GetCaptures(): readonly RecordedStepCapture[] {
        return this._captures;
    }

    public ToDraftSteps(): TourStepDefinition[] {
        return this._captures.map((cap, idx) => ({
            StepKey: cap.StepKey,
            Sequence: (idx + 1) * 10,
            StepType: cap.ActionKind === 'navigate' ? 'Spotlight' : 'Action',
            Title: cap.Label ?? `Step ${idx + 1}`,
            Body: cap.Label ?? '',
            Anchor: cap.Anchor,
            Mode: 'Guide',
        }));
    }

    public Clear(): void {
        this._captures.length = 0;
    }
}
