/**
 * @fileoverview {@link ArtifactLinkTriggerProvider} — `[[` autocomplete provider for MJ Docs,
 * implementing `@memberjunction/ng-composer`'s {@link ComposerTriggerProvider} contract.
 *
 * Searches `MJ: Artifacts` as the current user (`request.ContextUser`), so server-side artifact
 * read hooks ensure only documents the caller can open are ever offered.
 */

import { ConversationUtility } from '@memberjunction/ai-core-plus';
import { LogError, RunView } from '@memberjunction/core';
import { type MJArtifactEntity } from '@memberjunction/core-entities';
import { EscapeSQLString, UUIDsEqual } from '@memberjunction/global';
import {
  ComposerTriggerProvider,
  type ComposerSuggestionRequest,
  type MentionSuggestion,
} from '@memberjunction/ng-composer';

const ARTIFACTS_ENTITY = 'MJ: Artifacts';

type ArtifactSuggestionRow = Pick<MJArtifactEntity, 'ID' | 'Name' | 'Description' | 'Type'>;

/** Escapes SQL LIKE wildcards (`\`, `%`, `_`) and single quotes for `ESCAPE '\'` predicates. */
function escapeLikeLiteral(value: string): string {
  const escapedWildcards = value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  return EscapeSQLString(escapedWildcards);
}

/**
 * `[[` trigger provider that searches artifacts readable by the current user and formats
 * selected items as durable `@{"_mode":"mention","type":"record",...}` tokens.
 */
export class ArtifactLinkTriggerProvider extends ComposerTriggerProvider {
  public override readonly TriggerChar: string = '[[';
  public override readonly Key: string = 'artifact-links';

  /** Optional ID of the document currently being edited, excluded from suggestions. */
  public ExcludeArtifactID: string | null = null;

  public override async GetSuggestions(request: ComposerSuggestionRequest): Promise<MentionSuggestion[]> {
    // Fail closed: never query artifacts without an authenticated current user and metadata provider.
    if (!request.Provider || !request.ContextUser) {
      return [];
    }

    try {
      const trimmed = (request.Query ?? '').trim();
      const filters: string[] = [];
      if (trimmed.length > 0) {
        const escaped = escapeLikeLiteral(trimmed.toLowerCase());
        filters.push(`LOWER([Name]) LIKE '%${escaped}%' ESCAPE '\\'`);
      }
      if (this.ExcludeArtifactID) {
        filters.push(`[ID] <> '${EscapeSQLString(this.ExcludeArtifactID)}'`);
      }

      const rv = RunView.FromMetadataProvider(request.Provider);
      const result = await rv.RunView<ArtifactSuggestionRow>(
        {
          EntityName: ARTIFACTS_ENTITY,
          Fields: ['ID', 'Name', 'Description', 'Type'],
          ExtraFilter: filters.join(' AND '),
          OrderBy: '[Name] ASC',
          MaxRows: Math.max(1, request.MaxResults),
          ResultType: 'simple',
        },
        request.ContextUser,
      );

      if (!result.Success) {
        LogError(`ArtifactLinkTriggerProvider: artifact search failed: ${result.ErrorMessage}`);
        return [];
      }

      return (result.Results ?? [])
        .filter((row) => !this.ExcludeArtifactID || !UUIDsEqual(row.ID, this.ExcludeArtifactID))
        .map((row) => ({
          type: 'record',
          id: row.ID,
          name: row.Name,
          displayName: row.Name,
          description: row.Type || undefined,
          icon: 'fa-solid fa-file-lines',
          data: {
            entityName: ARTIFACTS_ENTITY,
            primaryKey: { ID: row.ID },
          },
        }));
    } catch (error: unknown) {
      LogError(`ArtifactLinkTriggerProvider: error searching artifacts: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /** Formats a chosen suggestion into a durable record-mention token via {@link ConversationUtility.CreateRecordLink}. */
  public static FormatSelectionToken(suggestion: MentionSuggestion): string {
    const data = suggestion.data ?? {};
    const entityName = typeof data['entityName'] === 'string' && data['entityName'].trim()
      ? data['entityName'].trim()
      : ARTIFACTS_ENTITY;
    const rawPk = data['primaryKey'];
    const primaryKey: Record<string, string | number> =
      rawPk && typeof rawPk === 'object' && !Array.isArray(rawPk)
        ? (rawPk as Record<string, string | number>)
        : { ID: suggestion.id };
    return ConversationUtility.CreateRecordLink(entityName, suggestion.name, primaryKey);
  }
}
