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
```
