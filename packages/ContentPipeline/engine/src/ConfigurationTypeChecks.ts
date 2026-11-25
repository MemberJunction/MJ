/**
 * @fileoverview Compile-time checks that the renderer's contract and the configuration type CodeGen generates stay the
 * same shape.
 *
 * `PageRenderOptions` (content-pipeline-base) is what a page renderer is handed; `PageRendererOptions` on a Content
 * Source's `Configuration` is typed by CodeGen from `IContentSourceConfiguration` (metadata JSONType). The base package
 * does not depend on the generated entities, so it cannot derive the one from the other; this file, in a package that
 * sees both, fails the build when either changes without the other.
 *
 * Not part of the package's public API (not exported from `index.ts`): `tsc` compiles every file under `src/`, which is
 * all the check needs.
 *
 * @module @memberjunction/content-pipeline
 */

import type { MJContentSourceEntity_IContentSourcePageRendererOptions } from '@memberjunction/core-entities';
import type { PageRenderOptions } from '@memberjunction/content-pipeline-base';

/** `true` when A and B are mutually assignable, else `never`. */
type SameShape<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** Fails to compile when the generated `PageRendererOptions` and `PageRenderOptions` drift apart. */
export const PAGE_RENDER_OPTIONS_MATCH_GENERATED: SameShape<MJContentSourceEntity_IContentSourcePageRendererOptions, PageRenderOptions> = true;
