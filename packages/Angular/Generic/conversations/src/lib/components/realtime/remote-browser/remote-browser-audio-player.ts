/**
 * The CLIENT-SIDE player for the Remote Browser tab-audio stream — the audio sibling of the surface's
 * screencast canvas. The channel feeds it each pushed {@link RemoteBrowserAudioChunkInput} (a base64
 * `audio/webm;codecs=opus` slice); the player appends them to a `MediaSource` `SourceBuffer` feeding a
 * hidden `<audio>` element so the user HEARS what the co-agent is playing in the browser.
 *
 * The append/queue/seq logic is split from the DOM so it's unit-testable without a browser:
 *  - {@link IAudioSink} is the thin DOM seam (create/append/error/muted) — faked in tests, wired to a real
 *    `MediaSource` + `<audio>` in {@link MediaSourceAudioSink}.
 *  - {@link RemoteBrowserAudioPlayer} owns the queue, sequential append (a `SourceBuffer` can only take one
 *    append at a time), overflow drop, and sequence-gap resync — all framework- and DOM-free.
 *
 * Codec note: only `'webm-opus'` chunks are appendable to the `audio/webm;codecs=opus` SourceBuffer; other
 * codecs (reserved for future backend capture paths) are dropped with a one-time warning.
 */

/** The narrow shape of a pushed audio chunk the player consumes (mirrors the server envelope fields). */
export interface RemoteBrowserAudioChunkInput {
  /** The encoded audio slice as raw base64 (no `data:` prefix). */
  dataBase64: string;
  /** The codec / container. Only `'webm-opus'` is currently playable. */
  codec: string;
  /** Sample rate in Hz (informational; the webm container is self-describing). */
  sampleRate: number;
  /** Channel count (informational). */
  channels: number;
  /** Monotonic sequence number for ordering / gap detection. */
  seq: number;
}

/**
 * The DOM seam the {@link RemoteBrowserAudioPlayer} drives. A real implementation wires a `MediaSource` +
 * `SourceBuffer` + hidden `<audio>`; tests provide a fake that records appends. Kept deliberately tiny so
 * the player's queueing logic is the part under test, not the browser media stack.
 */
export interface IAudioSink {
  /**
   * Prepares the sink for playback: creates the media source / source buffer / audio element and resolves
   * once it is ready to accept {@link AppendChunk}. Idempotent — a second call while ready is a no-op.
   */
  Open(): Promise<void>;

  /**
   * Appends one decoded-container byte slice to the underlying buffer. Rejects if the sink isn't open or
   * the underlying buffer rejects the append (the player then drops the chunk and continues).
   *
   * @param bytes The raw container bytes (e.g. a webm-opus slice) to append.
   */
  AppendChunk(bytes: Uint8Array): Promise<void>;

  /** Whether the sink can currently accept an append (open and not mid-error / closed). */
  readonly IsOpen: boolean;

  /** Mutes or unmutes playback (the speaker toggle). */
  SetMuted(muted: boolean): void;

  /** Tears the sink down: stops playback and releases the media source / audio element. Idempotent. */
  Close(): void;
}

/** Max chunks buffered ahead of the sink before the OLDEST are dropped (keeps latency + memory bounded). */
const MAX_QUEUE_DEPTH = 64;

/**
 * Sequential, overflow-bounded player for a continuous webm-opus chunk stream. Construct it with an
 * {@link IAudioSink}; call {@link Enqueue} for each pushed chunk and {@link SetMuted} for the speaker
 * toggle; call {@link Dispose} on teardown.
 */
export class RemoteBrowserAudioPlayer {
  /** The DOM (or fake) sink chunks are appended to. */
  private readonly sink: IAudioSink;

  /** Pending decoded chunks awaiting append, oldest first. Bounded by {@link MAX_QUEUE_DEPTH}. */
  private readonly queue: Uint8Array[] = [];

  /** True while an append is in flight (a SourceBuffer accepts one append at a time). */
  private appending = false;

  /** The sequence number of the last chunk we ACCEPTED, or `null` before the first. Drives gap detection. */
  private lastSeq: number | null = null;

  /** True once {@link Open} has been kicked off, so we don't re-open on every chunk. */
  private opening = false;

  /** True after {@link Dispose} so a late append / open resolution becomes a no-op. */
  private disposed = false;

  /** Pending muted state to apply once the sink opens (the toggle can fire before the first chunk). */
  private muted = false;

  /** Set once we've warned about an unplayable codec, so the log isn't spammed per chunk. */
  private warnedUnplayableCodec = false;

  /**
   * Constructs a player over the given sink.
   *
   * @param sink The audio sink (real {@link MediaSourceAudioSink} in the app, a fake in tests).
   */
  constructor(sink: IAudioSink) {
    this.sink = sink;
  }

