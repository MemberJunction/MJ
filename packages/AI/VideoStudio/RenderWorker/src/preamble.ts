import type { RenderProjectBundle, VideoFormat } from '@memberjunction/video-studio-core';

/**
 * Strict Content-Security-Policy injected into every staged HTML file (Decision 3).
 *
 * Blocks all external network egress (`connect-src 'none'`, `frame-src 'none'`, `worker-src 'none'`,
 * `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`) while allowing local bundle files
 * (`'self'`), `data:` / `blob:` URIs, and inline composition scripts/styles.
 */
export const COMPOSITION_CSP = [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
].join('; ');

/**
 * Options used to construct the injected `window.MJVideo` runtime preamble.
 */
export interface PreambleRuntimeOptions {
    /** Bound data snapshot exposed at `window.MJVideo.Data`. */
    DataSnapshot: Record<string, unknown>;
    /** Integer seed exposed at `window.MJVideo.Seed`. */
    Seed: number;
    /** Target video aspect-ratio format. */
    Format: VideoFormat;
    /** Output frame width in pixels. */
    Width: number;
    /** Output frame height in pixels. */
    Height: number;
    /** Output frame rate in frames per second. */
    Fps: number;
    /** Optional composition duration in seconds. */
    DurationSeconds?: number;
}

/**
 * Default SIL OFL font families bundled in the RenderWorker package (`assets/fonts/`)
 * so compositions referencing the sample brand kit (`Inter`, `JetBrains Mono`) render
 * deterministically offline with `FontIsBundled: true` (VS-RND-5 Decision 4).
 */
export const BUNDLED_DEFAULT_FONTS = ['Inter', 'JetBrains Mono'] as const;

/**
 * Builds the `<meta http-equiv="Content-Security-Policy">` tag injected into every `.html` file.
 */
export function BuildCspMetaTag(): string {
    return `<meta http-equiv="Content-Security-Policy" content="${COMPOSITION_CSP}">`;
}

/**
 * Builds the `<style data-mj-default-fonts>` tag registering the worker's bundled `Inter`
 * and `JetBrains Mono` `@font-face` rules served from `/__mj_fonts/`.
 */
export function BuildDefaultFontsStyleTag(): string {
    return [
        '<style data-mj-default-fonts>',
        "@font-face{font-family:'Inter';src:url('/__mj_fonts/Inter-Regular.ttf') format('truetype');font-weight:100 900;font-style:normal;font-display:block;}",
        "@font-face{font-family:'JetBrains Mono';src:url('/__mj_fonts/JetBrainsMono-Regular.ttf') format('truetype');font-weight:100 900;font-style:normal;font-display:block;}",
        '</style>',
    ].join('');
}

/**
 * Escapes a JSON string for safe embedding inside an HTML `<script>` element (`<`, `>`, U+2028, U+2029).
 */
