// @vitest-environment jsdom
import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConnectionsComponent } from '../Integration/components/connections/connections.component';
import { EntityMapRow } from '../Integration/services/integration-data.service';

/**
 * The entity-map list and the field-mapping editor are two branches of one template block,
 * so opening or closing the editor removes the focused element. Focus moves to the editor's
 * back button on open, and to the open button of the same map on close.
 */

function entityMap(id: string, externalObject: string, entity: string): EntityMapRow {
  return {
    ID: id,
    CompanyIntegrationID: 'ci-1',
    ExternalObjectName: externalObject.toLowerCase(),
    ExternalObjectLabel: externalObject,
    EntityID: `entity-${id}`,
    SyncDirection: 'Pull',
    SyncEnabled: true,
    MatchStrategy: null,
    ConflictResolution: 'SourceWins',
    Priority: 1,
    DeleteBehavior: 'DoNothing',
    Status: 'Active',
    Entity: entity,
  };
}

const CONTACTS = entityMap('map-1', 'Contact', 'Members');
const ACCOUNTS = entityMap('map-2', 'Account', 'Organizations');

/**
 * Builds the component on a host element. `detectChanges` re-renders the host the way the
 * template does: the editor when a map is open, otherwise one open button per listed map.
 */
function createConnections(listedMaps: EntityMapRow[]): { connections: ConnectionsComponent; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const connections = Object.create(ConnectionsComponent.prototype) as ConnectionsComponent;
  connections.EditorEntityMap = null;
  const render = (): void => {
    host.innerHTML = connections.EditorEntityMap
      ? '<app-visual-field-editor><button class="ve-back-btn"></button></app-visual-field-editor>'
      : listedMaps
          .map(m => `<div class="detail-map-row"><button data-entity-map-id="${m.ID}"></button></div>`)
          .join('');
  };
  (connections as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn(render) };
  (connections as unknown as Record<string, unknown>)['elementRef'] = { nativeElement: host };
  render();
  return { connections, host };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ConnectionsComponent — field-mapping editor focus', () => {
  it('moves focus to the editor back button when a map opens', () => {
    const { connections, host } = createConnections([CONTACTS, ACCOUNTS]);
    connections.OnEntityMapClick(ACCOUNTS);
    expect(document.activeElement).toBe(host.querySelector('app-visual-field-editor .ve-back-btn'));
  });

  it('returns focus to the open button of the map that was open', () => {
    const { connections, host } = createConnections([CONTACTS, ACCOUNTS]);
    connections.OnEntityMapClick(ACCOUNTS);
    connections.CloseEntityMapEditor();
    expect(document.activeElement).toBe(host.querySelector('[data-entity-map-id="map-2"]'));
  });

  it('closes without error when the open map is no longer listed', () => {
    const { connections } = createConnections([CONTACTS]);
    connections.OnEntityMapClick(ACCOUNTS);
    expect(() => connections.CloseEntityMapEditor()).not.toThrow();
    expect(connections.EditorEntityMap).toBeNull();
  });
});