  /** The current queue depth — exposed for tests / diagnostics. */
  public get QueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Enqueues one pushed audio chunk for playback. Drops chunks whose codec isn't playable, opens the sink
   * lazily on the first playable chunk, detects sequence gaps (logged; the webm stream self-recovers on the
   * next keyframe), and bounds the queue by dropping the oldest on overflow. Never throws.
   *
   * @param chunk The pushed chunk to play.
   */
  public Enqueue(chunk: RemoteBrowserAudioChunkInput): void {
    if (this.disposed || !chunk || typeof chunk.dataBase64 !== 'string' || chunk.dataBase64.length === 0) {
      return;
    }
    if (chunk.codec !== 'webm-opus') {
      if (!this.warnedUnplayableCodec) {
        this.warnedUnplayableCodec = true;
        console.warn(`[RemoteBrowserAudio] dropping chunk with unplayable codec '${chunk.codec}' (only webm-opus is supported).`);
      }
      return;
    }
    this.noteSequence(chunk.seq);

    const bytes = this.decodeBase64(chunk.dataBase64);
    if (!bytes) {
      return;
    }
    this.pushBounded(bytes);
    void this.ensureOpenThenDrain();
  }

  /**
   * Mutes / unmutes playback (the speaker toggle). Safe to call before the sink opens — the state is
   * applied once it does.
   *
   * @param muted `true` to mute, `false` to unmute.
   */
  public SetMuted(muted: boolean): void {
    this.muted = muted;
    if (this.sink.IsOpen) {
      this.sink.SetMuted(muted);
    }
  }

  /** Tears the player down: clears the queue and closes the sink. Idempotent. */
  public Dispose(): void {
    this.disposed = true;
    this.queue.length = 0;
    this.sink.Close();
  }

  /**
   * Records a chunk's sequence number and logs a one-line note when a gap is detected (a non-consecutive
   * seq). We don't try to reorder — webm-opus self-recovers at the next cluster — but the note aids
   * diagnosis of a lossy transport.
   *
   * @param seq The incoming chunk's sequence number.
   */
  private noteSequence(seq: number): void {
    if (this.lastSeq !== null && seq > this.lastSeq + 1) {
      console.warn(`[RemoteBrowserAudio] audio sequence gap: expected ${this.lastSeq + 1}, got ${seq} (dropped ${seq - this.lastSeq - 1}).`);
    }
    // Track the highest seq seen so an out-of-order late chunk doesn't reset the expectation backwards.
    this.lastSeq = this.lastSeq === null ? seq : Math.max(this.lastSeq, seq);
  }

  /** Pushes bytes onto the queue, dropping the OLDEST when the queue is at {@link MAX_QUEUE_DEPTH}. */
  private pushBounded(bytes: Uint8Array): void {
    if (this.queue.length >= MAX_QUEUE_DEPTH) {
      this.queue.shift(); // drop-oldest: bound latency + memory under a slow sink
    }
    this.queue.push(bytes);
  }

