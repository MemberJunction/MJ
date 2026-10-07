import { describe, it, expect } from 'vitest';
import {
    MEDIA_LAYOUT_SAVED_LIMIT,
    MediaLayoutPrefs,
    ParsePipRects,
    ParsePlacementMoves,
    RecordPipRect,
    RecordPlacementMove,
    SerializePipRects,
    SerializePlacementMoves,
    WithoutStageMoves,
    type MediaLayoutSettings,
} from '../media/mediaLayout';

/** The user's layout as a host keeps and saves it (moved from the call's own preference helpers in ng-conversations). */
describe('placement moves', () => {
    it('reads back what it saves', () => {
        const moves = [
            { SurfaceKey: 'Whiteboard', Placement: 'stage' as const },
            { SurfaceKey: 'participant:ada', Placement: 'pip' as const },
        ];
        expect(ParsePlacementMoves(SerializePlacementMoves(moves))).toEqual(moves);
    });

    it('reads nothing saved, unparseable text or a non-list as no moves', () => {
        expect(ParsePlacementMoves(undefined)).toEqual([]);
        expect(ParsePlacementMoves(null)).toEqual([]);
        expect(ParsePlacementMoves('')).toEqual([]);
        expect(ParsePlacementMoves('{not json')).toEqual([]);
        expect(ParsePlacementMoves('{"Whiteboard":"stage"}')).toEqual([]);
    });

    it('skips malformed entries and keeps the rest, without extra fields', () => {
        const raw = JSON.stringify([
            { SurfaceKey: 'Whiteboard', Placement: 'stage', Extra: 1 },
            { SurfaceKey: 'Browser', Placement: 'sideways' },
            { Placement: 'tab' },
            null,
            'Media',
            { SurfaceKey: 'Media', Placement: 'pip' },
        ]);
        expect(ParsePlacementMoves(raw)).toEqual([
            { SurfaceKey: 'Whiteboard', Placement: 'stage' },
            { SurfaceKey: 'Media', Placement: 'pip' },
        ]);
    });

    it('saves only the two fields', () => {
        const extra = { SurfaceKey: 'Media', Placement: 'pip' as const, Extra: 1 };
        expect(JSON.parse(SerializePlacementMoves([extra]))).toEqual([{ SurfaceKey: 'Media', Placement: 'pip' }]);
    });

    it("records a move at the end, replacing the surface's earlier move, and leaves the list it was given alone", () => {
        const moves = [
            { SurfaceKey: 'Whiteboard', Placement: 'stage' as const },
            { SurfaceKey: 'Browser', Placement: 'hidden' as const },
        ];
        expect(RecordPlacementMove(moves, { SurfaceKey: 'Whiteboard', Placement: 'tab' })).toEqual([
            { SurfaceKey: 'Browser', Placement: 'hidden' },
            { SurfaceKey: 'Whiteboard', Placement: 'tab' },
        ]);
        expect(moves).toHaveLength(2);
    });

    it('drops every move to the stage and keeps the others in order', () => {
        const moves = [
            { SurfaceKey: 'participant:ada', Placement: 'stage' as const },
            { SurfaceKey: 'participant:bo', Placement: 'pip' as const },
            { SurfaceKey: 'participant:cy', Placement: 'stage' as const },
            { SurfaceKey: 'participant:di', Placement: 'tab' as const },
        ];
        expect(WithoutStageMoves(moves)).toEqual([
            { SurfaceKey: 'participant:bo', Placement: 'pip' },
            { SurfaceKey: 'participant:di', Placement: 'tab' },
        ]);
    });
});

describe('saved picture-in-picture boxes', () => {
    it('reads back what it saves', () => {
        const rects = new Map([
            ['Whiteboard', { X: 0.1, Y: 0.2, W: 0.3, H: 0.25 }],
            ['ada', { X: 0.6, Y: 0.6, W: 0.32, H: 0.25 }],
        ]);
        expect(ParsePipRects(SerializePipRects(rects))).toEqual(rects);
    });

    it('reads nothing saved, unparseable text, a list or a non-object as no boxes', () => {
        expect(ParsePipRects(undefined).size).toBe(0);
        expect(ParsePipRects(null).size).toBe(0);
        expect(ParsePipRects('{nope').size).toBe(0);
        expect(ParsePipRects('[]').size).toBe(0);
        expect(ParsePipRects('[{"X":0.1,"Y":0.1,"W":0.2,"H":0.2}]').size).toBe(0);
        expect(ParsePipRects('"Whiteboard"').size).toBe(0);
    });

    it('saves only the four fractions', () => {
        const rects = new Map([['ada', { X: 0.1, Y: 0.2, W: 0.3, H: 0.25, Z: 9 }]]);
        expect(JSON.parse(SerializePipRects(rects))).toEqual({ ada: { X: 0.1, Y: 0.2, W: 0.3, H: 0.25 } });
    });

    it('skips a box that is not four fractions with a size, and keeps the rest without extra fields', () => {
        const raw = JSON.stringify({
            Whiteboard: { X: 0.1, Y: 0.1, W: 0.3, H: 0.3, Z: 9 },
            Outside: { X: 1.2, Y: 0, W: 0.3, H: 0.3 },
            Flat: { X: 0.1, Y: 0.1, W: 0, H: 0.3 },
            Missing: { X: 0.1, Y: 0.1, W: 0.3 },
            Text: { X: '0.1', Y: 0.1, W: 0.3, H: 0.3 },
            Nothing: null,
        });
        expect([...ParsePipRects(raw)]).toEqual([['Whiteboard', { X: 0.1, Y: 0.1, W: 0.3, H: 0.3 }]]);
    });
});

