import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement, Fragment, isValidElement } from 'react';

/**
 * Tests for the voice screen's "Audio only" notice as drawn.
 *
 * What matters is what a screen reader and a thumb get: the sentence, a ✕ that says "Dismiss", an
 * icon kept out of the reading order, and a live region that is there before the sentence arrives
 * (Android reads new content in an existing region; iOS is told directly).
 */
const rn = vi.hoisted(() => ({
    os: 'ios' as 'ios' | 'android',
    announced: [] as Array<{ message: string; options: { queue?: boolean } }>,
}));

vi.mock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Platform: {
        get OS() {
            return rn.os;
        },
    },
    AccessibilityInfo: {
        announceForAccessibilityWithOptions: (message: string, options: { queue?: boolean }) => {
            rn.announced.push({ message, options });
        },
    },
}));
vi.mock('@/components/Icon', async () => {
    const { createElement: h } = await import('react');
    return { Icons: new Proxy({}, { get: (_target, name) => () => h('Icon', { name: String(name) }) }) };
});

import { AnnounceAvatarNotice, AvatarNotice } from '@/voice/AvatarNotice';

// A dependency-free renderer: calls function components and keeps host elements, so the tree the
// notice produces can be asserted without a React Native renderer (see html-renderer.test.ts).
type HostNode = { type: string; props: Record<string, unknown>; children: RenderOutput };
type RenderOutput = string | number | HostNode | RenderOutput[] | null;

function render(node: unknown): RenderOutput {
    if (node == null || typeof node === 'boolean') return null;
    if (typeof node === 'string' || typeof node === 'number') return node;
    if (Array.isArray(node)) return node.map(render);
    if (!isValidElement(node)) return null;
    const el = node as { type: unknown; props: Record<string, unknown> };
    if (el.type === Fragment) return render(el.props.children);
    if (typeof el.type === 'function') return render((el.type as (p: Record<string, unknown>) => unknown)(el.props));
    return { type: el.type as string, props: el.props, children: render(el.props.children) };
}

function findHosts(node: RenderOutput, type: string): HostNode[] {
    if (node == null || typeof node === 'string' || typeof node === 'number') return [];
    if (Array.isArray(node)) return node.flatMap((n) => findHosts(n, type));
    return [...(node.type === type ? [node] : []), ...findHosts(node.children, type)];
}

function collectText(node: RenderOutput): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collectText).join('');
    return collectText(node.children);
}

const SENTENCE = "Audio only: this app can't show the avatar";

function renderNotice(message: string | null, onDismiss: () => void = () => undefined): HostNode {
    return render(createElement(AvatarNotice, { Message: message, OnDismiss: onDismiss })) as HostNode;
}

beforeEach(() => {
    rn.os = 'ios';
    rn.announced = [];
});

describe('AvatarNotice', () => {
    it('shows the sentence in a polite live region', () => {
        const tree = renderNotice(SENTENCE);
        expect(tree.type).toBe('View');
        expect(tree.props.accessibilityLiveRegion).toBe('polite');
        expect(collectText(tree)).toBe(SENTENCE);
    });

    it('keeps the empty live region mounted when there is no notice', () => {
        // The sentence then arrives as new content in an existing region, which is what TalkBack reads.
        const tree = renderNotice(null);
        expect(tree.type).toBe('View');
        expect(tree.props.accessibilityLiveRegion).toBe('polite');
        expect(tree.children).toBeNull();
    });

    it('shows a video-off icon that a screen reader skips', () => {
        const icons = findHosts(renderNotice(SENTENCE), 'Icon');
        expect(icons.map((i) => i.props.name)).toEqual(['VideoOff', 'X']);
        const iconBox = findHosts(renderNotice(SENTENCE), 'View').find(
            (v) => findHosts(v.children, 'Icon').some((i) => i.props.name === 'VideoOff') && !findHosts(v.children, 'Text').length,
        );
        expect(iconBox?.props.accessibilityElementsHidden).toBe(true);
        expect(iconBox?.props.importantForAccessibility).toBe('no-hide-descendants');
    });

    it('offers a ✕ named "Dismiss" that dismisses', () => {
        const onDismiss = vi.fn();
        const [button] = findHosts(renderNotice(SENTENCE, onDismiss), 'Pressable');
        expect(button.props.accessibilityRole).toBe('button');
        expect(button.props.accessibilityLabel).toBe('Dismiss');
        (button.props.onPress as () => void)();
        expect(onDismiss).toHaveBeenCalledTimes(1);
    });
});

describe('AnnounceAvatarNotice', () => {
    it('queues the sentence for VoiceOver on iOS', () => {
        AnnounceAvatarNotice(SENTENCE);
        expect(rn.announced).toEqual([{ message: SENTENCE, options: { queue: true } }]);
    });

    it('leaves Android to the live region, so the sentence is not read twice', () => {
        rn.os = 'android';
        AnnounceAvatarNotice(SENTENCE);
        expect(rn.announced).toEqual([]);
    });
});
