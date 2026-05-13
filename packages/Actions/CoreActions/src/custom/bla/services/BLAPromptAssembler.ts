import { LogError, UserInfo, BaseEntity } from '@memberjunction/core';
import { SQLServerDataProvider } from '@memberjunction/sqlserver-dataprovider';
import {
    BLAAssembleParams,
    BLAAssembleResult,
    BLAChatMessage,
    BLAMessageRole,
    BLAPromptComponentRow,
} from './types';

/**
 * Assembles a multi-role ChatMessage[] for a BLA-managed AIPrompt by picking
 * the most specific matching betty.PromptComponent rows for the (PromptID,
 * Organization, Instance) tuple.
 *
 * Selection cascade per `Name` within the requested PromptID:
 *   (PromptID + OrgID + InstanceID matched)  >  (PromptID + OrgID matched, Instance NULL)  >  (PromptID matched, Org NULL, Instance NULL)
 *
 * Specificity score: (InstanceID matched ? 4 : 0) + (OrgID matched ? 2 : 0) + 1.
 * Ties at the same tier are broken by stable ORDER BY ID — Sort is reserved
 * for FINAL assembly ordering, not for picking winners.
 *
 * Output layout:
 *   conversationMessages = [...caller-supplied history, ...all winners in Sort ASC]
 *   data.BettyPrompt     = concatenation of System-role winner texts in Sort order,
 *                          purely for the seed Template's audit/log artifact.
 */
export class BLAPromptAssembler {
    public async Assemble(params: BLAAssembleParams, contextUser?: UserInfo): Promise<BLAAssembleResult> {
        const winners = await this.selectWinningComponents(params, contextUser);

        const systemTextParts: string[] = [];
        const componentMessages: BLAChatMessage[] = [];

        for (const row of winners) {
            const role = this.toMessageRole(row.Role);
            if (role === 'system') {
                systemTextParts.push(row.Text);
            }
            componentMessages.push({ role, content: row.Text });
        }

        const assembledMessages: BLAChatMessage[] = [
            ...this.sanitizeHistory(params.ConversationHistory),
            ...componentMessages,
        ];

        return {
            AssembledSystemText: systemTextParts.join('\n\n'),
            AssembledMessages: assembledMessages,
            SelectedComponentCount: winners.length,
        };
    }

    /**
     * Runs the specificity-cascade SELECT against betty.PromptComponent and
     * returns the winning rows already in final-assembly order.
     */
    private async selectWinningComponents(
        params: BLAAssembleParams,
        contextUser?: UserInfo,
    ): Promise<BLAPromptComponentRow[]> {
        const provider = BaseEntity.Provider as unknown as SQLServerDataProvider;
        if (!provider || typeof provider.ExecuteSQL !== 'function') {
            throw new Error('BLAPromptAssembler requires a SQLServerDataProvider — Metadata.Provider is not initialized or is the wrong provider.');
        }

        const orgID = params.OrganizationID ?? null;
        const instanceID = params.InstanceID ?? null;

        // Specificity scoring:
        //   InstanceID hit  → +4
        //   OrganizationID hit → +2
        //   Always (PromptID is enforced in WHERE) → +1
        // ROW_NUMBER() OVER (PARTITION BY Name ORDER BY score DESC, ID ASC) = 1
        // picks the most-specific row per Name, with stable ORDER BY ID as the
        // tie-breaker when two rows share the same tier (shouldn't happen
        // in practice; specified by the BLA design).
        const sql = `
            WITH Candidates AS (
                SELECT
                    pc.ID,
                    pc.PromptID,
                    pc.Name,
                    pc.Description,
                    pc.[Text],
                    pc.Sort,
                    pc.[Role],
                    pc.OrganizationID,
                    pc.InstanceID,
                    (
                        CASE WHEN pc.InstanceID IS NOT NULL AND pc.InstanceID = @InstanceID THEN 4 ELSE 0 END
                      + CASE WHEN pc.OrganizationID IS NOT NULL AND pc.OrganizationID = @OrgID THEN 2 ELSE 0 END
                      + 1
                    ) AS SpecificityScore
                FROM betty.PromptComponent pc
                WHERE pc.PromptID = @PromptID
                  AND (pc.OrganizationID IS NULL OR pc.OrganizationID = @OrgID)
                  AND (pc.InstanceID    IS NULL OR pc.InstanceID    = @InstanceID)
            ),
            Ranked AS (
                SELECT
                    c.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY c.Name
                        ORDER BY c.SpecificityScore DESC, c.ID ASC
                    ) AS RowRank
                FROM Candidates c
            )
            SELECT
                ID, PromptID, Name, Description, [Text], Sort, [Role],
                OrganizationID, InstanceID
            FROM Ranked
            WHERE RowRank = 1
            ORDER BY Sort ASC, Name ASC;
        `;

        const sqlParams = {
            PromptID: params.PromptID,
            OrgID: orgID,
            InstanceID: instanceID,
        };

        try {
            const rows = await provider.ExecuteSQL(
                sql,
                sqlParams,
                { description: 'BLA assemble — specificity-cascade prompt-component select', ignoreLogging: false, isMutation: false },
                contextUser,
            );
            return (rows ?? []) as BLAPromptComponentRow[];
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            LogError(`BLAPromptAssembler: selectWinningComponents failed for PromptID=${params.PromptID}: ${msg}`);
            throw e;
        }
    }

    /**
     * Normalize the conversation history input so downstream consumers can
     * trust the shape. Filters out malformed entries silently rather than
     * failing the whole run — a stray bad entry in history shouldn't kill
     * the prompt assembly.
     */
    private sanitizeHistory(history: BLAChatMessage[]): BLAChatMessage[] {
        if (!Array.isArray(history)) return [];
        const cleaned: BLAChatMessage[] = [];
        for (const m of history) {
            if (!m || typeof m !== 'object') continue;
            const role = this.coerceRole(m.role);
            if (!role) continue;
            const content = typeof m.content === 'string' ? m.content : '';
            cleaned.push({ role, content });
        }
        return cleaned;
    }

    /** Map DB-shape 'System'|'User'|'Assistant' to ChatMessage lowercase roles. */
    private toMessageRole(role: 'System' | 'User' | 'Assistant'): BLAMessageRole {
        switch (role) {
            case 'System':    return 'system';
            case 'User':      return 'user';
            case 'Assistant': return 'assistant';
        }
    }

    private coerceRole(raw: unknown): BLAMessageRole | null {
        if (typeof raw !== 'string') return null;
        const lower = raw.toLowerCase();
        if (lower === 'system' || lower === 'user' || lower === 'assistant') {
            return lower;
        }
        return null;
    }
}