export function EscapeJsonForInlineScript(value: unknown): string {
    const raw = JSON.stringify(value ?? {});
    return raw
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Builds the inline JavaScript source that defines a frozen `window.MJVideo: MJVideoRuntime`,
 * replaces `Math.random` with `MJVideo.Random`, and hooks HyperFrames' `window.__hf.seek`.
 */
export function BuildPreambleScript(options: PreambleRuntimeOptions): string {
    const safeDataJson = EscapeJsonForInlineScript(
        options.DataSnapshot && typeof options.DataSnapshot === 'object' ? options.DataSnapshot : {},
    );
    const safeSeed = Number.isFinite(options.Seed) ? Math.trunc(options.Seed) : 0;
    const safeFormat = JSON.stringify(options.Format);
    const safeWidth = Math.trunc(options.Width);
    const safeHeight = Math.trunc(options.Height);
    const safeFps = Math.trunc(options.Fps);
    const safeDuration =
        typeof options.DurationSeconds === 'number' && Number.isFinite(options.DurationSeconds)
            ? String(options.DurationSeconds)
            : 'undefined';

    return [
        '(function(w) {',
        '  "use strict";',
        '  function deepFreeze(obj) {',
        '    if (obj === null || typeof obj !== "object" || Object.isFrozen(obj)) return obj;',
        '    Object.freeze(obj);',
        '    var keys = Object.keys(obj);',
        '    for (var i = 0; i < keys.length; i++) {',
        '      deepFreeze(obj[keys[i]]);',
        '    }',
        '    return obj;',
        '  }',
        '  function mix32(h, k) {',
        '    h = Math.imul(h ^ (k >>> 0), 0x85ebca6b) >>> 0;',
        '    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;',
        '    return (h ^ (h >>> 16)) >>> 0;',
        '  }',
        '  function hashFrameSeed(seed, timeMs) {',
        '    return mix32((seed ^ 0x9e3779b9) >>> 0, timeMs >>> 0);',
        '  }',
        '  function hashNoise(seed, keys) {',
        '    var h = (seed ^ 0x9e3779b9) >>> 0;',
        '    for (var i = 0; i < keys.length; i++) {',
        '      var key = String(keys[i]);',
        '      for (var j = 0; j < key.length; j++) {',
        '        h = mix32(h, key.charCodeAt(j));',
        '      }',
        '      h = mix32(h, 0xff);',
        '    }',
        '    var t = (h + 0x6D2B79F5) >>> 0;',
        '    t = Math.imul(t ^ (t >>> 15), t | 1);',
        '    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);',
        '    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
        '  }',
        `  var baseSeed = ${safeSeed};`,
        `  var frozenData = deepFreeze(${safeDataJson});`,
        '  var prngState = baseSeed >>> 0;',
        '  var frameCallbacks = [];',
        '  function nextRandom() {',
        '    prngState = (prngState + 0x6D2B79F5) >>> 0;',
        '    var t = prngState;',
        '    t = Math.imul(t ^ (t >>> 15), t | 1);',
        '    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);',
        '    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;',
        '  }',
        '  function dispatchFrame(timeSeconds) {',
        '    var safeTime = typeof timeSeconds === "number" && isFinite(timeSeconds) ? timeSeconds : 0;',
        '    var timeMs = Math.round(safeTime * 1000);',
        '    prngState = hashFrameSeed(baseSeed, timeMs);',
        '    for (var i = 0; i < frameCallbacks.length; i++) {',
        '      frameCallbacks[i](safeTime);',
        '    }',
        '  }',
        '  var runtimeObj = {',
        '    Data: frozenData,',
        '    Seed: baseSeed,',
        `    Format: ${safeFormat},`,
        `    Width: ${safeWidth},`,
        `    Height: ${safeHeight},`,
        `    Fps: ${safeFps},`,
        `    DurationSeconds: ${safeDuration},`,
        '    Random: function() { return nextRandom(); },',
        '    Noise: function() {',
        '      var args = [];',
        '      for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);',
        '      return hashNoise(baseSeed, args);',
        '    },',
        '    OnFrame: function(cb) {',
        '      if (typeof cb === "function") {',
        '        frameCallbacks.push(cb);',
        '      }',
        '    }',
        '  };',
        '  var runtime = Object.freeze(runtimeObj);',
        '  Object.defineProperty(w, "MJVideo", {',
        '    value: runtime,',
        '    writable: false,',
        '    configurable: false,',
        '    enumerable: true',
        '  });',
        '  Math.random = runtime.Random;',
        '  if (w.Math && typeof w.Math === "object") {',
        '    w.Math.random = runtime.Random;',
        '  }',
        '  function wrapHfObject(hfObj) {',
        '    if (!hfObj || typeof hfObj !== "object" || hfObj.__mjWrapped) return hfObj;',
        '    var underlyingSeek = typeof hfObj.seek === "function" ? hfObj.seek : null;',
        '    Object.defineProperty(hfObj, "__mjWrapped", { value: true, enumerable: false });',
        '    Object.defineProperty(hfObj, "seek", {',
        '      configurable: true,',
        '      enumerable: true,',
        '      get: function() {',
        '        return function(t, opts) {',
        '          var res = underlyingSeek ? underlyingSeek.call(this, t, opts) : undefined;',
        '          dispatchFrame(t);',
        '          return res;',
        '        };',
        '      },',
        '      set: function(fn) {',
        '        underlyingSeek = typeof fn === "function" ? fn : null;',
        '      }',
        '    });',
        '    return hfObj;',
        '  }',
        '  var currentHf = wrapHfObject(w.__hf || {});',
        '  Object.defineProperty(w, "__hf", {',
        '    configurable: true,',
        '    enumerable: true,',
        '    get: function() { return currentHf; },',
        '    set: function(nextHf) { currentHf = wrapHfObject(nextHf || {}); }',
        '  });',
        '  if (typeof w.document !== "undefined" && typeof w.document.addEventListener === "function") {',
        '    w.document.addEventListener("DOMContentLoaded", function() {',
        '      setTimeout(function() {',
        '        var hosts = w.document.querySelectorAll("[data-composition-id]");',
        '        var timelines = w.__timelines || {};',
        '        for (var i = 0; i < hosts.length; i++) {',
        '          var id = hosts[i].getAttribute("data-composition-id");',
        '          if (id && !timelines[id] && !hosts[i].hasAttribute("data-no-timeline")) {',
        '            hosts[i].setAttribute("data-no-timeline", "");',
        '          }',
        '        }',
        '      }, 0);',
        '    });',
        '  }',
        '})(typeof window !== "undefined" ? window : globalThis);',
    ].join('\n');
}

/**
 * Injects the CSP `<meta>` tag, bundled default `@font-face` `<style>`, and the `window.MJVideo`
 * inline `<script>` right after `<!doctype ...>` (or at byte 0 when no doctype is present).
 */
export function InjectPreambleIntoHtml(html: string, options: PreambleRuntimeOptions): string {
    const metaTag = BuildCspMetaTag();
    const fontsStyleTag = BuildDefaultFontsStyleTag();
    const scriptTag = `<script>${BuildPreambleScript(options)}</script>`;
    const preamble = `${metaTag}${fontsStyleTag}${scriptTag}`;

    const doctypeMatch = /^\s*<!doctype[^>]*>/i.exec(html);
    if (doctypeMatch) {
        const insertAt = doctypeMatch[0].length;
        return `${html.slice(0, insertAt)}${preamble}${html.slice(insertAt)}`;
    }
    return `${preamble}${html}`;
}

/**
 * Convenience helper constructing `PreambleRuntimeOptions` from a `RenderProjectBundle` plus frame geometry.
 */
export function BuildPreambleOptionsFromBundle(
    bundle: RenderProjectBundle,
    geometry?: { Width?: number; Height?: number; Fps?: number; DurationSeconds?: number },
): PreambleRuntimeOptions {
    const defaults = defaultGeometryForFormat(bundle.Format);
    return {
        DataSnapshot: bundle.DataSnapshot ?? {},
        Seed: bundle.Seed,
        Format: bundle.Format,
        Width: geometry?.Width ?? defaults.Width,
        Height: geometry?.Height ?? defaults.Height,
        Fps: geometry?.Fps ?? 30,
        DurationSeconds: geometry?.DurationSeconds,
    };
}

function defaultGeometryForFormat(format: VideoFormat): { Width: number; Height: number } {
    switch (format) {
        case '9:16':
            return { Width: 1080, Height: 1920 };
        case '1:1':
            return { Width: 1080, Height: 1080 };
        case '16:9':
        default:
            return { Width: 1920, Height: 1080 };
    }
}
