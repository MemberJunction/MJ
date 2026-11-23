import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FFlowModule } from '@foblex/flow';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { FlowEditorComponent } from './flow-editor.component';
import { FlowNodeComponent } from './flow-node.component';
import { FlowPaletteComponent } from './flow-palette.component';
import { FlowToolbarComponent } from './flow-toolbar.component';
import { FlowStatusBarComponent } from './flow-status-bar.component';
import type { FlowNode } from '../interfaces/flow-types';

/**
 * DOM lifecycle regression tests for FlowEditorComponent.
 *
 * Ensures pending `ZoomToFit` timers scheduled by `onFlowLoaded` / `AutoArrange` are cleared
 * on `ngOnDestroy` and that post-destroy `ZoomToFit` calls return early without touching
 * `@foblex/flow`'s `FCanvasComponent` (which throws `NG0911: View has already been destroyed`).
 */
describe('FlowEditorComponent (DOM) — destroy lifecycle', () => {
  const sampleNodes: FlowNode[] = [
    {
      ID: '11111111-1111-4111-8111-111111111111',
      Type: 'Action',
      Label: 'Step 1',
      Status: 'default',
      Position: { X: 100, Y: 100 },
      Ports: [
        { ID: 'p-in', Direction: 'input', Side: 'left' },
        { ID: 'p-out', Direction: 'output', Side: 'right' },
      ],
    },
  ];

  function renderEditor() {
    return renderComponentFixture(FlowEditorComponent, {
      imports: [CommonModule, FormsModule, FFlowModule],
      declarations: [
        FlowEditorComponent,
        FlowNodeComponent,
        FlowPaletteComponent,
        FlowToolbarComponent,
        FlowStatusBarComponent,
      ],
      inputs: {
        Nodes: sampleNodes,
        Connections: [],
      },
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  interface FlowEditorProtectedAccess {
    fCanvas?: { fitToScreen: (...args: unknown[]) => void };
    onFlowLoaded(): void;
  }

  it('cancels pending initial-fit and AutoArrange zoom timers on destroy without throwing NG0911', () => {
    const fixture = renderEditor();
    const comp = fixture.componentInstance;
    const internals = comp as unknown as FlowEditorProtectedAccess;

    const fitSpy = internals.fCanvas ? vi.spyOn(internals.fCanvas, 'fitToScreen') : null;
    const zoomSpy = vi.spyOn(comp, 'ZoomToFit');

    // Trigger both deferred ZoomToFit timers (120ms from initial viewport + 100ms from AutoArrange).
    internals.onFlowLoaded();
    comp.AutoArrange();

    // Destroy the component before either timeout elapses (reproducing fast route change / DOM test teardown).
    fixture.destroy();

    expect(() => {
      vi.advanceTimersByTime(500);
    }).not.toThrow();

    expect(zoomSpy).not.toHaveBeenCalled();
    if (fitSpy) {
      expect(fitSpy).not.toHaveBeenCalled();
    }
  });

  it('guards direct post-destroy ZoomToFit calls against touching a destroyed fCanvas', () => {
    const fixture = renderEditor();
    const comp = fixture.componentInstance;
    const internals = comp as unknown as FlowEditorProtectedAccess;
    const fitSpy = internals.fCanvas ? vi.spyOn(internals.fCanvas, 'fitToScreen') : null;

    fixture.destroy();

    expect(() => comp.ZoomToFit(false)).not.toThrow();
    if (fitSpy) {
      expect(fitSpy).not.toHaveBeenCalled();
    }
  });
});
