import { describe, it, expect, vi } from 'vitest';
import { createElement, Fragment, isValidElement, type RefObject } from 'react';
import { Animated, type ScrollView } from 'react-native';

/**
 * Tests for the voice call screen's body as drawn: the orb's stage, the transcript card and the
 * controls (#5344), and the controls' names for a screen reader (#5449).
 *
 * What matters is the column's shape, since that is what keeps the card off the controls on a
 * short phone: the controls in flow after the middle rather than positioned over it, the middle
 * taking what the controls leave, the stage sized from the measured middle, and the card shrinking
 * to the room under the stage with its caption scrolling, kept at the latest words. And each control
 * is a button with a name, found the way a screen reader finds it: by role and name.
 */
vi.mock('react-native', () => ({
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Animated: {
        View: 'Animated.View',
        // A stand-in value: its interpolation is a tagged marker, so the test can see where it went.
        Value: class {
            constructor(private readonly start: number) {}
            interpolate(config: { outputRange: number[] }) {
                return { interpolated: this.start, to: config.outputRange };
            }
        },
    },
}));
vi.mock('@/components/Icon', async () => {
    const { createElement: h } = await import('react');
    return { Icons: new Proxy({}, { get: (_target, name) => () => h('Icon', { name: String(name) }) }) };
});

import { VoiceCallBody, type VoiceCallBodyProps, type VoiceOrbMotion } from '@/voice/VoiceCallBody';
import { STAGE_FULL_HEIGHT, TranscriptMinHeight } from '@/voice/voice-call-layout';

// A dependency-free renderer: calls function components and keeps host elements, so the tree the
// body produces can be asserted without a React Native renderer (as in avatar-notice.test.tsx).
type HostNode = { type: string; props: Record<string, unknown>; children: RenderOutput };
type RenderOutput = string | number | HostNode | RenderOutput[] | null;
type Style = Record<string, unknown>;

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

function hosts(node: RenderOutput): HostNode[] {
    if (node == null || typeof node === 'string' || typeof node === 'number') return [];
    if (Array.isArray(node)) return node.flatMap(hosts);
    return [node, ...hosts(node.children)];
}

/** The node's own host children, in order. */
function childHosts(node: HostNode): HostNode[] {
    const out: HostNode[] = [];
    const walk = (child: RenderOutput): void => {
        if (child == null || typeof child === 'string' || typeof child === 'number') return;
        if (Array.isArray(child)) child.forEach(walk);
        else out.push(child);
    };
    walk(node.children);
    return out;
}

function collectText(node: RenderOutput): string {
    if (node == null) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(collectText).join('');
    return collectText(node.children);
}

/** A node's style with arrays merged, as React Native flattens it. */
function styleOf(node: HostNode): Style {
    const flatten = (s: unknown): Style =>
        Array.isArray(s) ? s.reduce<Style>((acc, part) => ({ ...acc, ...flatten(part) }), {}) : ((s as Style | null | undefined) ?? {});
    return flatten(node.props.style);
}

const motion = (): VoiceOrbMotion => {
    const pulse = new Animated.Value(0);
    const r1 = new Animated.Value(1);
    const r2 = new Animated.Value(2);
    return {
        OrbScale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }),
        Ripples: [
            { Scale: r1.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.32] }), Opacity: r1.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }) },
            { Scale: r2.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.32] }), Opacity: r2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }) },
        ],
    };
};

function renderBody(overrides: Partial<VoiceCallBodyProps> = {}): HostNode {
    const props: VoiceCallBodyProps = {
        MiddleHeight: null,
        OnMiddleLayout: () => undefined,
        FontScale: 1,
        Motion: motion(),
        LiveLevel: null,
        TranscriptLabel: 'YOU · LIVE',
        TranscriptText: 'What is the total pipeline for the Northwind account this quarter?',
        TranscriptScrollRef: { current: null },
        OnStop: () => undefined,
        ...overrides,
    };
    return render(createElement(VoiceCallBody, props)) as HostNode;
}

/** The parts of the column, found by what they hold rather than by style names. */
function parts(tree: HostNode) {
    const [middle, controls] = childHosts(tree);
    const [stage, card] = childHosts(middle);
    const scroll = hosts(card).find((n) => n.type === 'ScrollView');
    const orb = hosts(stage).filter((n) => n.type === 'Animated.View').at(-1);
    return { middle, controls, stage, card, scroll: scroll as HostNode, orb: orb as HostNode };
}

