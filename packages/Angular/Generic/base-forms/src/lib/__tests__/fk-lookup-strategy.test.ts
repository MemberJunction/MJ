/**
 * Tests for the foreign-key lookup strategy seam: how a registration is resolved for a given
 * host entity / field / related entity, and the base class's own defaults.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
  FKLookupStrategy,
  ResolveFKLookupStrategy,
  type FKLookupContext,
  type FKLookupGroup,
  type FKLookupRow,
} from '../field/fk-lookup-strategy';

class FieldScopedStrategy extends FKLookupStrategy {
  public async Lookup(_context: FKLookupContext): Promise<FKLookupGroup[]> {
    return [{ Key: 'field', Label: null, Rows: [] }];
  }
}

class EntityScopedStrategy extends FKLookupStrategy {
  public async Lookup(_context: FKLookupContext): Promise<FKLookupGroup[]> {
    return [{ Key: 'entity', Label: null, Rows: [] }];
  }
}

/**
 * The ClassFactory is a process singleton, so register once for the whole file rather than per
 * test — repeated registration of the same key would keep auto-incrementing its priority.
 */
beforeAll(() => {
  MJGlobal.Instance.ClassFactory.Register(FKLookupStrategy, FieldScopedStrategy, 'Test Hosts.PartyID');
  MJGlobal.Instance.ClassFactory.Register(FKLookupStrategy, EntityScopedStrategy, 'Test Parties');
});

describe('ResolveFKLookupStrategy', () => {
  it('prefers a host-entity.field registration over a related-entity one', () => {
    const resolved = ResolveFKLookupStrategy('Test Hosts', 'PartyID', 'Test Parties');
    expect(resolved).toBeInstanceOf(FieldScopedStrategy);
  });

  it('falls back to the related-entity registration for a different host', () => {
    const resolved = ResolveFKLookupStrategy('Other Hosts', 'PartyID', 'Test Parties');
    expect(resolved).toBeInstanceOf(EntityScopedStrategy);
  });

  it('falls back to the related-entity registration for a different field on the same host', () => {
    const resolved = ResolveFKLookupStrategy('Test Hosts', 'OtherPartyID', 'Test Parties');
    expect(resolved).toBeInstanceOf(EntityScopedStrategy);
  });

  it('returns null when nothing is registered, so the caller uses its own default', () => {
    expect(ResolveFKLookupStrategy('Other Hosts', 'X', 'Nothing Registered')).toBeNull();
  });

  it('is case- and whitespace-insensitive on both keys', () => {
    const resolved = ResolveFKLookupStrategy('  test hosts ', 'PARTYID', 'test parties');
    expect(resolved).toBeInstanceOf(FieldScopedStrategy);
  });
});

describe('FKLookupStrategy defaults', () => {
  const context = { Query: '  Northwind Institute  ', NameField: 'Name' } as FKLookupContext;

  it('hides the scope toggle unless a subclass supplies labels', () => {
    expect(new FieldScopedStrategy().ScopeLabels(context)).toBeNull();
  });

  it('allows the pick unless a subclass vetoes it', async () => {
    expect(await new FieldScopedStrategy().BeforeSelect(context, {} as FKLookupRow)).toBe(true);
  });

  it('prefills the create form with the trimmed query', () => {
    expect(new FieldScopedStrategy().CreateDefaults(context)).toEqual({
      Name: 'Northwind Institute',
    });
  });

  it('prefills nothing when the user has typed nothing', () => {
    const empty = { Query: '   ', NameField: 'Name' } as FKLookupContext;
    expect(new FieldScopedStrategy().CreateDefaults(empty)).toEqual({});
  });
});
