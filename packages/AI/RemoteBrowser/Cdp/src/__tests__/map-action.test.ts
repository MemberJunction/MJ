import { describe, it, expect } from 'vitest';
import {
    RemoteBrowserAction,
    RemoteBrowserHumanInput,
} from '@memberjunction/remote-browser-base';
import {
    ClickAction,
    GoBackAction,
    GoForwardAction,
    KeypressAction,
    MouseMoveAction,
    NavigateAction,
    ScrollAction,
    TypeAction,
    WaitAction,
} from '@memberjunction/computer-use';
import { mapHumanInput, mapRemoteBrowserAction } from '../map-action';

describe('mapRemoteBrowserAction', () => {
    it('maps navigate → NavigateAction with the URL', () => {
        const result = mapRemoteBrowserAction({ Kind: 'navigate', Url: 'https://a.test/' });
        expect(result).toBeInstanceOf(NavigateAction);
        expect((result as NavigateAction).Url).toBe('https://a.test/');
    });

    it('maps click with a Selector → ClickAction carrying the selector (selector branch)', () => {
        const result = mapRemoteBrowserAction({ Kind: 'click', Selector: '#submit' });
        expect(result).toBeInstanceOf(ClickAction);
        const click = result as ClickAction;
        expect(click.Selector).toBe('#submit');
        // Coordinates default to 0 when not provided.
        expect(click.X).toBe(0);
        expect(click.Y).toBe(0);
    });

    it('maps click with X/Y → ClickAction carrying coordinates, no selector (coordinate branch)', () => {
        const result = mapRemoteBrowserAction({ Kind: 'click', X: 12, Y: 34 });
        const click = result as ClickAction;
        expect(click.X).toBe(12);
        expect(click.Y).toBe(34);
        expect(click.Selector).toBeUndefined();
    });

    it('maps type with Text and Selector → TypeAction (selector branch)', () => {
        const result = mapRemoteBrowserAction({ Kind: 'type', Text: 'hello', Selector: 'input' });
        expect(result).toBeInstanceOf(TypeAction);
        const typed = result as TypeAction;
        expect(typed.Text).toBe('hello');
        expect(typed.Selector).toBe('input');
    });

    it('maps type with Text only → TypeAction with no selector (focused-element branch)', () => {
        const typed = mapRemoteBrowserAction({ Kind: 'type', Text: 'world' }) as TypeAction;
        expect(typed.Text).toBe('world');
        expect(typed.Selector).toBeUndefined();
    });

    it('maps key → KeypressAction with the key', () => {
        const result = mapRemoteBrowserAction({ Kind: 'key', Key: 'Enter' });
        expect(result).toBeInstanceOf(KeypressAction);
        expect((result as KeypressAction).Key).toBe('Enter');
    });

    it('maps scroll with deltas → ScrollAction carrying deltas (delta branch)', () => {
        const result = mapRemoteBrowserAction({ Kind: 'scroll', DeltaX: 5, DeltaY: -7 });
        expect(result).toBeInstanceOf(ScrollAction);
        const scroll = result as ScrollAction;
        expect(scroll.DeltaX).toBe(5);
        expect(scroll.DeltaY).toBe(-7);
        expect(scroll.Selector).toBeUndefined();
    });

    it('maps scroll with a Selector → ScrollAction carrying the selector (scroll-into-view branch)', () => {
        const scroll = mapRemoteBrowserAction({ Kind: 'scroll', Selector: '#footer' }) as ScrollAction;
        expect(scroll.Selector).toBe('#footer');
        expect(scroll.DeltaX).toBe(0);
        expect(scroll.DeltaY).toBe(0);
    });

    it('maps back → GoBackAction', () => {
        expect(mapRemoteBrowserAction({ Kind: 'back' })).toBeInstanceOf(GoBackAction);
    });

    it('maps forward → GoForwardAction', () => {
        expect(mapRemoteBrowserAction({ Kind: 'forward' })).toBeInstanceOf(GoForwardAction);
    });

    it('maps wait with Ms → WaitAction with DurationMs (fixed-sleep branch)', () => {
        const result = mapRemoteBrowserAction({ Kind: 'wait', Ms: 2500 });
        expect(result).toBeInstanceOf(WaitAction);
        const wait = result as WaitAction;
        expect(wait.DurationMs).toBe(2500);
        expect(wait.Selector).toBeUndefined();
    });

    it('maps wait with a Selector → WaitAction carrying the selector (wait-for-element branch)', () => {
        const wait = mapRemoteBrowserAction({ Kind: 'wait', Selector: '.ready' }) as WaitAction;
        expect(wait.Selector).toBe('.ready');
    });

    it('maps wait with neither Ms nor Selector → WaitAction keeping its default duration', () => {
        const wait = mapRemoteBrowserAction({ Kind: 'wait' }) as WaitAction;
        // The adapter's own default duration applies; we do not overwrite it.
        expect(wait.DurationMs).toBe(new WaitAction().DurationMs);
        expect(wait.Selector).toBeUndefined();
    });

    it('covers every RemoteBrowserAction.Kind (no kind silently unmapped)', () => {
        const samples: RemoteBrowserAction[] = [
            { Kind: 'navigate', Url: 'https://a.test/' },
            { Kind: 'click', Selector: 'a' },
            { Kind: 'type', Text: 't' },
            { Kind: 'key', Key: 'Tab' },
            { Kind: 'scroll', DeltaY: 1 },
            { Kind: 'back' },
            { Kind: 'forward' },
            { Kind: 'wait', Ms: 1 },
        ];
        for (const action of samples) {
            expect(mapRemoteBrowserAction(action)).toBeDefined();
        }
    });
});

