import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Input, OnDestroy, ViewChild } from '@angular/core';
import { Track } from 'livekit-client';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';

/**
 * `mj-livekit-participant-audio`: plays one remote participant's microphone through a hidden audio element. The
 * room renders one per remote participant, outside its layouts, so every voice plays whatever the layout shows; a
 * tile never plays audio. The local user's own microphone is never played back.
 */
@Component({
  selector: 'mj-livekit-participant-audio',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<audio #audio autoplay></audio>`,
  styles: [':host { display: none; }'],
})
export class LiveKitParticipantAudioComponent implements AfterViewInit, OnDestroy {
  @ViewChild('audio') private audioRef?: ElementRef<HTMLAudioElement>;
  private participant: LiveKitParticipantView | null = null;
  private viewReady = false;
  private attached: { Track: Track; Element: HTMLAudioElement } | null = null;

  /** The participant whose voice to play. A different microphone track replaces the attached one. */
  @Input()
  public set Participant(value: LiveKitParticipantView | null) {
    this.participant = value;
    if (this.viewReady) {
      this.sync();
    }
  }
  public get Participant(): LiveKitParticipantView | null {
    return this.participant;
  }

  public ngAfterViewInit(): void {
    this.viewReady = true;
    this.sync();
  }

  public ngOnDestroy(): void {
    this.detach();
  }

  /** Attaches the participant's microphone track when it differs from the attached one. */
  private sync(): void {
    const element = this.audioRef?.nativeElement;
    const participant = this.participant;
    const track = element && participant && !participant.IsLocal ? participant.Raw.getTrackPublication(Track.Source.Microphone)?.track : undefined;
    if (this.attached?.Track === track) {
      return;
    }
    this.detach();
    if (track && element) {
      track.attach(element);
      this.attached = { Track: track, Element: element };
    }
  }

  private detach(): void {
    this.attached?.Track.detach(this.attached.Element);
    this.attached = null;
  }
}
