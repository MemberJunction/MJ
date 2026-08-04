import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { renderComponentFixture, query, queryAll, text, capture } from '@memberjunction/ng-test-utils';
import { MapViewComponent } from './map-view.component';
import { MapRenderMode } from './map-view.types';

/**
 * DOM tests for the MapViewComponent toolbar / info surface.
 *
 * The Leaflet map engine is initialized lazily via an IntersectionObserver that only
 * fires when the container becomes visible (with real dimensions). Under jsdom the
 * observer never reports an intersection, so `engine` stays null, `IsLoading` stays
 * true, and no Leaflet/`L`-global code runs. That makes the toolbar (mode buttons,
 * `[class.active]`, marker count, truncation indicator, loading state) the component's
 * fully media-free, deterministically testable surface.
 *
 * The actual map rendering (markers, tiles, clustering) requires real DOM dimensions
 * and the global Leaflet runtime — that is live-tested, never faked here (see
 * guides/ANGULAR_TESTING_GUIDE.md §7).
 */

// Minimal EntityInfo-shaped stub: the template + getters only read `.Fields`.
interface FieldLike {
  Name: string;
  ExtendedType?: string;
}
function makeEntity(fields: FieldLike[]): unknown {
  return { Fields: fields };
}

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(MapViewComponent, {
    imports: [CommonModule, SharedGenericModule],
    declarations: [MapViewComponent],
    inputs,
  });
}

