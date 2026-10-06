import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, queryAll } from '@memberjunction/ng-test-utils';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';
import { LiveKitAudioMeterComponent } from './livekit-audio-meter.component';

/**
 * DOM spec for the deprecated <mj-livekit-audio-meter> wrapper: it renders `mj-audio-meter` (whose own spec, in
 * ng-realtime-media, covers the animation) with the room's settings and the participant's live level.
 */
describe('LiveKitAudioMeterComponent (DOM, deprecated wrapper)', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("renders the room's seven bars and reads the participant's live level", () => {
    const raw = { audioLevel: 0.4 };
    const f = renderComponentFixture(LiveKitAudioMeterComponent, { inputs: { Participant: { Raw: raw } as unknown as LiveKitParticipantView } });
    expect(queryAll(f, 'mj-audio-meter .meter__bar')).toHaveLength(7);
    expect(f.componentInstance.Level?.()).toBe(0.4);
    raw.audioLevel = 0.9;
    expect(f.componentInstance.Level?.()).toBe(0.9);
  });

  it('reads nothing without a participant', () => {
    expect(renderComponentFixture(LiveKitAudioMeterComponent).componentInstance.Level).toBeNull();
  });
});
