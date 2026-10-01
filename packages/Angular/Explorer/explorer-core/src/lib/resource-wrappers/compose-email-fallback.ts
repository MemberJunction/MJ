import { UUIDsEqual } from '@memberjunction/global';
import type { LazyArtifactInfo } from '@memberjunction/ng-conversations';

/** The fields of a loaded conversation artifact the compose:email fallback reads. */
export type ComposeEmailDraftArtifact = Pick<LazyArtifactInfo, 'ArtifactId' | 'ArtifactVersionId' | 'ArtifactName'>;

/**
 * Which artifact, if any, the compose:email over-length fallback opens.
 *
 * - `stated`: the artifact the command names, found among the conversation's loaded artifacts.
 * - `most-recent`: the command names no artifact, so the conversation's latest one opens. For a
 *   single-artifact turn that IS the draft; the notice names it so the user can tell if it is not.
 * - `stated-not-loaded`: the command names an artifact that is not loaded. Nothing opens: a
 *   different artifact would be passed off as the draft.
 * - `none`: the command names no artifact and the conversation has none.
 */
export type ComposeEmailDraftTarget =
  | { Kind: 'stated'; Artifact: ComposeEmailDraftArtifact }
  | { Kind: 'most-recent'; Artifact: ComposeEmailDraftArtifact }
  | { Kind: 'stated-not-loaded' }
  | { Kind: 'none' };

/** What to tell the user, in the style MJNotificationService.CreateSimpleNotification takes. */
export interface ComposeEmailFallbackNotice {
  Message: string;
  Style: 'info' | 'warning';
}

/**
 * Resolve the artifact to open when a compose:email draft is too long for a mailto: URL.
 *
 * @param artifactLists the conversation's loaded artifacts, one list per message, oldest first
 *                      (the values of the chat area's ArtifactsByDetailId)
 * @param artifactId    the command's optional artifactId
 */
export function ResolveComposeEmailDraft(
  artifactLists: Iterable<readonly ComposeEmailDraftArtifact[]>,
  artifactId?: string
): ComposeEmailDraftTarget {
  const lists = Array.from(artifactLists);

  if (artifactId) {
    // UUIDsEqual, not ===: SQL Server returns UUIDs upper-case and PostgreSQL lower-case, so a
    // string comparison silently misses across providers.
    for (const artifacts of lists) {
      const match = artifacts.find((a) => UUIDsEqual(a.ArtifactId, artifactId));
      if (match) {
        return { Kind: 'stated', Artifact: match };
      }
    }
    return { Kind: 'stated-not-loaded' };
  }

  for (let i = lists.length - 1; i >= 0; i--) {
    const artifacts = lists[i];
    if (artifacts.length > 0) {
      return { Kind: 'most-recent', Artifact: artifacts[artifacts.length - 1] };
    }
  }
  return { Kind: 'none' };
}

/**
 * The one notification the compose:email over-length fallback shows.
 *
 * Without it the user clicks "Open draft in Mail", their mail client does not open, and their
 * clipboard has been overwritten, all without a word. The clipboard sentence appears only when
 * the copy actually happened.
 */
export function BuildComposeEmailFallbackNotice(
  target: ComposeEmailDraftTarget,
  copiedToClipboard: boolean
): ComposeEmailFallbackNotice {
  const lead = 'Draft too long for your mail client';
  const clipboard = copiedToClipboard ? ' The text is on your clipboard.' : '';
  switch (target.Kind) {
    case 'stated': {
      const name = quotedName(target.Artifact);
      return { Message: `${lead}, so ${name ?? 'the draft artifact'} opened instead.${clipboard}`, Style: 'info' };
    }
    case 'most-recent': {
      // Named because it is a guess: the user can see at once if the latest artifact is not the draft.
      const name = quotedName(target.Artifact);
      const opened = name ? `this conversation's latest artifact, ${name},` : `this conversation's latest artifact`;
      return { Message: `${lead}, so ${opened} opened instead.${clipboard}`, Style: 'info' };
    }
    case 'stated-not-loaded':
      return { Message: `${lead}, and its draft artifact is not loaded in this conversation.${clipboard}`, Style: 'warning' };
    case 'none':
      return { Message: `${lead}, and this conversation has no draft artifact to open.${clipboard}`, Style: 'warning' };
  }
}

/** The artifact's name in quotes, or null when it has none worth showing. */
function quotedName(artifact: ComposeEmailDraftArtifact): string | null {
  const name = artifact.ArtifactName?.trim();
  return name ? `"${name}"` : null;
}
