/**
 * @fileoverview `ShimReact` — a React drop-in that makes web JSX render on native.
 *
 * Interactive component code (and the react-runtime compiler's own marker
 * wrappers) call `React.createElement('div', …)`, `React.createElement('span', …)`,
 * etc. React Native has no host components for those HTML tags. `ShimReact`
 * wraps the real `react` module and intercepts `createElement` so that:
 *   1. string host tags are mapped to RN primitives via {@link HOST_MAP},
 *   2. web props are remapped (`onClick`→`onPress`, web CSS `style`→RN style,
 *      `className`/`href`/`data-*`/`aria-*` dropped),
 *   3. bare string/number children under a non-`Text` host are wrapped in `Text`
 *      (RN throws if raw text isn't inside a `<Text>`).
 * Everything else — hooks, `Fragment`, `Component`, `memo`, … — is delegated to
 * the real React by spreading the module. Because the runtime injects this as
 * the context React, one interception covers BOTH user JSX and the compiler's
 * generated `<div>` root wrappers.
 */

import * as React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Colors, Radius, Spacing } from '@/theme/tokens';
import { normalizeWebStyle } from './rn-style-normalizer';

/** A React element type: a host component reference or a component function/class. */
type HostComponent = React.ElementType;

/**
 * Narrowed alias of `React.createElement` used to build the transformed element.
 * React's own overloads don't accept an arbitrary `Record<string, unknown>` prop
 * bag against a generic `ElementType`, so we call through this precise signature.
 */
type CreateElementFn = (
    type: HostComponent,
    props?: Record<string, unknown> | null,
    ...children: React.ReactNode[]
) => React.ReactElement;

/** The genuine `React.createElement`, typed for the shim's dynamic call site. */
const baseCreateElement = React.createElement as CreateElementFn;

/**
 * Maps HTML host tags to their closest React Native primitive. Block/inline
 * container tags become `View`; text-bearing inline tags become `Text`;
 * `button` becomes `Pressable`; `img` becomes `Image`. Tags absent here
 * (`br`/`hr`) are handled specially in {@link shimCreateElement}.
 */
const HOST_MAP: Readonly<Record<string, HostComponent>> = {
    div: View,
    section: View,
    article: View,
    main: View,
    header: View,
    footer: View,
    nav: View,
    ul: View,
    ol: View,
    li: View,
    table: View,
    thead: View,
    tbody: View,
    tr: View,
    td: View,
    th: View,
    span: Text,
    p: Text,
    h1: Text,
    h2: Text,
    h3: Text,
    h4: Text,
    h5: Text,
    h6: Text,
    strong: Text,
    em: Text,
    b: Text,
    i: Text,
    small: Text,
    label: Text,
    a: Text,
    code: Text,
    button: Pressable,
    img: Image,
};

/** Props that carry web-only semantics and are dropped during remapping. */
function isDroppedProp(key: string): boolean {
    return key === 'className' || key === 'href' || key.startsWith('data-') || key.startsWith('aria-');
}

/** Normalize a `style` prop value that may be a single object or an array of them. */
function normalizeStyleProp(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => (isPlainStyleObject(entry) ? normalizeWebStyle(entry) : entry));
    }
    if (isPlainStyleObject(value)) {
        return normalizeWebStyle(value);
    }
    return value;
}

/** True for a plain style object (RN also accepts numeric registered-style ids and arrays). */
function isPlainStyleObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Remap a web prop bag to React Native equivalents: `onClick`→`onPress`,
 * `style`→normalized RN style, and drop the web-only props. Unrecognized props
 * pass through so RN can ignore or consume them.
 */
function remapProps(props: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!props) {
        return null;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
        if (isDroppedProp(key)) {
            continue;
        }
        if (key === 'onClick') {
            out.onPress = value;
        } else if (key === 'style') {
            out.style = normalizeStyleProp(value);
        } else {
            out[key] = value;
        }
    }
    return out;
}

/**
 * Wrap bare string/number children in `<Text>` when the host isn't itself a
 * `Text` (React Native throws when raw text renders outside `<Text>`). Text
 * hosts keep their children verbatim so nested inline formatting is preserved.
 */
function coerceChildren(mapped: HostComponent, children: React.ReactNode[]): React.ReactNode[] {
    if (mapped === Text) {
        return children;
    }
    return children.map((child, index) =>
        typeof child === 'string' || typeof child === 'number'
            ? baseCreateElement(Text, { key: `t${index}` }, child)
            : child,
    );
}

/** Render `<br>` as a small vertical spacer. */
function createLineBreak(): React.ReactElement {
    return baseCreateElement(View, { style: { height: Spacing.sm } });
}

/** Render `<hr>` as a thin full-width divider using the hairline design token. */
function createHorizontalRule(): React.ReactElement {
    return baseCreateElement(View, {
        style: { height: 1, backgroundColor: Colors.line2, borderRadius: Radius.sm, marginVertical: Spacing.sm },
    });
}

/**
 * `createElement` replacement that maps host tags, remaps props, and coerces
 * text children. Non-string element types (component functions, `Fragment`,
 * classes) are delegated to the real React unchanged.
 */
function shimCreateElement(
    type: HostComponent | string,
    props?: Record<string, unknown> | null,
    ...children: React.ReactNode[]
): React.ReactElement {
    if (typeof type !== 'string') {
        return baseCreateElement(type, props ?? null, ...children);
    }
    if (type === 'br') {
        return createLineBreak();
    }
    if (type === 'hr') {
        return createHorizontalRule();
    }
    const mapped = HOST_MAP[type] ?? View;
    return baseCreateElement(mapped, remapProps(props ?? null), ...coerceChildren(mapped, children));
}

/**
 * The React implementation injected into the interactive-component runtime.
 * Identical to the real `react` module in every respect except `createElement`,
 * which is replaced with {@link shimCreateElement}. Consumed by
 * `getInteractiveRuntime()` (as the runtime context React) and by
 * `createErrorBoundary(ShimReact, …)`.
 */
export const ShimReact = { ...React, createElement: shimCreateElement };
