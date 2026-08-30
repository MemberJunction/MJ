/** Ports the semantics of Sonar's factorCompiler auto-path tests onto the moved module. */
import { describe, expect, it } from 'vitest';
import { FkGraphEntity, findAutoPathHops } from '../join-path';

const E = (ID: string, Name: string, fields: Array<[string, string | null]>): FkGraphEntity => ({
  ID,
  Name,
  Fields: fields.map(([Name, RelatedEntityID]) => ({ Name, RelatedEntityID })),
});

// Members <- Orders <- OrderLines; Members <- Logins
const GRAPH: FkGraphEntity[] = [
  E('members', 'Members', []),
  E('orders', 'Orders', [['MemberID', 'members']]),
  E('orderlines', 'Order Lines', [['OrderID', 'orders']]),
  E('logins', 'Logins', [['MemberID', 'members']]),
];

describe('findAutoPathHops', () => {
  it('resolves a single hop to an empty hop list (anchor-adjacent FK is the callers)', () => {
    expect(findAutoPathHops(GRAPH, 'members', 'orders')).toEqual([]);
  });

  it('resolves a two-hop chain to the leaf-side hop only, leaf-to-anchor order', () => {
    expect(findAutoPathHops(GRAPH, 'members', 'orderlines')).toEqual([{ fks: ['OrderID'] }]);
  });

  it('bundles a composite FK into ONE hop (no false fork)', () => {
    const graph = [
      E('members', 'Members', []),
      E('mid', 'Mid', [['MemberID', 'members']]),
      E('leaf', 'Leaf', [
        ['MidA', 'mid'],
        ['MidB', 'mid'],
      ]),
    ];
    expect(findAutoPathHops(graph, 'members', 'leaf')).toEqual([{ fks: ['MidA', 'MidB'] }]);
  });

  it('fails loud on an unreachable leaf', () => {
    const island = [...GRAPH, E('island', 'Island', [])];
    expect(() => findAutoPathHops(island, 'members', 'island')).toThrow(/no foreign-key path/);
  });

  it('fails loud beyond maxDepth', () => {
    const chain = [E('a', 'A', []), E('b', 'B', [['A', 'a']]), E('c', 'C', [['B', 'b']]), E('d', 'D', [['C', 'c']])];
    expect(() => findAutoPathHops(chain, 'a', 'd', 2)).toThrow(/no foreign-key path/);
  });

  it('fails loud on two equally-short paths (ambiguity is never guessed through)', () => {
    const diamond = [
      E('anchor', 'Anchor', []),
      E('left', 'Left', [['AnchorID', 'anchor']]),
      E('right', 'Right', [['AnchorID', 'anchor']]),
      E('leaf', 'Leaf', [
        ['LeftID', 'left'],
        ['RightID', 'right'],
      ]),
    ];
    expect(() => findAutoPathHops(diamond, 'anchor', 'leaf')).toThrow(/multiple foreign-key paths/);
  });
});
