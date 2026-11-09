import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { LiveKitParticipantAudioComponent } from './livekit-participant-audio.component';

/** A microphone track that only records what it was attached to and detached from; no media is involved. */
class FakeTrack {
  public readonly Attached: HTMLMediaElement[] = [];
  public readonly Detached: HTMLMediaElement[] = [];
  public attach(element: HTMLMediaElement): HTMLMediaElement {
    this.Attached.push(element);
    return element;
  }
  public detach(element: HTMLMediaElement): HTMLMediaElement {
    this.Detached.push(element);
    return element;
  }
}

function view(microphone: FakeTrack | undefined, over: Partial<LiveKitParticipantView> = {}): LiveKitParticipantView {
  return {
    Identity: 'p1',
    DisplayName: 'Ada',
    IsLocal: false,
    Raw: { getTrackPublication: (source: string) => (source === 'microphone' && microphone ? { track: microphone } : undefined) },
    ...over,
  } as unknown as LiveKitParticipantView;
}

/** DOM spec for <mj-livekit-participant-audio>, the room's player for one remote voice. */
describe('LiveKitParticipantAudioComponent (DOM)', () => {
  const render = (participant: LiveKitParticipantView) => renderComponentFixture(LiveKitParticipantAudioComponent, { inputs: { Participant: participant } });

  it("attaches a remote participant's microphone to its audio element", () => {
    const microphone = new FakeTrack();
    const f = render(view(microphone));
    expect(microphone.Attached).toEqual([query(f, 'audio')]);
  });

  it("never plays the local user's own microphone", () => {
    const microphone = new FakeTrack();
    render(view(microphone, { IsLocal: true }));
    expect(microphone.Attached).toEqual([]);
  });

  it('keeps the attachment across views of the same track', () => {
    const microphone = new FakeTrack();
    const f = render(view(microphone));
    f.componentRef.setInput('Participant', view(microphone, { DisplayName: 'Ada L.' }));
    f.detectChanges();
    expect(microphone.Attached).toHaveLength(1);
    expect(microphone.Detached).toEqual([]);
  });

  it('moves to a new microphone track', () => {
    const first = new FakeTrack();
    const second = new FakeTrack();
    const f = render(view(first));
    f.componentRef.setInput('Participant', view(second));
    f.detectChanges();
    expect(first.Detached).toHaveLength(1);
    expect(second.Attached).toHaveLength(1);
  });

  it('detaches when destroyed', () => {
    const microphone = new FakeTrack();
    const f = render(view(microphone));
    f.destroy();
    expect(microphone.Detached).toHaveLength(1);
  });
});