describe('MapViewComponent (DOM)', () => {
  describe('mode buttons', () => {
    it('always renders Points, Regions, and Heat Map buttons', () => {
      const fixture = render({ Entity: makeEntity([]) });
      const labels = queryAll(fixture, '.mj-map-mode-btn').map((b) => b.textContent?.trim());
      expect(labels).toEqual(['Points', 'Regions', 'Heat Map']);
    });

    it('hides the Boundary button when the entity has no boundary field', () => {
      const fixture = render({ Entity: makeEntity([{ Name: 'Name' }]) });
      const labels = queryAll(fixture, '.mj-map-mode-btn').map((b) => b.textContent?.trim());
      expect(labels).not.toContain('Boundary');
    });

    it('shows the Boundary button when the entity has a BoundaryGeoJSON field', () => {
      const fixture = render({ Entity: makeEntity([{ Name: 'BoundaryGeoJSON' }]) });
      const labels = queryAll(fixture, '.mj-map-mode-btn').map((b) => b.textContent?.trim());
      expect(labels).toContain('Boundary');
    });

    it('honors a custom BoundaryField name for the Boundary button gate', () => {
      const fixture = render({
        Entity: makeEntity([{ Name: 'CustomShape' }]),
        BoundaryField: 'CustomShape',
      });
      const labels = queryAll(fixture, '.mj-map-mode-btn').map((b) => b.textContent?.trim());
      expect(labels).toContain('Boundary');
    });
  });

  describe('active state', () => {
    it('marks the Points button active when RenderMode is point', () => {
      const fixture = render({ Entity: makeEntity([]), RenderMode: 'point' as MapRenderMode });
      const buttons = queryAll(fixture, '.mj-map-mode-btn');
      const points = buttons.find((b) => b.textContent?.includes('Points'))!;
      const heatmap = buttons.find((b) => b.textContent?.includes('Heat Map'))!;
      expect(points.classList.contains('active')).toBe(true);
      expect(heatmap.classList.contains('active')).toBe(false);
    });

    it('marks the Heat Map button active when RenderMode is heatmap', () => {
      const fixture = render({ Entity: makeEntity([]), RenderMode: 'heatmap' as MapRenderMode });
      const buttons = queryAll(fixture, '.mj-map-mode-btn');
      const heatmap = buttons.find((b) => b.textContent?.includes('Heat Map'))!;
      expect(heatmap.classList.contains('active')).toBe(true);
    });
  });

  describe('mode switching via click', () => {
    it('emits RenderModeChange and updates the active class when a mode button is clicked', () => {
      const fixture = render({ Entity: makeEntity([]), RenderMode: 'point' as MapRenderMode });
      const emitted = capture(fixture.componentInstance.RenderModeChange);

      const heatmapBtn = queryAll(fixture, '.mj-map-mode-btn').find((b) => b.textContent?.includes('Heat Map'))!;
      (heatmapBtn as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(emitted).toEqual(['heatmap']);
      expect(heatmapBtn.classList.contains('active')).toBe(true);
      const pointsBtn = queryAll(fixture, '.mj-map-mode-btn').find((b) => b.textContent?.includes('Points'))!;
      expect(pointsBtn.classList.contains('active')).toBe(false);
    });
  });

  describe('ngOnInit boundary fallback', () => {
    it('snaps a saved boundary mode back to point and emits when no boundary field exists', () => {
      // capture must be wired before the first detectChanges (ngOnInit) — use setup.
      const captured: MapRenderMode[] = [];
      const fixture = renderComponentFixture(MapViewComponent, {
        imports: [CommonModule, SharedGenericModule],
        declarations: [MapViewComponent],
        inputs: { Entity: makeEntity([]), RenderMode: 'boundary' as MapRenderMode },
        setup: (instance) => {
          instance.RenderModeChange.subscribe((m) => captured.push(m));
        },
      });
      fixture.detectChanges();
      expect(captured).toEqual(['point']);
      expect(fixture.componentInstance.RenderMode).toBe('point');
    });
  });

  describe('marker count info', () => {
    it('renders the singular "location" form when one marker is mapped', () => {
      // Set the non-input state in `setup` (before the single detectChanges) to stay NG0100-safe.
      const fixture = renderComponentFixture(MapViewComponent, {
        imports: [CommonModule, SharedGenericModule],
        declarations: [MapViewComponent],
        inputs: { Entity: makeEntity([]) },
        setup: (instance) => {
          instance.MarkerCount = 1;
        },
      });
      expect(text(fixture, '.mj-map-info')).toContain('1 location mapped');
    });

    it('renders the plural "locations" form for a non-one count', () => {
      const fixture = renderComponentFixture(MapViewComponent, {
        imports: [CommonModule, SharedGenericModule],
        declarations: [MapViewComponent],
        inputs: { Entity: makeEntity([]) },
        setup: (instance) => {
          instance.MarkerCount = 3;
        },
      });
      expect(text(fixture, '.mj-map-info')).toContain('3 locations mapped');
    });
  });

  describe('truncation indicator', () => {
    it('is hidden when all records are displayed', () => {
      const fixture = render({
        Entity: makeEntity([]),
        Records: [{ ID: '1' }, { ID: '2' }],
        TotalRecordCount: 2,
      });
      expect(query(fixture, '.mj-map-truncated')).toBeNull();
    });

    it('shows the truncation text when more records exist than are loaded', () => {
      const fixture = render({
        Entity: makeEntity([]),
        Records: [{ ID: '1' }, { ID: '2' }],
        TotalRecordCount: 10,
      });
      const truncated = query(fixture, '.mj-map-truncated');
      expect(truncated).not.toBeNull();
      expect(truncated!.textContent).toContain('Showing 2 of 10');
    });
  });

  describe('loading state', () => {
    it('shows the loading indicator while the map engine has not initialized', () => {
      const fixture = render({ Entity: makeEntity([]) });
      // jsdom never fires the IntersectionObserver, so IsLoading stays true.
      expect(fixture.componentInstance.IsLoading).toBe(true);
      expect(query(fixture, '.mj-map-loading mj-loading')).not.toBeNull();
    });

    it('hides the loading indicator once IsLoading is false', () => {
      // Set IsLoading in `setup` (before the single detectChanges) to stay NG0100-safe.
      const fixture = renderComponentFixture(MapViewComponent, {
        imports: [CommonModule, SharedGenericModule],
        declarations: [MapViewComponent],
        inputs: { Entity: makeEntity([]) },
        setup: (instance) => {
          instance.IsLoading = false;
        },
      });
      expect(query(fixture, '.mj-map-loading')).toBeNull();
    });
  });
});
