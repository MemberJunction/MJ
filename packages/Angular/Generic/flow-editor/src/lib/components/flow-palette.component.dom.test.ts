import { describe, it, expect } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FFlowModule } from '@foblex/flow';
import { FlowPaletteComponent } from './flow-palette.component';
import type { FlowNodeTypeConfig } from '../interfaces/flow-types';

/**
 * DOM tests for FlowPaletteComponent.
 *
 * The interesting assertion here is that a palette entry is a **button that responds to a click**.
 * It used to be a bare `<div fExternalItem>`: draggable, and completely inert to a click — so the
 * gesture most people try first produced no event anywhere in the system, which is not a failure a
 * class-level test can see. These render the real template and click it.
 *
 * Foblex's `fExternalItem` is not declared here on purpose: this suite is about the palette's own
 * click/keyboard contract, and the drag directive is exercised where the canvas is (the editor).
 */
describe('FlowPaletteComponent (DOM)', () => {
  const nodeType = (over: Partial<FlowNodeTypeConfig> = {}): FlowNodeTypeConfig => ({
    Type: 'Action', Label: 'Action', Icon: 'fa-bolt', Color: '#3B82F6', Category: 'Steps', ...over,
  });

  const types: FlowNodeTypeConfig[] = [
    nodeType(),
    nodeType({ Type: 'Prompt', Label: 'Prompt', Icon: 'fa-comment-dots', Color: '#8B5CF6' }),
    nodeType({ Type: 'ForEach', Label: 'For Each', Icon: 'fa-arrows-repeat', Color: '#F59E0B', Category: 'Loops' }),
  ];

  function render(inputs: Record<string, unknown> = {}): ComponentFixture<FlowPaletteComponent> {
    // Only what the palette's own template needs — FFlowModule for the `fExternalItem` drag
    // directive. Pulling in the whole FlowEditorModule would drag the canvas (and Foblex's flow
    // runtime) into a suite about one sidebar.
    TestBed.configureTestingModule({ imports: [CommonModule, FFlowModule], declarations: [FlowPaletteComponent] });
    const fixture = TestBed.createComponent(FlowPaletteComponent);
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
    return fixture;
  }

  const items = (fixture: ComponentFixture<FlowPaletteComponent>): HTMLElement[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.mj-flow-palette-item'));

  const categoryLabels = (fixture: ComponentFixture<FlowPaletteComponent>): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.mj-flow-palette-category-label'))
      .map((e) => e.textContent?.trim() ?? '');

  it('renders one entry per node type', () => {
    const fixture = render({ NodeTypes: types });
    expect(items(fixture)).toHaveLength(3);
  });

  it('renders entries as BUTTONS — a div cannot be clicked or reached from the keyboard', () => {
    const fixture = render({ NodeTypes: types });
    for (const el of items(fixture)) {
      expect(el.tagName).toBe('BUTTON');
      expect(el.getAttribute('type')).toBe('button');
    }
  });

  it('EMITS the activated node type when an entry is clicked', () => {
    const fixture = render({ NodeTypes: types });
    const seen: FlowNodeTypeConfig[] = [];
    fixture.componentInstance.NodeTypeActivated.subscribe((c) => seen.push(c));

    items(fixture)[1].click();

    expect(seen).toHaveLength(1);
    expect(seen[0].Type).toBe('Prompt');
  });

  it('carries the whole config, so the host never has to look the type back up', () => {
    const fixture = render({ NodeTypes: types });
    let received: FlowNodeTypeConfig | null = null;
    fixture.componentInstance.NodeTypeActivated.subscribe((c) => (received = c));

    items(fixture)[2].click();

    expect(received).toEqual(types[2]);
  });

  it('groups entries by category', () => {
    const fixture = render({ NodeTypes: types });
    expect(categoryLabels(fixture)).toEqual(['Steps', 'Loops']);
  });

  it('omits non-draggable types — they are not offered, so they cannot be activated', () => {
    const fixture = render({ NodeTypes: [...types, nodeType({ Type: 'Hidden', Label: 'Hidden', Draggable: false })] });
    expect(items(fixture)).toHaveLength(3);
  });

  it('renders nothing to activate while collapsed', () => {
    const fixture = render({ NodeTypes: types, Collapsed: true });
    expect(items(fixture)).toHaveLength(0);
  });

  it('tells the user BOTH gestures work, since the click one was invisible before', () => {
    const fixture = render({ NodeTypes: types });
    const title = items(fixture)[0].getAttribute('title') ?? '';
    expect(title).toContain('Click');
    expect(title).toContain('drag');
  });
});