/** A button in the controls, found the way a screen reader finds it: by its role and name. */
function buttonNamed(tree: HostNode, name: string): HostNode | undefined {
    return hosts(parts(tree).controls).find((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === name);
}

describe('VoiceCallBody', () => {
    it('lays the column out as the middle, then the controls, both in flow', () => {
        const tree = renderBody();
        const { middle, controls } = parts(tree);
        expect(childHosts(tree)).toHaveLength(2);
        expect(styleOf(tree).position).toBeUndefined();
        expect(styleOf(middle).position).toBeUndefined();
        expect(styleOf(controls).position).toBeUndefined();
        // The controls are last: they hold the stop button and the hint, and nothing comes after them.
        expect(hosts(controls).filter((n) => n.type === 'Pressable')).toHaveLength(3);
        expect(collectText(controls)).toBe('Tap to stop · swipe right for keyboard');
    });

    it('positions nothing absolutely but the ripple rings inside the orb frame', () => {
        const tree = renderBody();
        const absolute = hosts(tree).filter((n) => styleOf(n).position === 'absolute');
        const { stage } = parts(tree);
        const [frame] = childHosts(stage);
        expect(absolute).toHaveLength(2);
        expect(absolute.every((n) => childHosts(frame).includes(n))).toBe(true);
    });

    it('gives the middle what the controls leave, and reports its height', () => {
        const onLayout = vi.fn();
        const tree = renderBody({ OnMiddleLayout: onLayout });
        const { middle, controls } = parts(tree);
        expect(styleOf(tree).flex).toBe(1);
        expect(styleOf(middle).flex).toBe(1);
        expect(styleOf(controls).flex).toBeUndefined();
        (middle.props.onLayout as (e: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void)({
            nativeEvent: { layout: { x: 0, y: 0, width: 375, height: 412 } },
        });
        expect(onLayout).toHaveBeenCalledWith(412);
    });

    it('draws the full-size stage before the middle is measured', () => {
        const { stage, orb } = parts(renderBody({ MiddleHeight: null }));
        expect(styleOf(stage).height).toBe(STAGE_FULL_HEIGHT);
        expect(styleOf(orb).width).toBe(200);
    });

    it("sizes the stage from the measured middle, leaving the card its minimum", () => {
        const middle = 380; // a 375 × 667 iPhone SE with the avatar notice showing
        const { stage, orb } = parts(renderBody({ MiddleHeight: middle }));
        expect(styleOf(stage).height).toBe(middle - TranscriptMinHeight());
        expect(styleOf(orb).width).toBeCloseTo(200 * ((middle - TranscriptMinHeight()) / STAGE_FULL_HEIGHT));
        expect(styleOf(orb).height).toBe(styleOf(orb).width);
        expect(styleOf(orb).borderRadius).toBeCloseTo((styleOf(orb).width as number) / 2);
    });

    it("leaves the card more room at the phone's larger text size", () => {
        const { stage } = parts(renderBody({ MiddleHeight: 380, FontScale: 1.5 }));
        expect(styleOf(stage).height).toBe(380 - TranscriptMinHeight(1.5));
    });

    it('keeps the waveform inside its scaled height', () => {
        const { stage } = parts(renderBody({ MiddleHeight: 300 }));
        const [, waveform] = childHosts(stage);
        const bars = childHosts(waveform);
        expect(bars).toHaveLength(13);
        for (const bar of bars) {
            expect(styleOf(bar).height as number).toBeLessThanOrEqual(styleOf(waveform).height as number);
        }
    });

    it('lets the card shrink to the room under the stage, scrolling the caption but not the label', () => {
        const { card, scroll } = parts(renderBody());
        expect(styleOf(card).flexShrink).toBe(1);
        expect(styleOf(card).flexGrow).toBeUndefined();
        expect(styleOf(scroll).flexGrow).toBe(0);
        expect(styleOf(scroll).flexShrink).toBe(1);
        const [label] = childHosts(card);
        expect(label.type).toBe('Text');
        expect(collectText(label)).toBe('YOU · LIVE');
        expect(collectText(scroll)).toBe('What is the total pipeline for the Northwind account this quarter?');
    });

    it('keeps the caption at its latest words as it grows', () => {
        const scrollToEnd = vi.fn();
        const ref: RefObject<ScrollView | null> = { current: { scrollToEnd } as unknown as ScrollView };
        const { scroll } = parts(renderBody({ TranscriptScrollRef: ref }));
        expect(scroll.props.ref).toBe(ref);
        (scroll.props.onContentSizeChange as (w: number, h: number) => void)(327, 156);
        expect(scrollToEnd).toHaveBeenCalledTimes(1);
        expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    });

    it('stops the call from the button named "Stop", the only button that acts', () => {
        const onStop = vi.fn();
        const tree = renderBody({ OnStop: onStop });
        const stop = buttonNamed(tree, 'Stop');
        expect(stop?.type).toBe('Pressable');
        expect(stop?.props.disabled).toBeFalsy();
        (stop?.props.onPress as () => void)();
        expect(onStop).toHaveBeenCalledTimes(1);
        expect(hosts(parts(tree).controls).filter((n) => typeof n.props.onPress === 'function')).toEqual([stop]);
    });

    it('names the side buttons "Keyboard" and "Menu", disabled because nothing is wired to them yet', () => {
        const tree = renderBody();
        for (const name of ['Keyboard', 'Menu']) {
            const button = buttonNamed(tree, name);
            expect(button?.type, name).toBe('Pressable');
            // Pressable reports `disabled` to screen readers as the button's state ("dimmed" in VoiceOver).
            expect(button?.props.disabled, name).toBe(true);
            expect(button?.props.onPress, name).toBeUndefined();
        }
    });

    it('gives every button in the controls a role and a name, left to right', () => {
        const buttons = hosts(parts(renderBody()).controls).filter((n) => n.type === 'Pressable');
        expect(buttons.map((b) => [b.props.accessibilityRole, b.props.accessibilityLabel])).toEqual([
            ['button', 'Keyboard'],
            ['button', 'Stop'],
            ['button', 'Menu'],
        ]);
    });

    it("drives the orb and the ripples with the screen's motion", () => {
        const m = motion();
        const { stage, orb } = parts(renderBody({ Motion: m }));
        expect(styleOf(orb).transform).toEqual([{ scale: m.OrbScale }]);
        // The frame holds the ripple rings, then the orb.
        const ripples = childHosts(childHosts(stage)[0]).filter((n) => n !== orb);
        expect(ripples.map((r) => styleOf(r).transform)).toEqual(m.Ripples.map((r) => [{ scale: r.Scale }]));
        expect(ripples.map((r) => styleOf(r).opacity)).toEqual(m.Ripples.map((r) => r.Opacity));
    });
});
