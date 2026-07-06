import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, queryAll, capture } from '@memberjunction/ng-test-utils';
import { MjKanbanBoardComponent } from './kanban-board.component';
import { KanbanCardData, KanbanColumnDef } from '../models/kanban.models';

/**
 * DOM-level spec for <mj-kanban-board> — column/card rendering from inputs,
 * @if gating (empty-column / subtitle / badge / footer), conditional classes,
 * draggable attr gated on ReadOnly, and the CardClicked / CardMoved @Outputs.
 *
 * Drag-and-drop is exercised via synthetic drag-typed Events (see `dragEvent`
 * helper below) — the component drives its own state from the handlers and only
 * optionally touches `dataTransfer`, so no real HTML5 DnD engine is required.
 */
describe('MjKanbanBoardComponent (DOM)', () => {
  const COLUMNS: KanbanColumnDef[] = [
    { Key: 'todo', Label: 'To Do', Color: '#ff0000' },
    { Key: 'done', Label: 'Done' },
  ];

  const CARDS: KanbanCardData[] = [
    { ID: 'c1', Title: 'First', Subtitle: 'sub one', ColumnKey: 'todo', BadgeText: 'High', BadgeColor: '#123456', FooterText: 'due soon' },
    { ID: 'c2', Title: 'Second', ColumnKey: 'todo' },
  ];

  const render = (inputs: Record<string, unknown>): ComponentFixture<MjKanbanBoardComponent> => renderComponentFixture(MjKanbanBoardComponent, { inputs });

  // jsdom does not implement the HTML5 DnD `DragEvent` constructor. The component's
  // handlers only call event.preventDefault() and OPTIONALLY touch event.dataTransfer
  // (via `?.`), so a plain Event with the drag event type drives the exact same code
  // path the template wires up (dragstart/dragover/dragleave/drop/dragend).
  const dragEvent = (type: string): Event => new Event(type, { bubbles: true, cancelable: true });

  // --- column rendering ---------------------------------------------------

  it('renders one column per Columns entry with its label', () => {
    const f = render({ Columns: COLUMNS, Cards: [] });
    const cols = queryAll(f, '.mj-kanban-column');
    expect(cols.length).toBe(2);
    const titles = queryAll(f, '.column-title').map((el) => el.textContent?.trim());
    expect(titles).toEqual(['To Do', 'Done']);
  });

  it('renders no columns when Columns is empty', () => {
    const f = render({ Columns: [], Cards: CARDS });
    expect(queryAll(f, '.mj-kanban-column').length).toBe(0);
  });

  it('shows the per-column card count', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const counts = queryAll(f, '.column-count').map((el) => el.textContent?.trim());
    expect(counts).toEqual(['2', '0']); // both cards are in todo
  });

  // --- card rendering -----------------------------------------------------

  it('renders cards in their matching column only', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const todoCol = queryAll(f, '.mj-kanban-column')[0];
    const doneCol = queryAll(f, '.mj-kanban-column')[1];
    expect(todoCol.querySelectorAll('.mj-kanban-card').length).toBe(2);
    expect(doneCol.querySelectorAll('.mj-kanban-card').length).toBe(0);
  });

  it('renders the card title and subtitle', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const firstCard = queryAll(f, '.mj-kanban-card')[0];
    expect(firstCard.querySelector('.card-title')?.textContent?.trim()).toBe('First');
    expect(firstCard.querySelector('.card-subtitle')?.textContent?.trim()).toBe('sub one');
  });

  it('omits the subtitle element when card has no Subtitle (@if gating)', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const secondCard = queryAll(f, '.mj-kanban-card')[1];
    expect(secondCard.querySelector('.card-subtitle')).toBeNull();
  });

  it('renders badge text and footer text when present, omits them when absent', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const [first, second] = queryAll(f, '.mj-kanban-card');
    expect(first.querySelector('.card-badge')?.textContent?.trim()).toBe('High');
    expect(first.querySelector('.card-footer-text')?.textContent?.trim()).toBe('due soon');
    expect(second.querySelector('.card-badge')).toBeNull();
    expect(second.querySelector('.card-footer-text')).toBeNull();
  });

  // --- empty column @if/@else --------------------------------------------

  it('shows "Drop here" in an empty column when editable', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS, ReadOnly: false });
    const doneCol = queryAll(f, '.mj-kanban-column')[1];
    expect(doneCol.querySelector('.empty-column')?.textContent?.trim()).toBe('Drop here');
  });

  it('shows "No items" in an empty column when read-only', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS, ReadOnly: true });
    const doneCol = queryAll(f, '.mj-kanban-column')[1];
    expect(doneCol.querySelector('.empty-column')?.textContent?.trim()).toBe('No items');
  });

  it('does not render an empty-column placeholder when the column has cards', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const todoCol = queryAll(f, '.mj-kanban-column')[0];
    expect(todoCol.querySelector('.empty-column')).toBeNull();
  });

  // --- ReadOnly -> draggable attribute -----------------------------------

  it('marks cards draggable when editable', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS, ReadOnly: false });
    expect((queryAll(f, '.mj-kanban-card')[0] as HTMLElement).getAttribute('draggable')).toBe('true');
  });

  it('marks cards not draggable when read-only', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS, ReadOnly: true });
    expect((queryAll(f, '.mj-kanban-card')[0] as HTMLElement).getAttribute('draggable')).toBe('false');
  });

  // --- CardClicked @Output -----------------------------------------------

  it('emits CardClicked with the card when a card is clicked', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const clicks = capture(f.componentInstance.CardClicked);
    (queryAll(f, '.mj-kanban-card')[0] as HTMLElement).click();
    expect(clicks.length).toBe(1);
    expect(clicks[0].ID).toBe('c1');
  });

  // --- drag state: drag-over class ---------------------------------------

  it('applies the drag-over class to a column on dragover and removes it on dragleave', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const doneCol = queryAll(f, '.mj-kanban-column')[1] as HTMLElement;

    doneCol.dispatchEvent(dragEvent('dragover'));
    f.detectChanges();
    expect(doneCol.classList.contains('drag-over')).toBe(true);

    doneCol.dispatchEvent(dragEvent('dragleave'));
    f.detectChanges();
    expect(doneCol.classList.contains('drag-over')).toBe(false);
  });

  // --- CardMoved @Output (full drag -> drop across columns) --------------

  it('emits CardMoved when a card is dragged from one column and dropped on another', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const moves = capture(f.componentInstance.CardMoved);

    const firstCard = queryAll(f, '.mj-kanban-card')[0] as HTMLElement;
    const doneCol = queryAll(f, '.mj-kanban-column')[1] as HTMLElement;

    firstCard.dispatchEvent(dragEvent('dragstart'));
    doneCol.dispatchEvent(dragEvent('drop'));
    f.detectChanges();

    expect(moves.length).toBe(1);
    expect(moves[0].Card.ID).toBe('c1');
    expect(moves[0].FromColumn).toBe('todo');
    expect(moves[0].ToColumn).toBe('done');
  });

  it('does NOT emit CardMoved when a card is dropped on its own column', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const moves = capture(f.componentInstance.CardMoved);

    const firstCard = queryAll(f, '.mj-kanban-card')[0] as HTMLElement;
    const todoCol = queryAll(f, '.mj-kanban-column')[0] as HTMLElement;

    firstCard.dispatchEvent(dragEvent('dragstart'));
    todoCol.dispatchEvent(dragEvent('drop'));
    f.detectChanges();

    expect(moves.length).toBe(0);
  });

  it('applies the dragging class to the card being dragged', () => {
    const f = render({ Columns: COLUMNS, Cards: CARDS });
    const firstCard = queryAll(f, '.mj-kanban-card')[0] as HTMLElement;
    firstCard.dispatchEvent(dragEvent('dragstart'));
    f.detectChanges();
    expect(firstCard.classList.contains('dragging')).toBe(true);

    firstCard.dispatchEvent(dragEvent('dragend'));
    f.detectChanges();
    expect(firstCard.classList.contains('dragging')).toBe(false);
  });
});
