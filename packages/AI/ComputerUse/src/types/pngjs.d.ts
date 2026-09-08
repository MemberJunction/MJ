// Minimal ambient types for the subset of `pngjs` used by
// src/utils/perceptual-hash.ts. pngjs is pure-JS and ships no bundled types;
// declaring the three members we touch here avoids adding @types/pngjs.
declare module 'pngjs' {
    export class PNG {
        width: number;
        height: number;
        data: Buffer;
        constructor(options?: { width?: number; height?: number });
        static sync: {
            read(buffer: Buffer): PNG;
            write(png: PNG): Buffer;
        };
    }
}
