import { describe, it, expect } from 'vitest';
import { FormatCollisionGuidance } from '../lib/collision-guidance';

const DIAGNOSIS = {
  Schema: '__mj',
  Table: 'CredentialType',
  RowID: '82dff26b-2abb-4a69-8718-1fe550b60816',
};

describe('FormatCollisionGuidance', () => {
  const lines = FormatCollisionGuidance(DIAGNOSIS, 'V202608080752__v6.1.x__Metadata_Sync.sql');
  const text = lines.join('\n');

  it('names the row that is in the way', () => {
    expect(text).toContain('__mj.CredentialType');
    expect(text).toContain('82dff26b-2abb-4a69-8718-1fe550b60816');
  });

  it('gives the exact repair command, ready to paste', () => {
    expect(text).toContain(
      'mj migrate repair --id 82dff26b-2abb-4a69-8718-1fe550b60816 --entity __mj.CredentialType',
    );
  });

  it('states the cause conditionally, because the recognizer cannot know it', () => {
    // The trigger is deliberately wider than Metadata_Sync, so this must not
    // assert a cause. See "Widen the trigger" in the spec.
    expect(text).toMatch(/if this row was (created|planted)/i);
    expect(text).not.toMatch(/this row was planted by/i);
  });

  it('names the migration that failed', () => {
    expect(text).toContain('V202608080752__v6.1.x__Metadata_Sync.sql');
  });
});
