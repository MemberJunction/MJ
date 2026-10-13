/**
 * @fileoverview Turns a component artifact version's `Content` into a renderable {@link ComponentSpec}.
 *
 * Kept apart from the database-backed source so the rules for "is this a component I can show" are plain
 * functions that need no provider to test.
 *
 * @module @memberjunction/ng-conversations
 */

import { SafeJSONParse } from '@memberjunction/global';
import type { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentArtifactError } from './interactive-component-types';

/** True for a non-null, non-array object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Parses an artifact version's `Content` as a component specification.
 *
 * @param content The version's `Content` column (JSON text), or `null` when the content is stored as a file.
 * @param label How to name the artifact in a failure message (so the model is told which one).
 * @throws {ComponentArtifactError} `'unreadable'` when there is no usable content, `'not_a_component'` when the
 *   content is JSON that is not a component spec or has no executable code.
 */
export function ParseComponentSpecContent(content: string | null | undefined, label: string): ComponentSpec {
    if (typeof content !== 'string' || content.trim().length === 0) {
        throw new ComponentArtifactError(
            'unreadable',
            `${label} has no inline content to render (content stored as a file is not supported by the Interactive Component channel).`
        );
    }
    const parsed: unknown = SafeJSONParse(content);
    if (!isRecord(parsed) || typeof parsed['name'] !== 'string') {
        throw new ComponentArtifactError('not_a_component', `${label} is not an interactive component (its content is not a component specification).`);
    }
    const hasCode = typeof parsed['code'] === 'string' && parsed['code'].trim().length > 0;
    const isRegistry = typeof parsed['namespace'] === 'string' && parsed['namespace'].length > 0;
    if (!hasCode && !isRegistry) {
        throw new ComponentArtifactError('not_a_component', `${label} is a component specification with no executable code yet, so it cannot be shown.`);
    }
    // The parsed value is the artifact's own ComponentSpec JSON; the fields above are the ones rendering needs.
    return parsed as unknown as ComponentSpec;
}
