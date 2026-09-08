import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { ViewTypeSwitcherComponent, ViewTypeSelectedEvent } from './view-type-switcher.component';
import { ViewTypeEngine, IViewTypeDescriptor } from '../view-types';

/**
 * DOM coverage for <mj-view-type-switcher> — the Grid/Cards/Timeline/… dropdown in the entity-viewer
 * header (~2×, but the primary way users change view type). It resolves its options from the
 * MJ: View Types registry via ViewTypeEngine. We stub that engine (Config / EnsureAvailabilityData /
 * GetAvailableViewTypeRows) so the component populates itself through its real refresh path, then
 * verify the ">1 option or render nothing" rule, the active-option trigger + fallback, the open/close
 * menu, the active-highlight, and the select → ViewTypeSelected wiring.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));
const ENTITY = { ID: 'entity-1' } as unknown as EntityInfo;

const descriptor = (name: string, label: string, icon: string) =>
  ({ Name: name, DisplayName: label, Icon: icon } as unknown as IViewTypeDescriptor);

const ROWS = [
  { ViewType: { ID: 'id-grid' }, Descriptor: descriptor('GridViewType', 'Grid', 'fa-solid fa-table') },
  { ViewType: { ID: 'id-cards' }, Descriptor: descriptor('CardsViewType', 'Cards', 'fa-solid fa-grip') },
];

/** Stub the registry engine to yield `rows`, so the component's own refresh path fills the switcher. */
function stubEngine(rows: typeof ROWS): void {
  const engine = ViewTypeEngine.Instance;
  vi.spyOn(engine, 'Config').mockResolvedValue(undefined as unknown as Awaited<ReturnType<typeof engine.Config>>);
  vi.spyOn(engine, 'EnsureAvailabilityData').mockResolvedValue(undefined);
  vi.spyOn(engine, 'GetAvailableViewTypeRows').mockReturnValue(rows as unknown as ReturnType<typeof engine.GetAvailableViewTypeRows>);
}

async function render(rows: typeof ROWS, inputs: Record<string, unknown> = {}) {
  stubEngine(rows);
  const f = renderComponentFixture(ViewTypeSwitcherComponent, {
    declarations: [ViewTypeSwitcherComponent],
    inputs: { Entity: ENTITY, ...inputs },
  });
  await tick(); // ngOnInit's async load (now stubbed) resolves + calls refreshAvailableTypes
  f.detectChanges(false);
  return f;
}

afterEach(() => vi.restoreAllMocks());

describe('ViewTypeSwitcherComponent (DOM)', () => {
  it('renders nothing when only one view type is available', async () => {
    const f = await render([ROWS[0]]);
    expect(query(f, '.view-type-dropdown')).toBeNull();
  });

  it('renders the trigger showing the active option label when >1 type is available', async () => {
    const f = await render(ROWS, { ActiveViewTypeID: 'id-cards' });
    expect(query(f, '.view-type-dropdown-trigger')).not.toBeNull();
    expect(text(f, '.view-type-dropdown-label')).toBe('Cards');
  });

  it('falls back to the first option when ActiveViewTypeID matches nothing', async () => {
    const f = await render(ROWS, { ActiveViewTypeID: 'id-nope' });
    expect(text(f, '.view-type-dropdown-label')).toBe('Grid');
  });

  it('opens the menu with one item per available type when the trigger is clicked', async () => {
    const f = await render(ROWS);
    expect(query(f, '.view-type-dropdown-menu')).toBeNull();
    (query(f, '.view-type-dropdown-trigger') as HTMLElement).click();
    f.detectChanges(false);
    expect(query(f, '.view-type-dropdown-menu')).not.toBeNull();
    expect(queryAll(f, '.view-type-dropdown-item').length).toBe(2);
  });

  it('marks the active option in the menu', async () => {
    const f = await render(ROWS, { ActiveViewTypeID: 'id-cards' });
    (query(f, '.view-type-dropdown-trigger') as HTMLElement).click();
    f.detectChanges(false);
    const items = queryAll(f, '.view-type-dropdown-item') as HTMLElement[];
    expect(items[0].classList.contains('active')).toBe(false);
    expect(items[1].classList.contains('active')).toBe(true);
  });

  it('emits ViewTypeSelected and closes the menu when an item is picked', async () => {
    const f = await render(ROWS);
    const out = capture(f.componentInstance.ViewTypeSelected);
    (query(f, '.view-type-dropdown-trigger') as HTMLElement).click();
    f.detectChanges(false);
    (queryAll(f, '.view-type-dropdown-item')[1] as HTMLElement).click();
    f.detectChanges(false);
    expect(out).toEqual<ViewTypeSelectedEvent[]>([{ viewTypeId: 'id-cards', driverClass: 'CardsViewType' }]);
    expect(query(f, '.view-type-dropdown-menu')).toBeNull();
  });
});
