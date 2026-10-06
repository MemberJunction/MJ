/**
 * @fileoverview In-process rendering of archify diagrams.
 *
 * archify's renderers are CLI scripts: importing one reads its input, validates it, renders and writes
 * the page, all at module load. The vendored copy is shimmed (`archify-shims.patch`) to take its input
 * from, and hand its output back to, an in-memory job instead of files. Each render runs in a fresh
 * worker thread, because an ES module evaluates once per module graph: re-importing a renderer in the
 * main thread would never re-run it (or, with a cache-busting URL, would leak a module per render). The
 * worker also contains the renderer's process-level behavior and gets an empty environment, so no server
 * secret or setting reaches it.
 *
 * @module @memberjunction/ai-diagrams
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { Worker } from 'node:worker_threads';
import { BaseSingleton } from '@memberjunction/global';
import { MakeStandaloneSvg } from './standalone-svg.js';

/** The diagram types archify renders. */
export type ArchitectureDiagramType = 'architecture' | 'workflow' | 'sequence' | 'dataflow' | 'lifecycle';

export const ARCHITECTURE_DIAGRAM_TYPES: readonly ArchitectureDiagramType[] = ['architecture', 'workflow', 'sequence', 'dataflow', 'lifecycle'];

/**
 * One problem archify found in a spec, with the fixes it supports. This mirrors archify's own JSON (its
 * casing included) because the payload goes back to the model verbatim, to repair against.
 */
export interface ArchitectureDiagramDiagnostic {
    code: string; // case-violation-ok-legacy-back-compat: archify wire shape
    severity: 'error' | 'warning'; // case-violation-ok-legacy-back-compat: archify wire shape
    message: string; // case-violation-ok-legacy-back-compat: archify wire shape
    subject: Record<string, unknown>; // case-violation-ok-legacy-back-compat: archify wire shape
    evidence: Record<string, unknown>; // case-violation-ok-legacy-back-compat: archify wire shape
    supportedFixes: string[]; // case-violation-ok-legacy-back-compat: archify wire shape
}

/** archify's renderer failure payload (`schemaVersion` 1), returned verbatim so a caller can repair the spec. */
export interface ArchitectureDiagramFailure {
    schemaVersion: number; // case-violation-ok-legacy-back-compat: archify wire shape
    ok: false; // case-violation-ok-legacy-back-compat: archify wire shape
    source: string; // case-violation-ok-legacy-back-compat: archify wire shape
    error: string; // case-violation-ok-legacy-back-compat: archify wire shape
    diagnostics: ArchitectureDiagramDiagnostic[]; // case-violation-ok-legacy-back-compat: archify wire shape
}

export type ArchitectureDiagramErrorCode = 'INVALID_INPUT' | 'VALIDATION_FAILED' | 'RENDER_FAILED' | 'TIMEOUT';

export type ArchitectureDiagramRenderResult =
    | {
        Success: true;
        /** Self-contained SVG: scoped styles, a solid background, safe for markdown and report HTML. */
        Svg: string;
        /** The standalone interactive page: themes, trace, finder, focus panel, export. */
        Html: string;
        /** The spec's `meta.title`, when it has one. */
        Title: string | null;
    }
    | {
        Success: false;
        ErrorCode: ArchitectureDiagramErrorCode;
        Message: string;
        /** archify's diagnostics, present for VALIDATION_FAILED. */
        Failure?: ArchitectureDiagramFailure;
    };

/** Upper bound on one render, so a pathological spec cannot hold an agent's action open. */
const RENDER_TIMEOUT_MS = 30_000;

/** Heap cap for a render worker. */
const WORKER_HEAP_MB = 512;

/** The package root: this file runs from `src/` under test and from `dist/` once built. */
const PACKAGE_ROOT = new URL('../', import.meta.url);
const VENDOR_ROOT = new URL('vendor/archify/', PACKAGE_ROOT);

/**
 * What the worker runs. It is evaluated as a script because the renderer it loads is a module that
 * renders as it loads: importing it IS the render, and its path depends on the diagram type, so the
 * import is necessarily dynamic.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  const job = { diagram: workerData.diagram, template: workerData.template, result: null };
  globalThis.__MJ_ARCHIFY_JOB = job;
  try {
    await import(workerData.rendererUrl);
    parentPort.postMessage(job.result
      ? { ok: true, html: job.result.html, svg: job.result.svg }
      : { ok: false, error: 'The renderer finished without producing a diagram.' });
  } catch (error) {
    const { rendererFailure } = await import(workerData.diagnosticsUrl);
    parentPort.postMessage({ ok: false, failure: rendererFailure(error) });
  }
})();
`;

/** What a render worker reports back. */
type WorkerOutcome =
    | { ok: true; html: string; svg: string }
    | { ok: false; failure?: ArchitectureDiagramFailure; error?: string; timedOut?: boolean };

