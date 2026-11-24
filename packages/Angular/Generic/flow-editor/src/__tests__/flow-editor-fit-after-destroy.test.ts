/**
 * Pins that an auto-fit scheduled before the editor is destroyed does nothing when it fires
 * afterwards.
 *
 * A `ViewportKey` change on a mounted editor schedules `ZoomToFit` on a 120 ms timer. When the
 * host is torn down inside that window, the timer still fires; Foblex's `fitToScreen` then
 * registers a destroy hook on a view that is already destroyed and Angular throws NG0911 as an
 * uncaught exception. In ng-task-graph-editor's DOM specs that failed the whole run with every
 * test passing.
 *
 * Constructed directly rather than through TestBed, like flow-editor-id-matching.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowEditorComponent } from '../lib/components/flow-editor.component';
import { FlowStateService } from '../lib/services/flow-state.service';
import { FlowLayoutService } from '../lib/services/flow-layout.service';
import type { FlowNode } from '../lib/interfaces/flow-types';

const cdrStub = {
    detectChanges: () => undefined,
    markForCheck: () => undefined,
    detach: () => undefined,
    reattach: () => undefined,
    checkNoChanges: () => undefined,
};

/** The three canvas calls `ZoomToFit` makes when the container cannot be measured. */
interface CanvasStub {
    fitToScreen: () => void;
    getScale: () => number;
    setScale: (scale: number) => void;
}

/** The canvas Angular would assign through `@ViewChild` once the template has rendered. */
type CanvasDriver = { fCanvas: CanvasStub };

const node = (id: string): FlowNode => ({
    ID: id,
    Type: 'Action',
    Label: `Step ${id}`,
    Status: 'default',
    Position: { X: 0, Y: 0 },
    Ports: [],
});

describe('FlowEditorComponent auto-fit after destroy', () => {
    let component: FlowEditorComponent;
    let canvas: CanvasStub;

    beforeEach(() => {
        vi.useFakeTimers();
        canvas = { fitToScreen: vi.fn(), getScale: () => 1, setScale: vi.fn() };
        component = new FlowEditorComponent(cdrStub as unknown as never, new FlowStateService(), new FlowLayoutService());
        component.Nodes = [node('a'), node('b')];
        component.ngOnInit();
        (component as unknown as CanvasDriver).fCanvas = canvas;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('fits the canvas when the timer set by a ViewportKey change fires on a live editor', () => {
        component.ViewportKey = 'run:1';
        expect(canvas.fitToScreen).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);

        expect(canvas.fitToScreen).toHaveBeenCalledTimes(1);
    });

    it('leaves the canvas alone when that timer fires after the editor was destroyed', () => {
        component.ViewportKey = 'run:1';
        component.ngOnDestroy();

        vi.advanceTimersByTime(200);

        expect(canvas.fitToScreen).not.toHaveBeenCalled();
        expect(canvas.setScale).not.toHaveBeenCalled();
    });

    it('ignores a direct ZoomToFit call from a host timer after destroy', () => {
        component.ngOnDestroy();

        component.ZoomToFit();

        expect(canvas.fitToScreen).not.toHaveBeenCalled();
    });
});
