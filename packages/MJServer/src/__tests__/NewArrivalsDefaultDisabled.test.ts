/**
 * everything.txt is explicit about what a schema refresh does with objects it has just found:
 * "we create entity maps for all objects that are determined as things that should be now added
 * but arent, we enable nothing (because the user needs to, after the refresh, then go turn them
 * on)". These pin that contract at the only place it is expressed - the argument defaults.
 *
 * They defaulted TRUE for a period on the claim that a disabled new object never reached a
 * migration. That claim was wrong: `CreateDisabled` governs only the entity/field MAP status,
 * new IntegrationObject rows are written Active unconditionally, and phase 4 evolves over
 * `continuingMaps + newObjects` regardless of the flag. The table is created either way; the
 * flag decides only whether the object starts SYNCING unasked.
 *
 * Read from source rather than by invoking the resolver: the default lives in a type-graphql
 * decorator, and a test that booted the schema to read it back would be testing type-graphql.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(__dirname, '..', 'resolvers', 'IntegrationDiscoveryResolver.ts'),
  'utf-8',
);

function argDefault(name: string): string | null {
  const m = SRC.match(new RegExp(`@Arg\\("${name}",\\s*\\{\\s*defaultValue:\\s*(true|false)`));
  return m ? m[1] : null;
}

describe('new arrivals default to disabled', () => {
  it('autoEnableNewObjects defaults false', () => {
    expect(argDefault('autoEnableNewObjects')).toBe('false');
  });

  it('autoEnableNewColumns defaults false', () => {
    expect(argDefault('autoEnableNewColumns')).toBe('false');
  });

  it('the description does not promise auto-adoption', () => {
    const line = SRC.split('\n').find(l => l.includes('@Arg("autoEnableNewObjects"'));
    expect(line).toBeDefined();
    expect(line!).toMatch(/DISABLED/);
    expect(line!).not.toMatch(/created ENABLED/);
  });

  it('CreateDisabled is still what carries the decision to the post-restart consumer', () => {
    // If this coupling is ever renamed, the defaults above stop meaning anything.
    expect(SRC).toMatch(/CreateDisabled:\s*!autoEnableNewObjects/);
  });
});