/**
 * Renders archify diagram specs to a self-contained SVG and a standalone HTML page. `Render` never
 * throws: every failure comes back as a result with an error code.
 */
export class ArchitectureDiagramRenderer extends BaseSingleton<ArchitectureDiagramRenderer> {
    private template: string | null = null;

    protected constructor() {
        super();
    }

    public static get Instance(): ArchitectureDiagramRenderer {
        return super.getInstance<ArchitectureDiagramRenderer>();
    }

    /**
     * Validates and renders one spec. archify's own checks (schema, cross-references, layout and, for a
     * `showcase` spec, its quality gates) run as part of the render, so a spec that renders is valid.
     *
     * @param diagramType - which renderer to use
     * @param spec - the archify JSON spec, parsed
     */
    public async Render(diagramType: ArchitectureDiagramType, spec: Record<string, unknown>): Promise<ArchitectureDiagramRenderResult> {
        if (!ARCHITECTURE_DIAGRAM_TYPES.includes(diagramType)) {
            return { Success: false, ErrorCode: 'INVALID_INPUT', Message: `Unknown diagram type "${diagramType}". Use one of: ${ARCHITECTURE_DIAGRAM_TYPES.join(', ')}.` };
        }
        const outcome = await this.runWorker(diagramType, spec);
        if (outcome.ok === false) {
            return this.toFailure(outcome);
        }
        const meta = (spec.meta ?? {}) as { title?: unknown; visual_preset?: unknown };
        const preset = typeof meta.visual_preset === 'string' ? meta.visual_preset : 'classic';
        return {
            Success: true,
            Svg: MakeStandaloneSvg(outcome.svg, this.getTemplate(), `archify-${randomUUID().slice(0, 8)}`, preset),
            Html: outcome.html,
            Title: typeof meta.title === 'string' ? meta.title : null,
        };
    }

    private toFailure(outcome: Extract<WorkerOutcome, { ok: false }>): ArchitectureDiagramRenderResult {
        if (outcome.timedOut) {
            return { Success: false, ErrorCode: 'TIMEOUT', Message: outcome.error ?? 'The render timed out.' };
        }
        const failure = outcome.failure;
        // archify classifies every author-facing problem; only an unclassified failure is a renderer fault.
        const repairable = failure?.diagnostics.some((d) => d.code !== 'internal/unclassified') ?? false;
        if (failure && repairable) {
            return { Success: false, ErrorCode: 'VALIDATION_FAILED', Message: failure.error, Failure: failure };
        }
        return { Success: false, ErrorCode: 'RENDER_FAILED', Message: failure?.error ?? outcome.error ?? 'The renderer failed.' };
    }

    private runWorker(diagramType: ArchitectureDiagramType, spec: Record<string, unknown>): Promise<WorkerOutcome> {
        return new Promise((resolve) => {
            const worker = new Worker(WORKER_SOURCE, {
                eval: true,
                env: {},
                resourceLimits: { maxOldGenerationSizeMb: WORKER_HEAP_MB },
                workerData: {
                    diagram: spec,
                    template: this.getTemplate(),
                    rendererUrl: new URL(`renderers/${diagramType}/render-${diagramType}.mjs`, VENDOR_ROOT).href,
                    diagnosticsUrl: new URL('renderers/shared/diagnostics.mjs', VENDOR_ROOT).href,
                },
            });
            let settled = false;
            const finish = (outcome: WorkerOutcome) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                void worker.terminate();
                resolve(outcome);
            };
            const timer = setTimeout(() => finish({ ok: false, timedOut: true, error: `The render did not finish within ${RENDER_TIMEOUT_MS / 1000}s; simplify the diagram or split it.` }), RENDER_TIMEOUT_MS);
            worker.once('message', (message: WorkerOutcome) => finish(message));
            worker.once('error', (error: Error) => finish({ ok: false, error: error.message }));
            worker.once('exit', (code) => finish({ ok: false, error: `The render worker exited (code ${code}) without a result.` }));
        });
    }

    /** The lite template (archify's page without its embedded fonts), read once. */
    private getTemplate(): string {
        this.template ??= fs.readFileSync(new URL('assets/template.lite.html', PACKAGE_ROOT), 'utf8');
        return this.template;
    }
}
