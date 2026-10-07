import { describe, it, expect } from 'vitest';
import { ParsePipRects, ParsePlacementMoves, RecordPlacementMove, SerializePipRects, SerializePlacementMoves, WithoutStageMoves } from '../media/mediaLayout';

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
