/**
 * @fileoverview Parse artifact content into a react-runtime component spec.
 *
 * Interactive-component artifacts store a serialized `ComponentSpec` (the same
 * shape the desktop react-runtime consumes) in their version `Content`. This
 * module turns that JSON into a typed spec, validating just enough to be sure it
 * is a renderable component (a non-empty `name` and a real `code` body) rather
 * than an ordinary JSON/data artifact that merely happens to be an object.
 */

import type { ComponentSpec } from '@memberjunction/react-runtime';

/**
 * Minimum length of `code` for content to be treated as a component when the
 * artifact type doesn't explicitly signal "component"/"interactive". Guards
 * against ordinary config JSON that coincidentally has `name` + `code` fields.
 */
const MIN_COMPONENT_CODE_LENGTH = 20;

/** True for a plain (non-array) JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** True when the artifact type name explicitly denotes an interactive component. */
function typeNameSignalsComponent(typeName: string): boolean {
    return /component|interactive/i.test(typeName);
}

/**
 * Convert an already-parsed JSON value into a {@link ComponentSpec}, or `null`
 * if it isn't a renderable component spec.
 *
 * Requires a non-empty string `name` and a string `code` body. When the artifact
 * type doesn't signal a component, `code` must also clear
 * {@link MIN_COMPONENT_CODE_LENGTH} so trivial `{ name, code }` data blobs aren't
 * mistaken for components.
 *
 * @param parsed   A value produced by `JSON.parse` on the artifact content.
 * @param typeName The artifact's type/display name (a soft component signal).
 * @returns The typed component spec, or `null` when it isn't one.
 */
export function toInteractiveSpec(parsed: unknown, typeName: string): ComponentSpec | null {
    if (!isRecord(parsed)) {
        return null;
    }
    const { name, code } = parsed;
    if (typeof name !== 'string' || !name.trim()) {
        return null;
    }
    if (typeof code !== 'string' || !code.trim()) {
        return null;
    }
    if (!typeNameSignalsComponent(typeName) && code.trim().length < MIN_COMPONENT_CODE_LENGTH) {
        return null;
    }
    return buildSpec(parsed, name, code);
}

/**
 * Assemble a fully-typed {@link ComponentSpec} from validated content. Required
 * spec fields absent from the artifact JSON are filled with safe defaults; the
 * runtime- and safety-relevant fields (`code`, `location`, `libraries`,
 * `dependencies`) are carried through from the source.
 *
 * @param parsed The validated content object.
 * @param name   The validated component name.
 * @param code   The validated component code body.
 */
function buildSpec(parsed: Record<string, unknown>, name: string, code: string): ComponentSpec {
    // `parsed` is a serialized ComponentSpec; view it as a partial to read its
    // optional/typed fields, then normalize into a complete spec.
    const view = parsed as Partial<ComponentSpec>;
    return {
        name,
        code,
        location: view.location ?? 'embedded',
        title: view.title ?? name,
        description: view.description ?? '',
        type: view.type ?? 'report',
        functionalRequirements: view.functionalRequirements ?? '',
        technicalDesign: view.technicalDesign ?? '',
        exampleUsage: view.exampleUsage ?? '',
        namespace: view.namespace,
        registry: view.registry,
        version: view.version,
        libraries: view.libraries,
        dependencies: view.dependencies,
    };
}

/**
 * Parse raw artifact content into a {@link ComponentSpec}, or `null` when the
 * content isn't a JSON object describing a renderable component.
 *
 * @param content  The raw artifact version content.
 * @param typeName The artifact's type/display name (a soft component signal).
 * @returns The typed component spec, or `null`.
 */
export function parseInteractiveSpec(content: string, typeName: string): ComponentSpec | null {
    const trimmed = content.trim();
    if (!trimmed.startsWith('{')) {
        return null;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return null;
    }
    return toInteractiveSpec(parsed, typeName);
}
