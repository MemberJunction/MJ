```ts
interface MJVideoRuntime {
    Data: Readonly<Record<string, unknown>>;  // Deeply frozen copy of `RenderProjectBundle.DataSnapshot` (or `{}` when omitted).
    Seed: number;  // Deterministic integer seed from `RenderProjectBundle.Seed`.
    Format: VideoFormat;  // Target aspect ratio format of the composition ('16:9', '9:16', or '1:1').
    Width: number;  // Composition viewport width in pixels.
    Height: number;  // Composition viewport height in pixels.
    Fps: number;  // Target frame rate in frames per second.
    DurationSeconds?: number;  // Optional total composition duration in seconds.
}
```