describe('recording a box', () => {
    it("puts the box last, replacing the surface's earlier one, and leaves the map it was given alone", () => {
        const rects = new Map([
            ['ada', { X: 0.1, Y: 0.1, W: 0.2, H: 0.2 }],
            ['bo', { X: 0.5, Y: 0.5, W: 0.2, H: 0.2 }],
        ]);
        const next = RecordPipRect(rects, 'ada', { X: 0.3, Y: 0.3, W: 0.2, H: 0.2 });
        expect([...next]).toEqual([
            ['bo', { X: 0.5, Y: 0.5, W: 0.2, H: 0.2 }],
            ['ada', { X: 0.3, Y: 0.3, W: 0.2, H: 0.2 }],
        ]);
        expect(rects.get('ada')).toEqual({ X: 0.1, Y: 0.1, W: 0.2, H: 0.2 });
    });
});

describe('a saved layout (MediaLayoutPrefs)', () => {
    const KEYS = { Moves: 'host.moves', PipRects: 'host.pips' };
    /** A store that keeps settings in memory, as UserInfoEngine keeps them for the user. */
    const memoryStore = (saved: Record<string, string> = {}) => {
        const settings = new Map(Object.entries(saved));
        const store: MediaLayoutSettings = {
            GetSetting: (key) => settings.get(key),
            SetSettingDebounced: (key, value) => {
                settings.set(key, value);
            },
        };
        return { store, settings };
    };
    const notReady = (): MediaLayoutSettings => {
        throw new Error('not configured');
    };

    it("reads the host's saved moves and boxes from its own keys", () => {
        const { store } = memoryStore({
            'host.moves': SerializePlacementMoves([{ SurfaceKey: 'participant:ada', Placement: 'pip' }]),
            'host.pips': SerializePipRects(new Map([['ada', { X: 0.1, Y: 0.1, W: 0.2, H: 0.2 }]])),
            'other.moves': SerializePlacementMoves([{ SurfaceKey: 'Whiteboard', Placement: 'stage' }]),
        });
        const prefs = new MediaLayoutPrefs(() => store, KEYS);
        expect(prefs.LoadMoves()).toEqual([{ SurfaceKey: 'participant:ada', Placement: 'pip' }]);
        expect([...prefs.LoadPipRects()]).toEqual([['ada', { X: 0.1, Y: 0.1, W: 0.2, H: 0.2 }]]);
    });

    it('saves under its own keys, in the shared form', () => {
        const { store, settings } = memoryStore();
        const prefs = new MediaLayoutPrefs(() => store, KEYS);
        prefs.SaveMoves([{ SurfaceKey: 'participant:ada', Placement: 'stage' }]);
        prefs.SavePipRects(new Map([['bo', { X: 0.5, Y: 0.5, W: 0.2, H: 0.2 }]]));
        expect(ParsePlacementMoves(settings.get('host.moves'))).toEqual([{ SurfaceKey: 'participant:ada', Placement: 'stage' }]);
        expect([...ParsePipRects(settings.get('host.pips'))]).toEqual([['bo', { X: 0.5, Y: 0.5, W: 0.2, H: 0.2 }]]);
    });

    it('keeps the newest moves and boxes, up to the limit', () => {
        const { store, settings } = memoryStore();
        const prefs = new MediaLayoutPrefs(() => store, KEYS);
        const count = MEDIA_LAYOUT_SAVED_LIMIT + 2;
        const ids = Array.from({ length: count }, (_, i) => `p${i}`);
        prefs.SaveMoves(ids.map((id) => ({ SurfaceKey: id, Placement: 'pip' as const })));
        prefs.SavePipRects(new Map(ids.map((id) => [id, { X: 0.1, Y: 0.1, W: 0.2, H: 0.2 }])));
        const moves = ParsePlacementMoves(settings.get('host.moves'));
        expect(moves).toHaveLength(MEDIA_LAYOUT_SAVED_LIMIT);
        expect(moves[0].SurfaceKey).toBe('p2');
        expect(moves[moves.length - 1].SurfaceKey).toBe(`p${count - 1}`);
        const boxes = [...ParsePipRects(settings.get('host.pips')).keys()];
        expect(boxes).toHaveLength(MEDIA_LAYOUT_SAVED_LIMIT);
        expect(boxes[0]).toBe('p2');
    });

    it('reads nothing and saves nothing while the store is not ready', () => {
        const prefs = new MediaLayoutPrefs(notReady, KEYS);
        expect(prefs.LoadMoves()).toEqual([]);
        expect(prefs.LoadPipRects().size).toBe(0);
        expect(() => prefs.SaveMoves([{ SurfaceKey: 'x', Placement: 'pip' }])).not.toThrow();
        expect(() => prefs.SavePipRects(new Map())).not.toThrow();
    });

    it('looks the store up each time, so a store that becomes ready later is used', () => {
        let ready: MediaLayoutSettings | null = null;
        const prefs = new MediaLayoutPrefs(() => ready ?? notReady(), KEYS);
        expect(prefs.LoadMoves()).toEqual([]);
        const { store, settings } = memoryStore();
        ready = store;
        prefs.SaveMoves([{ SurfaceKey: 'participant:ada', Placement: 'pip' }]);
        expect(settings.has('host.moves')).toBe(true);
    });
});
