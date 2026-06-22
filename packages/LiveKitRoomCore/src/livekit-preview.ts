/**
 * @fileoverview {@link LiveKitMediaPreview} — a small, room-free helper for a **PreJoin** lobby: create
 * preview camera/mic tracks before connecting, switch devices, read a live mic level, and tear down. It
 * lets the UI show "what you'll look/sound like" and pick devices ahead of joining (the livekit-client
 * `createLocalTracks` path), then hand the chosen device ids to {@link LiveKitRoomController.Connect}.
 *
 * @module @memberjunction/livekit-room-core
 */

import { createLocalAudioTrack, createLocalVideoTrack, type LocalAudioTrack, type LocalVideoTrack } from 'livekit-client';

/** A live, room-free media preview for a PreJoin screen. */
export class LiveKitMediaPreview {
  private videoTrack: LocalVideoTrack | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private analyser: AnalyserNode | null = null;
  private audioContext: AudioContext | null = null;

  /** The current preview video track, if started. */
  public get VideoTrack(): LocalVideoTrack | null {
    return this.videoTrack;
  }

  /**
   * Starts (or restarts) the preview camera track, optionally on a specific device.
   *
   * @param deviceId Optional camera device id.
   * @returns The preview video track.
   */
  public async StartVideo(deviceId?: string): Promise<LocalVideoTrack> {
    await this.StopVideo();
    this.videoTrack = await createLocalVideoTrack({ deviceId });
    return this.videoTrack;
  }

  /**
   * Starts (or restarts) the preview microphone track and wires a live-level analyser.
   *
   * @param deviceId Optional microphone device id.
   * @returns The preview audio track.
   */
  public async StartAudio(deviceId?: string): Promise<LocalAudioTrack> {
    await this.StopAudio();
    this.audioTrack = await createLocalAudioTrack({ deviceId });
    this.wireLevelAnalyser(this.audioTrack);
    return this.audioTrack;
  }

  /**
   * Reads the current microphone level (0..1) for a preview meter. Returns 0 when audio is not started.
   */
  public ReadMicLevel(): number {
    if (!this.analyser) {
      return 0;
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (const v of data) {
      sum += v;
    }
    return Math.min(1, sum / data.length / 128);
  }

  /** Stops the preview video track. */
  public async StopVideo(): Promise<void> {
    this.videoTrack?.stop();
    this.videoTrack = null;
  }

  /** Stops the preview audio track and tears down the analyser. */
  public async StopAudio(): Promise<void> {
    this.audioTrack?.stop();
    this.audioTrack = null;
    this.analyser = null;
    if (this.audioContext) {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
  }

  /** Stops all preview tracks. Call when leaving the PreJoin screen. */
  public async Stop(): Promise<void> {
    await Promise.all([this.StopVideo(), this.StopAudio()]);
  }

  /** Wires a WebAudio analyser to the preview audio track for the level meter. */
  private wireLevelAnalyser(track: LocalAudioTrack): void {
    const mediaTrack = track.mediaStreamTrack;
    if (!mediaTrack || typeof AudioContext === 'undefined') {
      return;
    }
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    source.connect(this.analyser);
  }
}
