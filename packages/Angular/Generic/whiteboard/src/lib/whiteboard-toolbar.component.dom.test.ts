import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { RealtimeWhiteboardToolbarComponent } from './whiteboard-toolbar.component';

/**
 * DOM spec for <mj-realtime-whiteboard-toolbar> — the floating left-edge tool palette.
 * Covers the @for tool rendering, [class.active] on the active tool, the @if pen/text/
 * shape flyouts that only render when their tool is active, the undo/redo [disabled]
 * gating, and the @Output emissions (tool change, pen color/width, undo/redo, and the
 * compound text-style picks that emit BOTH a *Change and StyleSelection).
 */
describe('RealtimeWhiteboardToolbarComponent (DOM)', () => {
  type Fix = ReturnType<typeof renderComponentFixture<RealtimeWhiteboardToolbarComponent>>;
  const toolButtons = (f: Fix) => Array.from(f.nativeElement.querySelectorAll('button.tool')) as HTMLButtonElement[];

  it('renders one tool button per entry in Tools (plus undo + redo)', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent);
    // 11 tools + undo + redo = 13 .tool buttons
    expect(toolButtons(f).length).toBe(f.componentInstance.Tools.length + 2);
  });

  it('marks the active tool button with the .active class and only that one', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'pen' } });
    const active = toolButtons(f).filter((b) => b.classList.contains('active'));
    expect(active.length).toBe(1);
    expect(active[0].getAttribute('title')).toBe('Pen');
  });

  it('does not render the pen flyout when pen is not the active tool', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'select' } });
    expect(f.nativeElement.querySelector('.pen-flyout')).toBeNull();
  });

  it('renders the pen flyout (with one swatch per pen color) when pen is active', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'pen' } });
    const flyout = f.nativeElement.querySelector('.pen-flyout');
    expect(flyout).not.toBeNull();
    expect(flyout!.querySelectorAll('.pen-c').length).toBe(f.componentInstance.PenColors.length);
  });

  it('shows the agent name in the pen-flyout violet note', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'pen', AgentName: 'Sage' } });
    expect(f.nativeElement.querySelector('.pen-note')?.textContent).toContain("violet = Sage's");
  });

  it('renders the text-style flyout only when text is the active tool', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'text' } });
    expect(f.nativeElement.querySelector('.text-flyout')).not.toBeNull();
  });

  it('renders the shape flyout only when shape is the active tool', () => {
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { ActiveTool: 'shape' } });
    const flyout = f.nativeElement.querySelector('.shape-flyout');
    expect(flyout).not.toBeNull();
    expect(flyout!.querySelectorAll('.shape-c').length).toBe(f.componentInstance.ShapeKinds.length);
  });

  it('disables undo/redo by default and enables them when CanUndo/CanRedo are true', () => {
    const disabled = renderComponentFixture(RealtimeWhiteboardToolbarComponent);
    const undoD = disabled.nativeElement.querySelector('button[title="Undo"]') as HTMLButtonElement;
    const redoD = disabled.nativeElement.querySelector('button[title="Redo"]') as HTMLButtonElement;
    expect(undoD.disabled).toBe(true);
    expect(redoD.disabled).toBe(true);

    const enabled = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { inputs: { CanUndo: true, CanRedo: true } });
    expect((enabled.nativeElement.querySelector('button[title="Undo"]') as HTMLButtonElement).disabled).toBe(false);
    expect((enabled.nativeElement.querySelector('button[title="Redo"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('emits ToolChange with the clicked tool', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, { setup: (c) => c.ToolChange.subscribe(spy) });
    // the pen tool button (3rd entry, index 2)
    const penBtn = f.nativeElement.querySelector('button[title="Pen"]') as HTMLButtonElement;
    penBtn.click();
    expect(spy).toHaveBeenCalledWith('pen');
  });

  it('emits PenColorChange when a pen swatch is clicked', () => {
    const spy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, {
      inputs: { ActiveTool: 'pen' },
      setup: (c) => c.PenColorChange.subscribe(spy),
    });
    const swatch = f.nativeElement.querySelector('.pen-flyout .pen-c') as HTMLElement;
    swatch.click();
    expect(spy).toHaveBeenCalledWith(f.componentInstance.PenColors[0]);
  });

  it('emits BOTH TextSizeChange and StyleSelection when a text size is picked', () => {
    const sizeSpy = vi.fn();
    const styleSpy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, {
      inputs: { ActiveTool: 'text' },
      setup: (c) => {
        c.TextSizeChange.subscribe(sizeSpy);
        c.StyleSelection.subscribe(styleSpy);
      },
    });
    const sizeEl = f.nativeElement.querySelector('.text-flyout .txt-s') as HTMLElement;
    sizeEl.click();
    const firstSize = f.componentInstance.TextSizes[0];
    expect(sizeSpy).toHaveBeenCalledWith(firstSize);
    expect(styleSpy).toHaveBeenCalledWith({ FontSize: firstSize });
  });

  it('emits Undo / Redo when those buttons are enabled and clicked', () => {
    const undoSpy = vi.fn();
    const redoSpy = vi.fn();
    const f = renderComponentFixture(RealtimeWhiteboardToolbarComponent, {
      inputs: { CanUndo: true, CanRedo: true },
      setup: (c) => {
        c.Undo.subscribe(undoSpy);
        c.Redo.subscribe(redoSpy);
      },
    });
    (f.nativeElement.querySelector('button[title="Undo"]') as HTMLButtonElement).click();
    (f.nativeElement.querySelector('button[title="Redo"]') as HTMLButtonElement).click();
    expect(undoSpy).toHaveBeenCalledTimes(1);
    expect(redoSpy).toHaveBeenCalledTimes(1);
  });
});