  /**
   * Ensures the sink is open (opening it lazily on first use) and then drains the queue. The open is
   * kicked off once; subsequent calls just drain. Best-effort — an open/append failure is logged and the
   * player keeps trying on the next chunk.
   */
  private async ensureOpenThenDrain(): Promise<void> {
    if (!this.sink.IsOpen && !this.opening) {
      this.opening = true;
      try {
        await this.sink.Open();
        if (this.disposed) {
          this.sink.Close();
          return;
        }
        this.sink.SetMuted(this.muted);
      } catch (err) {
        this.opening = false;
        console.warn(`[RemoteBrowserAudio] failed to open audio sink: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }
    void this.drain();
  }

  /**
   * Appends queued chunks to the sink one at a time (a SourceBuffer rejects concurrent appends). Re-entrant
   * safe via the {@link appending} guard; stops when the queue empties, the sink closes, or on disposal.
   */
  private async drain(): Promise<void> {
    if (this.appending || this.disposed || !this.sink.IsOpen) {
      return;
    }
    this.appending = true;
    try {
      while (this.queue.length > 0 && this.sink.IsOpen && !this.disposed) {
        const bytes = this.queue.shift()!;
        try {
          await this.sink.AppendChunk(bytes);
        } catch (err) {
          // A single rejected append (e.g. a quota hiccup) shouldn't kill playback — drop it and continue.
          console.warn(`[RemoteBrowserAudio] dropped an audio chunk on append: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      this.appending = false;
    }
  }

  /**
   * Decodes a base64 string to bytes WITHOUT the DOM `atob` so the queueing logic is testable in Node too.
   * Returns `null` on malformed input (the chunk is then skipped).
   *
   * @param base64 The base64 string to decode.
   * @returns The decoded bytes, or `null` when the input can't be decoded.
   */
  private decodeBase64(base64: string): Uint8Array | null {
    try {
      // Prefer the platform decoder when present (browser `atob`), else Node's Buffer.
      const globalAtob = (globalThis as { atob?: (s: string) => string }).atob;
      if (typeof globalAtob === 'function') {
        const binary = globalAtob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      }
      const nodeBuffer = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
      if (nodeBuffer) {
        return Uint8Array.from(nodeBuffer.from(base64, 'base64'));
      }
      return null;
    } catch {
      return null;
    }
  }
}

/**
 * The real, DOM-backed {@link IAudioSink}: a `MediaSource` whose single `audio/webm;codecs=opus`
 * `SourceBuffer` is fed appended chunks, attached to a hidden `<audio>` element that auto-plays. Autoplay
 * is permitted because the realtime call the user already started is the activating gesture.
 *
 * Kept out of the player's hot path so the queueing logic stays unit-testable; this class is exercised in
 * the live app (it can't be meaningfully unit-tested without a browser media stack).
 */
export class MediaSourceAudioSink implements IAudioSink {
  /** MIME the SourceBuffer is created with — the in-page recorder's output container/codec. */
  private static readonly MIME = 'audio/webm;codecs=opus';

  /** The hidden audio element playback is routed through; `null` before {@link Open} / after {@link Close}. */
  private audio: HTMLAudioElement | null = null;
  /** The MediaSource backing the audio element; `null` before {@link Open} / after {@link Close}. */
  private mediaSource: MediaSource | null = null;
  /** The single source buffer chunks are appended to; `null` until `sourceopen` wires it. */
  private sourceBuffer: SourceBuffer | null = null;
  /** Object URL bound to the audio element's `src`, revoked on {@link Close}. */
  private objectUrl: string | null = null;
  /** Latched muted state applied to the audio element as it (re)opens. */
  private mutedState = false;

  /** @inheritdoc */
  public get IsOpen(): boolean {
    return this.sourceBuffer !== null && this.mediaSource?.readyState === 'open';
  }

  /** @inheritdoc */
  public async Open(): Promise<void> {
    if (this.audio) {
      return; // already open / opening
    }
    if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(MediaSourceAudioSink.MIME)) {
      throw new Error(`MediaSource webm-opus playback is not supported in this browser.`);
    }
    const audio = new Audio();
    audio.autoplay = true;
    audio.muted = this.mutedState;
    const mediaSource = new MediaSource();
    const objectUrl = URL.createObjectURL(mediaSource);
    audio.src = objectUrl;

    this.audio = audio;
    this.mediaSource = mediaSource;
    this.objectUrl = objectUrl;

    await new Promise<void>((resolve, reject) => {
      mediaSource.addEventListener(
        'sourceopen',
        () => {
          try {
            this.sourceBuffer = mediaSource.addSourceBuffer(MediaSourceAudioSink.MIME);
            this.sourceBuffer.mode = 'sequence';
            resolve();
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        },
        { once: true },
      );
    });
    // Best-effort start — autoplay is allowed (the call is the user gesture); ignore a rejected play().
    void audio.play().catch(() => undefined);
  }

  /** @inheritdoc */
  public async AppendChunk(bytes: Uint8Array): Promise<void> {
    const buffer = this.sourceBuffer;
    if (!buffer || !this.IsOpen) {
      throw new Error('Audio sink is not open.');
    }
    await new Promise<void>((resolve, reject) => {
      const onUpdateEnd = (): void => {
        buffer.removeEventListener('updateend', onUpdateEnd);
        buffer.removeEventListener('error', onError);
        resolve();
      };
      const onError = (): void => {
        buffer.removeEventListener('updateend', onUpdateEnd);
        buffer.removeEventListener('error', onError);
        reject(new Error('SourceBuffer append error.'));
      };
      buffer.addEventListener('updateend', onUpdateEnd);
      buffer.addEventListener('error', onError);
      try {
        // Copy into a fresh, definitely-non-shared ArrayBuffer so the typed `BufferSource` signature is
        // satisfied across TS lib versions (a plain Uint8Array may be typed as ArrayBufferLike).
        const copy = new Uint8Array(bytes.length);
        copy.set(bytes);
        buffer.appendBuffer(copy);
      } catch (err) {
        buffer.removeEventListener('updateend', onUpdateEnd);
        buffer.removeEventListener('error', onError);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /** @inheritdoc */
  public SetMuted(muted: boolean): void {
    this.mutedState = muted;
    if (this.audio) {
      this.audio.muted = muted;
    }
  }

  /** @inheritdoc */
  public Close(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.sourceBuffer = null;
    this.mediaSource = null;
  }
}
