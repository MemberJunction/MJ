/**
 * The slice of jsdom's API the bundle test uses. jsdom ships no typings and `@types/jsdom` is not part of
 * this workspace, so the surface is declared here, narrowly, instead of leaving the import implicitly `any`.
 */
declare module 'jsdom' {
  export class VirtualConsole {
    public on(event: 'jsdomError', listener: (error: Error) => void): this;
  }

  export interface JSDOMOptions {
    runScripts?: 'dangerously' | 'outside-only';
    resources?: 'usable';
    pretendToBeVisual?: boolean;
    virtualConsole?: VirtualConsole;
    beforeParse?: (window: Window & typeof globalThis) => void;
  }

  export class JSDOM {
    public readonly window: Window & typeof globalThis;
    public static fromFile(path: string, options?: JSDOMOptions): Promise<JSDOM>;
  }
}
