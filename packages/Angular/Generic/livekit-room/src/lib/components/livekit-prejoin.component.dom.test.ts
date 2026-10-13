import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import type * as LiveKitRoomCore from '@memberjunction/livekit-room-core';
import { LiveKitPreJoinComponent, type LiveKitPreJoinChoices } from './livekit-prejoin.component';

/** Every preview the wrapper creates, so a spec can read what it was asked to do. */
const previews = vi.hoisted(() => ({ Created: [] as Array<{ Calls: string[] }> }));

/** A LiveKit preview that records its calls instead of opening a camera or a microphone. */
vi.mock('@memberjunction/livekit-room-core', async (importOriginal) => {
  const actual = await importOriginal<typeof LiveKitRoomCore>();
  class FakeMediaPreview {
    public readonly Calls: string[] = [];
    constructor() {
      previews.Created.push(this);
    }
    public async StartAudio(deviceId?: string): Promise<void> {
      this.Calls.push(`audio:${deviceId ?? ''}`);
    }
    public async StopAudio(): Promise<void> {
      this.Calls.push('stop-audio');
    }
    public async StartVideo(deviceId?: string): Promise<{ attach(e: HTMLVideoElement): HTMLVideoElement; detach(e: HTMLVideoElement): HTMLVideoElement }> {
      this.Calls.push(`video:${deviceId ?? ''}`);
      return { attach: (e) => e, detach: (e) => e };
    }
    public async StopVideo(): Promise<void> {
      this.Calls.push('stop-video');
    }
    public async Stop(): Promise<void> {
      this.Calls.push('stop');
    }
    public ReadMicLevel(): number {
      return 0.5;
    }
  }
  return { ...actual, LiveKitMediaPreview: FakeMediaPreview };
});

const DEVICES = [
  { kind: 'audioinput', deviceId: 'mic-1', label: 'Built-in Mic', groupId: '' },
  { kind: 'audioinput', deviceId: 'mic-2', label: 'USB Mic', groupId: '' },
  { kind: 'videoinput', deviceId: 'cam-1', label: 'FaceTime HD', groupId: '' },
  { kind: 'videoinput', deviceId: 'cam-2', label: 'USB Camera', groupId: '' },
];

/** Lets the wrapper's async start (preview, then devices) finish, then renders. */
async function settle(f: { detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  f.detectChanges();
}

/**
 * DOM spec for the deprecated <mj-livekit-prejoin>: it runs LiveKit's preview and renders `mj-camera-check`, so its
 * own job is the preview's calls and the join choices.
 */
describe('LiveKitPreJoinComponent (DOM, fake preview)', () => {
  beforeEach(() => {
    previews.Created.length = 0;
    Object.defineProperty(navigator, 'mediaDevices', { value: { enumerateDevices: async () => DEVICES }, configurable: true });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'mediaDevices');
    vi.unstubAllGlobals();
  });

  const render = (inputs: Record<string, unknown> = {}) => renderComponentFixture(LiveKitPreJoinComponent, { inputs: { ...inputs } });
  const calls = () => previews.Created[0].Calls;

  it('previews the camera it starts with, and joins with the choices', async () => {
    const f = render({ StartWithCamera: true, InitialDisplayName: 'Ada' });
    await settle(f);
    expect(calls()).toEqual(['audio:', 'video:']);
    expect(query(f, '.check__video')?.classList.contains('check__video--hidden')).toBe(false);
    const joined: LiveKitPreJoinChoices[] = [];
    f.componentInstance.Join.subscribe((c: LiveKitPreJoinChoices) => joined.push(c));
    const name = query(f, 'input') as HTMLInputElement;
    name.value = ' Grace ';
    name.dispatchEvent(new Event('input'));
    f.detectChanges();
    (query(f, '.check__confirm') as HTMLButtonElement).click();
    expect(joined).toEqual([{ DisplayName: 'Grace', MicrophoneEnabled: true, CameraEnabled: true, MicrophoneDeviceId: 'mic-1', CameraDeviceId: 'cam-1' }]);
  });

  it('stops the camera preview when the camera is turned off', async () => {
    const f = render({ StartWithCamera: true });
    await settle(f);
    (query(f, 'button[title="Turn off camera"]') as HTMLButtonElement).click();
    await settle(f);
    expect(calls()).toContain('stop-video');
    expect(f.componentInstance.CameraSource).toBeNull();
    expect(query(f, '.check__video')?.classList.contains('check__video--hidden')).toBe(true);
  });

  it('restarts the camera preview on a picked camera while the camera is on', async () => {
    const f = render({ StartWithCamera: true });
    await settle(f);
    const cameras = (Array.from(f.nativeElement.querySelectorAll('select')) as HTMLSelectElement[])[1];
    cameras.value = 'cam-2';
    cameras.dispatchEvent(new Event('change'));
    await settle(f);
    expect(calls()).toContain('video:cam-2');
    expect(f.componentInstance.SelectedCam).toBe('cam-2');
  });

  it('restarts the microphone preview on a picked microphone', async () => {
    const f = render();
    await settle(f);
    const mics = query(f, 'select') as HTMLSelectElement;
    mics.value = 'mic-2';
    mics.dispatchEvent(new Event('change'));
    await settle(f);
    expect(calls()).toContain('audio:mic-2');
    expect(f.componentInstance.SelectedMic).toBe('mic-2');
  });

  it('stops the preview when it goes away', async () => {
    const f = render();
    await settle(f);
    f.destroy();
    await settle({ detectChanges: () => undefined });
    expect(calls()).toContain('stop');
  });
});
