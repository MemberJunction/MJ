import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Unit tests for `resolveUniqueEntityName` — picking an entity name that is actually free.
 *
 * These exist because the failure mode is silent in the only place anyone looks. Entity names
 * are generated from the table name with trailing discriminators stripped, so distinct tables
 * routinely generate the SAME name. The old logic appended the schema suffix once and assumed
 * the result was unique; when it wasn't, the INSERT died on UQ_Entity_Name and the entity was
 * simply never created. CodeGen carried on and reported nothing but a repeated identical error,
 * so a tenant ends up short several entities with no indication which, or why.
 */

/** Runs the REAL method without constructing the 6000-line class. */
function subject(): ManageMetadataBase {
  return Object.create(ManageMetadataBase.prototype) as ManageMetadataBase;
}

describe('resolveUniqueEntityName', () => {
  beforeEach(() => {
    // The in-run list is static and leaks between tests otherwise.
    ManageMetadataBase.newEntityList.length = 0;
  });

  it('leaves a free name alone and reports no suffix', () => {
    expect(subject().resolveUniqueEntityName('Invoices', 'netsuite', ['Accounts'])).toEqual({
      name: 'Invoices',
      suffix: ''
    });
  });

  it('falls back to the schema suffix when the name is taken', () => {
    expect(subject().resolveUniqueEntityName('Invoices', 'netsuite', ['Invoices'])).toEqual({
      name: 'Invoices__netsuite',
      suffix: '__netsuite'
    });
  });

  it('keeps going when the schema-suffixed name is ALSO taken — the NetSuite failure', () => {
    // customlist72 took "Custom Lists"; customlist74 took "Custom Lists__netsuite".
    // customlist160 used to produce "Custom Lists__netsuite" a second time and die on
    // UQ_Entity_Name. Six more tables behind it were never created at all.
    const taken = ['Custom Lists', 'Custom Lists__netsuite'];
    expect(subject().resolveUniqueEntityName('Custom Lists', 'netsuite', taken)).toEqual({
      name: 'Custom Lists__netsuite_2',
      suffix: '__netsuite_2'
    });
  });

  it('walks the counter as far as it needs to', () => {
    const taken = ['Custom Lists', 'Custom Lists__netsuite', 'Custom Lists__netsuite_2', 'Custom Lists__netsuite_3'];
    expect(subject().resolveUniqueEntityName('Custom Lists', 'netsuite', taken).name).toBe(
      'Custom Lists__netsuite_4'
    );
  });

  it('treats a name claimed earlier in THIS run as taken', () => {
    // Names created during the run are not in metadata yet; only this list knows about them.
    ManageMetadataBase.newEntityList.push('Custom Lists');
    expect(subject().resolveUniqueEntityName('Custom Lists', 'netsuite', []).name).toBe(
      'Custom Lists__netsuite'
    );
  });

  it('compares case-insensitively, the way UQ_Entity_Name does', () => {
    // The in-run check used an exact `===` while the metadata check beside it lowercased, so a
    // name differing only in case read as free here and then collided on INSERT.
    ManageMetadataBase.newEntityList.push('custom lists');
    expect(subject().resolveUniqueEntityName('Custom Lists', 'netsuite', []).name).toBe(
      'Custom Lists__netsuite'
    );
    expect(subject().resolveUniqueEntityName('Invoices', 'netsuite', ['INVOICES']).name).toBe(
      'Invoices__netsuite'
    );
  });

  it('gives up rather than looping forever', () => {
    // A schema where everything generates one name is a naming problem no suffix can fix.
    // Better a loud INSERT failure than a hang.
    const taken = ['X', 'X__s', ...Array.from({ length: 1200 }, (_, i) => `X__s_${i + 2}`)];
    const out = subject().resolveUniqueEntityName('X', 's', taken);
    expect(out.name.startsWith('X__s')).toBe(true);
  });

  it('resolves every colliding NetSuite table to a distinct name', () => {
    // The six real customlist tables, applied in sequence the way CodeGen does.
    const s = subject();
    const taken: string[] = [];
    const names = ['customlist72', 'customlist74', 'customlist160', 'customlist436', 'customlist534', 'customlist873'].map(
      () => {
        const r = s.resolveUniqueEntityName('Custom Lists', 'netsuite', [...taken]);
        taken.push(r.name);
        return r.name;
      }
    );
    expect(new Set(names).size).toBe(6);
    expect(names[0]).toBe('Custom Lists');
    expect(names[1]).toBe('Custom Lists__netsuite');
    expect(names[2]).toBe('Custom Lists__netsuite_2');
  });
});