describe('mapHumanInput', () => {
    it('maps pointer-move → MouseMoveAction at X/Y', () => {
        const result = mapHumanInput({ Kind: 'pointer-move', X: 100, Y: 200 });
        expect(result).toBeInstanceOf(MouseMoveAction);
        const move = result as MouseMoveAction;
        expect(move.X).toBe(100);
        expect(move.Y).toBe(200);
    });

    it('maps pointer-click → ClickAction at X/Y with the chosen button', () => {
        const result = mapHumanInput({ Kind: 'pointer-click', X: 1, Y: 2, Button: 'right' });
        expect(result).toBeInstanceOf(ClickAction);
        const click = result as ClickAction;
        expect(click.X).toBe(1);
        expect(click.Y).toBe(2);
        expect(click.Button).toBe('right');
    });

    it('maps pointer-click without a button → ClickAction defaulting to left', () => {
        const click = mapHumanInput({ Kind: 'pointer-click', X: 3, Y: 4 }) as ClickAction;
        expect(click.Button).toBe('left');
    });

    it('maps key → KeypressAction with the key', () => {
        const result = mapHumanInput({ Kind: 'key', Key: 'Escape' });
        expect(result).toBeInstanceOf(KeypressAction);
        expect((result as KeypressAction).Key).toBe('Escape');
    });

    it('maps scroll → ScrollAction carrying the wheel deltas (CDP mouse-wheel at the current cursor)', () => {
        const result = mapHumanInput({ Kind: 'scroll', X: 100, Y: 200, DeltaX: 12, DeltaY: -48 });
        expect(result).toBeInstanceOf(ScrollAction);
        const scroll = result as ScrollAction;
        expect(scroll.DeltaX).toBe(12);
        expect(scroll.DeltaY).toBe(-48);
        // No selector — it's a delta wheel landing at the (move-positioned) cursor.
        expect(scroll.Selector).toBeUndefined();
    });

    it('covers every RemoteBrowserHumanInput.Kind', () => {
        const samples: RemoteBrowserHumanInput[] = [
            { Kind: 'pointer-move', X: 0, Y: 0 },
            { Kind: 'pointer-click', X: 0, Y: 0 },
            { Kind: 'key', Key: 'A' },
            { Kind: 'scroll', X: 0, Y: 0, DeltaX: 0, DeltaY: 1 },
        ];
        for (const input of samples) {
            expect(mapHumanInput(input)).toBeDefined();
        }
    });
});
