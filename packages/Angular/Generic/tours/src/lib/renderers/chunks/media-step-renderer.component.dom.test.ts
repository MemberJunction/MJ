import { TestBed } from '@angular/core/testing';
import {
  TourSignals,
  type IMediaStepConfig,
  type ITourStepConfiguration,
  type TourSessionView,
  type TourStepView,
} from '@memberjunction/tours-runtime';
import { describe, expect, it, vi } from 'vitest';
import { MediaStepRenderer } from './media-step-renderer.component';

type MediaWithTranscriptConfig = IMediaStepConfig & ITourStepConfiguration & { Transcript?: string };

function makeMediaStep(
  config: MediaWithTranscriptConfig,
  overrides: Partial<TourStepView<MediaWithTranscriptConfig>> = {},
): TourStepView<MediaWithTranscriptConfig> {
  return {
    StepKey: 'media-1',
    Sequence: 10,
    StepIndex: 1,
    TotalSteps: 3,
    StepType: 'Media',
    Title: 'Product Walkthrough',
    Body: 'Watch this quick overview.',
    Placement: 'center',
    Mode: 'Guide',
    IsOptional: false,
    Anchor: null,
    AnchorResolved: true,
    AnchorResolution: 'Registered',
    Configuration: config,
    WaitingForCompletion: false,
    ...overrides,
  };
}

function makeSession(step: TourStepView<MediaWithTranscriptConfig>, canGoBack = true): TourSessionView {
  return {
    RunID: 'run-media-1',
    TourKey: 'core.media',
    TourName: 'Media Tour',
    TourVersionID: 'ver-1',
    Status: 'In Progress',
    GuideMode: 'Visual',
    DirectorType: 'Visual',
    PresenterClass: 'Overlay',
    CurrentStep: step,
    CompletedStepKeys: ['step-0'],
    PathTaken: ['step-0', step.StepKey],
    CanGoBack: canGoBack,
    CanAdvance: true,
    StepIndex: step.StepIndex,
    StepCount: step.TotalSteps,
    IsPaused: false,
    GoalMet: false,
  };
}

describe('MediaStepRenderer', () => {
  it('renders accessible video element with src, poster, aria-label, captions track, and transcript', () => {
    const step = makeMediaStep({
      MediaType: 'video',
      SourceUrl: 'https://example.org/walkthrough.mp4',
      PosterUrl: 'https://example.org/poster.jpg',
      CaptionsUrl: 'https://example.org/captions.vtt',
      AltText: 'Walkthrough video',
      Transcript: 'Welcome to the dashboard tour.',
    });
    const fixture = TestBed.createComponent(MediaStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const h2 = fixture.nativeElement.querySelector('h2') as HTMLElement;
    const body = fixture.nativeElement.querySelector('.mjt-body') as HTMLElement;
    expect(dialog.getAttribute('aria-labelledby')).toBe(h2.id);
    expect(dialog.getAttribute('aria-describedby')).toBe(body.id);

    const video = fixture.nativeElement.querySelector('video.mjt-media-video') as HTMLVideoElement;
    const track = fixture.nativeElement.querySelector('track[kind="captions"]') as HTMLTrackElement;
    const transcript = fixture.nativeElement.querySelector('details.mjt-transcript') as HTMLElement;

    expect(video.getAttribute('src')).toBe('https://example.org/walkthrough.mp4');
    expect(video.getAttribute('poster')).toBe('https://example.org/poster.jpg');
    expect(video.getAttribute('aria-label')).toBe('Walkthrough video');
    expect(track.getAttribute('src')).toBe('https://example.org/captions.vtt');
    expect(transcript.textContent).toContain('Welcome to the dashboard tour.');
  });

  it('emits SignalEmitted and auto-advances NextRequested when video ended event fires with AutoAdvanceOnEnd', () => {
    const step = makeMediaStep({
      MediaType: 'video',
      SourceUrl: 'https://example.org/walkthrough.mp4',
      AltText: 'Walkthrough video',
      AutoAdvanceOnEnd: true,
    });
    const fixture = TestBed.createComponent(MediaStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step));
    fixture.detectChanges();

    const signalSpy = vi.fn();
    const nextSpy = vi.fn();
    const tourSignalSpy = vi.fn();
    const sub = TourSignals.Instance.ForKey('tours.media.ended.media-1').subscribe(tourSignalSpy);

    fixture.componentInstance.SignalEmitted.subscribe(signalSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);

    const video = fixture.nativeElement.querySelector('video.mjt-media-video') as HTMLVideoElement;
    video.dispatchEvent(new Event('ended'));

    expect(tourSignalSpy).toHaveBeenCalledWith(
      expect.objectContaining({ SignalKey: 'tours.media.ended.media-1', Payload: { StepKey: 'media-1' } }),
    );
    expect(signalSpy).toHaveBeenCalledWith({
      StepKey: 'media-1',
      SignalKey: 'tours.media.ended.media-1',
    });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'media-1' });
    sub.unsubscribe();
  });

  it('renders image media with src and alt, omits aria-describedby when Body empty, and wires footer outputs', () => {
    const step = makeMediaStep(
      {
        MediaType: 'image',
        SourceUrl: 'https://example.org/screenshot.png',
        AltText: 'Dashboard screenshot',
        NextButtonText: 'Got it',
      },
      { Body: '' },
    );
    const fixture = TestBed.createComponent(MediaStepRenderer);
    fixture.componentRef.setInput('Step', step);
    fixture.componentRef.setInput('Session', makeSession(step, true));
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-describedby')).toBeNull();

    const img = fixture.nativeElement.querySelector('img.mjt-media-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('https://example.org/screenshot.png');
    expect(img.getAttribute('alt')).toBe('Dashboard screenshot');

    const backSpy = vi.fn();
    const nextSpy = vi.fn();
    const dismissSpy = vi.fn();
    fixture.componentInstance.BackRequested.subscribe(backSpy);
    fixture.componentInstance.NextRequested.subscribe(nextSpy);
    fixture.componentInstance.DismissRequested.subscribe(dismissSpy);

    const backBtn = fixture.nativeElement.querySelector('button[variant="secondary"]') as HTMLButtonElement;
    const nextBtn = fixture.nativeElement.querySelector('button[variant="primary"]') as HTMLButtonElement;
    const dismissBtn = fixture.nativeElement.querySelector('button[variant="flat"]') as HTMLButtonElement;

    expect(nextBtn.textContent?.trim()).toBe('Got it');
    backBtn.click();
    nextBtn.click();
    dismissBtn.click();

    expect(backSpy).toHaveBeenCalledWith({ StepKey: 'media-1' });
    expect(nextSpy).toHaveBeenCalledWith({ StepKey: 'media-1' });
    expect(dismissSpy).toHaveBeenCalledWith({ StepKey: 'media-1' });
  });
});
