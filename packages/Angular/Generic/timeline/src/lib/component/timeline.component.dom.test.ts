import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { TimelineComponent } from './timeline.component';
import { TimelineGroup } from '../timeline-group';
import type { AfterEventClickArgs, BeforeEventClickArgs, AfterActionClickArgs } from '../events';

/**
 * DOM tests for the MJ Timeline component.
 *
 * The timeline is a module-declared (`standalone: false`) compound component configured
 * via `@Input() groups`. We drive it with **array**-backed `TimelineGroup`s so the load
 * path is fully in-memory (no RunView / provider dependency, no network) and renders
 * synchronously enough for `autoDetect`. The first render is deferred to `ngAfterViewInit`,
 * so all specs use `await fixture.whenStable()` after creation before asserting.
 *
 * `autoDetect: true` is required: `refresh()` runs from `ngAfterViewInit` and mutates state
 * (isLoading/isInitialized/allEvents) during the lifecycle, which would otherwise trip the
 * zoneless dev-mode NG0100 check on a single manual `detectChanges()`.
 */

interface PlainEvent {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  eventDate: Date;
}

function makeGroup(records: PlainEvent[], overrides: Partial<TimelineGroup<PlainEvent>> = {}): TimelineGroup<PlainEvent> {
  const group = TimelineGroup.FromArray<PlainEvent>(records, {
    titleField: 'title',
    dateField: 'eventDate',
    subtitleField: 'subtitle',
    descriptionField: 'description',
    idField: 'id',
  });
  Object.assign(group, overrides);
  return group;
}

const SAMPLE: PlainEvent[] = [
  { id: 'a', title: 'Alpha event', subtitle: 'first', description: 'Alpha body', eventDate: new Date(2024, 0, 15) },
  { id: 'b', title: 'Beta event', subtitle: 'second', description: 'Beta body', eventDate: new Date(2024, 1, 20) },
];

function flushMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function renderTimeline(inputs: Record<string, unknown>) {
  const fixture = renderComponentFixture(TimelineComponent, {
    imports: [CommonModule],
    declarations: [TimelineComponent],
    inputs,
  });
  // The first load is deferred to ngAfterViewInit, which fires refresh() asynchronously
  // (it awaits the in-memory array load). Flush the macrotask queue so that promise settles,
  // THEN render: the freshly-loaded events become visible on this detectChanges pass.
  await flushMacrotask();
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

describe('TimelineComponent (DOM)', () => {
  it('renders the container with the role and aria-label binding', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)], ariaLabel: 'My Timeline' });
    const container = fixture.nativeElement.querySelector('.mj-timeline') as HTMLElement;
    expect(container).not.toBeNull();
    expect(container.getAttribute('role')).toBe('list');
    expect(container.getAttribute('aria-label')).toBe('My Timeline');
  });

  it('applies orientation and layout classes from inputs', async () => {
    const fixture = await renderTimeline({
      groups: [makeGroup(SAMPLE)],
      orientation: 'horizontal',
      layout: 'alternating',
    });
    const container = fixture.nativeElement.querySelector('.mj-timeline') as HTMLElement;
    expect(container.classList.contains('mj-timeline--horizontal')).toBe(true);
    expect(container.classList.contains('mj-timeline--alternating')).toBe(true);
    expect(container.classList.contains('mj-timeline--vertical')).toBe(false);
    expect(container.classList.contains('mj-timeline--single')).toBe(false);
  });

  it('shows the empty state with the configured message when a group has no records', async () => {
    const fixture = await renderTimeline({
      groups: [makeGroup([])],
      emptyMessage: 'Nothing here',
    });
    const empty = fixture.nativeElement.querySelector('.mj-timeline__empty');
    expect(empty).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.mj-timeline__empty-text')?.textContent?.trim()).toBe('Nothing here');
    // No event cards when empty.
    expect(fixture.nativeElement.querySelectorAll('.mj-timeline__event').length).toBe(0);
  });

  it('renders one event card per record with the title bound', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)] });
    const cards = fixture.nativeElement.querySelectorAll('.mj-timeline__event');
    expect(cards.length).toBe(2);
    const titles = Array.from(fixture.nativeElement.querySelectorAll('.mj-timeline__card-title')).map((el) => (el as HTMLElement).textContent?.trim());
    expect(titles).toContain('Alpha event');
    expect(titles).toContain('Beta event');
  });

  it('sets the data-event-id attribute on each card from the record id', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)] });
    const ids = Array.from(fixture.nativeElement.querySelectorAll('[data-event-id]')).map((el) => (el as HTMLElement).getAttribute('data-event-id'));
    expect(ids).toContain('a');
    expect(ids).toContain('b');
  });

  it('groups events into month segments by default and labels the count', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)] });
    const segments = fixture.nativeElement.querySelectorAll('.mj-timeline__segment');
    // Two events in different months → two month segments.
    expect(segments.length).toBe(2);
    const counts = Array.from(fixture.nativeElement.querySelectorAll('.mj-timeline__segment-count')).map((el) => (el as HTMLElement).textContent?.trim());
    expect(counts).toContain('(1 event)');
  });

  it('renders a flat axis (no segment headers) when segmentGrouping is none', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)], segmentGrouping: 'none' });
    expect(fixture.nativeElement.querySelectorAll('.mj-timeline__segment').length).toBe(0);
    expect(fixture.nativeElement.querySelector('.mj-timeline__axis')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.mj-timeline__event').length).toBe(2);
  });

  it('emits beforeEventClick and afterEventClick when a card is clicked', async () => {
    const before = vi.fn();
    const after = vi.fn();
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE, { EventConfigFunction: () => ({ collapsible: true }) })] });
    fixture.componentInstance.beforeEventClick.subscribe(before);
    fixture.componentInstance.afterEventClick.subscribe(after);

    const card = fixture.nativeElement.querySelector('.mj-timeline__card') as HTMLElement;
    // Cards are rendered in the timeline's own (date) order, not SAMPLE order, so assert
    // against the title of the card we actually clicked rather than hardcoding one.
    const clickedTitle = card.querySelector('.mj-timeline__card-title')?.textContent?.trim();
    card.click();
    await fixture.whenStable();

    expect(before).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledTimes(1);
    const beforeArg = before.mock.calls[0][0] as BeforeEventClickArgs<PlainEvent>;
    const afterArg = after.mock.calls[0][0] as AfterEventClickArgs<PlainEvent>;
    expect(beforeArg.event.title).toBe(clickedTitle);
    expect(afterArg.success).toBe(true);
  });

  it('honors cancel=true on beforeEventClick by not toggling expansion', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE, { EventConfigFunction: () => ({ collapsible: true, defaultExpanded: false }) })] });
    fixture.componentInstance.beforeEventClick.subscribe((args: BeforeEventClickArgs<PlainEvent>) => {
      args.cancel = true;
    });
    const card = fixture.nativeElement.querySelector('.mj-timeline__card') as HTMLElement;
    card.click();
    await fixture.whenStable();
    fixture.detectChanges();
    // No card should be in expanded state since the click was cancelled before toggling.
    expect(fixture.nativeElement.querySelectorAll('.mj-timeline__event--expanded').length).toBe(0);
  });

  it('renders a collapse/expand toggle button when cards are collapsible', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE, { EventConfigFunction: () => ({ collapsible: true }) })] });
    const toggles = fixture.nativeElement.querySelectorAll('button.mj-timeline__card-toggle');
    expect(toggles.length).toBe(2);
    // Collapsed by default → aria-label is "Expand".
    expect((toggles[0] as HTMLElement).getAttribute('aria-label')).toBe('Expand');
  });

  it('renders action buttons and emits afterActionClick on click', async () => {
    const after = vi.fn();
    const group = makeGroup([SAMPLE[0]], {
      EventConfigFunction: () => ({ actions: [{ id: 'edit', label: 'Edit', variant: 'primary' }] }),
    });
    const fixture = await renderTimeline({ groups: [group] });
    fixture.componentInstance.afterActionClick.subscribe(after);

    const actionBtn = fixture.nativeElement.querySelector('button.mj-timeline__action') as HTMLButtonElement;
    expect(actionBtn).not.toBeNull();
    expect(actionBtn.textContent?.trim()).toBe('Edit');
    expect(actionBtn.classList.contains('mj-timeline__action--primary')).toBe(true);

    actionBtn.click();
    await fixture.whenStable();
    expect(after).toHaveBeenCalledTimes(1);
    const arg = after.mock.calls[0][0] as AfterActionClickArgs<PlainEvent>;
    expect(arg.action.id).toBe('edit');
  });

  it('does not emit afterActionClick for a disabled action', async () => {
    const after = vi.fn();
    const group = makeGroup([SAMPLE[0]], {
      EventConfigFunction: () => ({ actions: [{ id: 'x', label: 'Nope', disabled: true }] }),
    });
    const fixture = await renderTimeline({ groups: [group] });
    fixture.componentInstance.afterActionClick.subscribe(after);

    const actionBtn = fixture.nativeElement.querySelector('button.mj-timeline__action') as HTMLButtonElement;
    expect(actionBtn.disabled).toBe(true);
    actionBtn.click();
    await fixture.whenStable();
    expect(after).not.toHaveBeenCalled();
  });

  it('toggles segment collapsed class when the segment header is clicked', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)], segmentsCollapsible: true });
    const segment = fixture.nativeElement.querySelector('.mj-timeline__segment') as HTMLElement;
    const header = segment.querySelector('.mj-timeline__segment-header') as HTMLElement;
    expect(segment.classList.contains('mj-timeline__segment--collapsed')).toBe(false);

    header.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(segment.classList.contains('mj-timeline__segment--collapsed')).toBe(true);
  });

  it('highlights the event matching selectedEventId via the focused class', async () => {
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)], segmentGrouping: 'none' });
    fixture.componentRef.setInput('selectedEventId', 'b');
    fixture.detectChanges();
    await fixture.whenStable();

    const focused = fixture.nativeElement.querySelectorAll('.mj-timeline__event--focused');
    expect(focused.length).toBe(1);
    expect((focused[0] as HTMLElement).getAttribute('data-event-id')).toBe('b');
  });

  it('alternates the odd/even event classes in the alternating layout', async () => {
    // segmentGrouping 'none' = one flat event list, so the alternating index spans all events
    // (with month segments each 1-event segment restarts the index).
    const fixture = await renderTimeline({ groups: [makeGroup(SAMPLE)], layout: 'alternating', segmentGrouping: 'none' });
    const events = Array.from(fixture.nativeElement.querySelectorAll('.mj-timeline__event')) as HTMLElement[];
    expect(events.length).toBe(2);
    expect(events.filter((e) => e.classList.contains('mj-timeline__event--odd')).length).toBe(1);
    expect(events.filter((e) => e.classList.contains('mj-timeline__event--even')).length).toBe(1);
  });

  it('applies the per-action variant classes to event action buttons', async () => {
    const fixture = await renderTimeline({
      groups: [
        makeGroup(SAMPLE, {
          EventConfigFunction: () => ({
            actions: [
              { id: 'edit', label: 'Edit', variant: 'secondary' },
              { id: 'del', label: 'Remove', variant: 'danger' },
              { id: 'more', label: 'More', variant: 'link' },
            ],
          }),
        }),
      ],
    });
    const actions = Array.from(fixture.nativeElement.querySelectorAll('.mj-timeline__action')) as HTMLElement[];
    expect(actions.some((a) => a.classList.contains('mj-timeline__action--secondary'))).toBe(true);
    expect(actions.some((a) => a.classList.contains('mj-timeline__action--danger'))).toBe(true);
    expect(actions.some((a) => a.classList.contains('mj-timeline__action--link'))).toBe(true);
  });
});
