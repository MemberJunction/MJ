```ts
interface MJVideoRuntime {
    Data: Readonly<Record<string, unknown>>;  // Deeply frozen copy of `RenderProjectBundle.DataSnapshot` (or `{}` when omitted).
    Seed: number;  // Deterministic integer seed from `RenderProjectBundle.Seed`.
    Format: VideoFormat;  // Target aspect ratio format of the composition ('16:9', '9:16', or '1:1').
    Width: number;  // Composition viewport width in pixels.
    Height: number;  // Composition viewport height in pixels.
    Fps: number;  // Target frame rate in frames per second.
    DurationSeconds?: number;  // Optional total composition duration in seconds.
    Random(): number;  // Deterministic `mulberry32` PRNG seeded from `Seed` at load and reset to
    Noise(...keys: (string | number)[]): number;  // Deterministic order-independent hash of `(Seed, ...keys)` into `[0, 1)`.
    OnFrame(cb: (timeSeconds: number) => void): void;  // Registers a per-frame callback invoked with the exact seek time in seconds before each frame is...
}

interface NarrationCueWord {
    Word: string;  // Word as written in the narration line (punctuation attached).
    Key: string;  // Normalized match key (lower case, punctuation removed).
    Start: number;  // When the word starts.
    End: number;  // When the word ends.
}

interface NarrationCueLine {
    Start: number;  // When the line starts.
    End: number;  // When the line ends.
    Words: NarrationCueWord[];  // Spoken words in order (empty when the TTS returned no word timings).
}

interface NarrationCueTable {
    Lines: Record<string, NarrationCueLine>;  // Lines keyed by `NarrationLine.Key`.
}

interface MJNarrationCues {
    Table: NarrationCueTable;  // The staged cue table.
    Misses: string[];  // `lineKey:phrase` labels that did not resolve (diagnostics only).
    Cue(lineKey: string, phrase: string, nth?: number): number;  // Seconds when the `nth` (1-based, default 1) occurrence of `phrase` starts in line `lineKey`.
    CueEnd(lineKey: string, phrase: string, nth?: number): number;  // Seconds when that occurrence ends (falls back to the line end). Also `window.mjCueEnd(...)`.
    Has(lineKey: string, phrase: string, nth?: number): boolean;  // True when the phrase is spoken in the line.
    Line(lineKey: string): { Start: number; End: number } | null;  // Start and end of a line, or `null` when unknown.
}
```
