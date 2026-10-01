import { describe, expect, it } from 'vitest';
import {
  BuildComposeEmailFallbackNotice,
  ComposeEmailDraftArtifact,
  ResolveComposeEmailDraft,
} from './compose-email-fallback.js';

function artifact(id: string, name = `Artifact ${id}`): ComposeEmailDraftArtifact {
  return { ArtifactId: id, ArtifactVersionId: `${id}-v1`, ArtifactName: name };
}

describe('ResolveComposeEmailDraft', () => {
  const draft = artifact('AAAA-DRAFT', 'Renewal email');
  const report = artifact('BBBB-REPORT', 'Q3 report');

  it('opens the artifact the command names', () => {
    expect(ResolveComposeEmailDraft([[draft], [report]], 'AAAA-DRAFT')).toEqual({ Kind: 'stated', Artifact: draft });
  });

  it('matches the named artifact regardless of UUID case (SQL Server vs PostgreSQL)', () => {
    expect(ResolveComposeEmailDraft([[draft]], 'aaaa-draft')).toEqual({ Kind: 'stated', Artifact: draft });
  });

  it('opens nothing when the named artifact is not loaded, rather than a different artifact', () => {
    expect(ResolveComposeEmailDraft([[draft], [report]], 'CCCC-MISSING')).toEqual({ Kind: 'stated-not-loaded' });
  });

  it('opens the latest artifact when the command names none', () => {
    expect(ResolveComposeEmailDraft([[draft], [report], []], undefined)).toEqual({ Kind: 'most-recent', Artifact: report });
  });

  it('takes the last artifact of the latest message that has any', () => {
    const second = artifact('DDDD-SECOND');
    expect(ResolveComposeEmailDraft([[report], [draft, second]], undefined)).toEqual({ Kind: 'most-recent', Artifact: second });
  });

  it('reports nothing to open when the command names no artifact and there are none', () => {
    expect(ResolveComposeEmailDraft([[], []], undefined)).toEqual({ Kind: 'none' });
    expect(ResolveComposeEmailDraft([], undefined)).toEqual({ Kind: 'none' });
  });

  it('reads the chat area map values directly', () => {
    const map = new Map<string, ComposeEmailDraftArtifact[]>([['d1', [draft]]]);
    expect(ResolveComposeEmailDraft(map.values(), 'AAAA-DRAFT')).toEqual({ Kind: 'stated', Artifact: draft });
  });
});

describe('BuildComposeEmailFallbackNotice', () => {
  const draft = artifact('AAAA-DRAFT', 'Renewal email');

  it('names the opened draft and says the text is on the clipboard', () => {
    expect(BuildComposeEmailFallbackNotice({ Kind: 'stated', Artifact: draft }, true)).toEqual({
      Message: 'Draft too long for your mail client, so "Renewal email" opened instead. The text is on your clipboard.',
      Style: 'info',
    });
  });

  it('never claims a clipboard copy that did not happen', () => {
    const notice = BuildComposeEmailFallbackNotice({ Kind: 'stated', Artifact: draft }, false);
    expect(notice.Message).toBe('Draft too long for your mail client, so "Renewal email" opened instead.');
    expect(notice.Message).not.toContain('clipboard');
  });

  it('flags a most-recent artifact as a guess, by name', () => {
    expect(BuildComposeEmailFallbackNotice({ Kind: 'most-recent', Artifact: draft }, true).Message).toBe(
      'Draft too long for your mail client, so this conversation\'s latest artifact, "Renewal email", opened instead. The text is on your clipboard.'
    );
  });

  it('reads cleanly when the opened artifact has no name', () => {
    const unnamed = artifact('EEEE', '  ');
    expect(BuildComposeEmailFallbackNotice({ Kind: 'stated', Artifact: unnamed }, false).Message).toBe(
      'Draft too long for your mail client, so the draft artifact opened instead.'
    );
    expect(BuildComposeEmailFallbackNotice({ Kind: 'most-recent', Artifact: unnamed }, false).Message).toBe(
      "Draft too long for your mail client, so this conversation's latest artifact opened instead."
    );
  });

  it('warns when the named draft is not loaded', () => {
    expect(BuildComposeEmailFallbackNotice({ Kind: 'stated-not-loaded' }, true)).toEqual({
      Message: 'Draft too long for your mail client, and its draft artifact is not loaded in this conversation. The text is on your clipboard.',
      Style: 'warning',
    });
  });

  it('warns when there is no artifact to open, instead of doing nothing visible', () => {
    expect(BuildComposeEmailFallbackNotice({ Kind: 'none' }, false)).toEqual({
      Message: 'Draft too long for your mail client, and this conversation has no draft artifact to open.',
      Style: 'warning',
    });
  });
});
