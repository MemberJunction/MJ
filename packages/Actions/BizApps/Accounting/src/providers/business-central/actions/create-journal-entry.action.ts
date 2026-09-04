import { RegisterClass } from '@memberjunction/global';
import { LogError } from '@memberjunction/core';
import { BusinessCentralBaseAction } from '../business-central-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../../../constants';
import { JournalEntryLine } from '../../../types';
import { journalEntryBalanceError, parseAndValidateJournalEntryLines, totalDebits } from '../../../journal-entry';

interface BCJournal {
    id: string;
    code?: string;
    displayName?: string;
    balancingAccountNumber?: string | null;
}

interface BCJournalLineResult {
    id?: string;
    documentNumber?: string;
}

/**
 * Posts a balanced journal entry to Business Central (v2.0 OData).
 * Lines go to journals({id})/journalLines, then Microsoft.NAV.post posts the batch.
 */
@RegisterClass(BaseAction, erpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, ERP_INTEGRATION.BusinessCentral))
export class CreateBusinessCentralJournalEntryAction extends BusinessCentralBaseAction {

    public get Description(): string {
        return 'Creates a balanced journal entry in Microsoft Dynamics 365 Business Central and posts the batch';
    }

    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'Context user is required for Business Central API calls',
                    Params: params.Params
                };
            }

            this.params = params.Params;

            const entryDateRaw = this.getParamValue(params.Params, 'EntryDate');
            const entryDate = entryDateRaw ? new Date(entryDateRaw) : new Date();
            const postingDate = this.formatBCDate(entryDate);
            const docNumber = this.getParamValue(params.Params, 'DocNumber');
            const description = this.getParamValue(params.Params, 'PrivateNote')
                || this.getParamValue(params.Params, 'Description');
            const journalCode = this.getParamValue(params.Params, 'JournalCode');
            const lines = parseAndValidateJournalEntryLines(this.getParamValue(params.Params, 'Lines'));

            if (!this.validateJournalEntryBalance(lines)) {
                return journalEntryBalanceError(params.Params);
            }

            const resolved = await this.resolveGeneralJournal(journalCode, contextUser);
            if (!resolved.journal) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: resolved.error ?? 'No general journal found in Business Central.',
                    Params: params.Params
                };
            }
            const journal = resolved.journal;

            const createdLineIds: string[] = [];
            try {
                let lastLine: BCJournalLineResult | undefined;
                for (let i = 0; i < lines.length; i++) {
                    lastLine = await this.makeBCRequest<BCJournalLineResult>(
                        `journals(${journal.id})/journalLines`,
                        'POST',
                        this.mapToBCJournalLine(lines[i], i, postingDate, docNumber, description),
                        contextUser
                    );
                    if (lastLine?.id) {
                        createdLineIds.push(lastLine.id);
                    }
                }

                await this.makeBCRequest(
                    `journals(${journal.id})/Microsoft.NAV.post`,
                    'POST',
                    undefined,
                    contextUser
                );

                const outputDoc = docNumber || lastLine?.documentNumber || '';
                const outputParams: ActionParam[] = [
                    { Name: 'JournalEntryID', Value: journal.id, Type: 'Output' },
                    { Name: 'DocNumber', Value: outputDoc, Type: 'Output' },
                    { Name: 'TotalAmount', Value: totalDebits(lines), Type: 'Output' }
                ];

                return {
                    Success: true,
                    ResultCode: 'SUCCESS',
                    Params: [...params.Params, ...outputParams],
                    Message: `Journal entry ${outputDoc || journal.id} posted successfully`
                };
            } catch (postError) {
                await this.deleteCreatedJournalLines(createdLineIds, contextUser);
                throw postError;
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'ERROR',
                Message: errorMessage,
                Params: params.Params
            };
        }
    }

    /**
     * Compensating delete: a failed mid-batch POST leaves lines in the BC journal,
     * and the next Microsoft.NAV.post would send those orphans to the GL.
     */
    private async deleteCreatedJournalLines(
        lineIds: string[],
        contextUser: NonNullable<RunActionParams['ContextUser']>
    ): Promise<void> {
        for (const lineId of lineIds) {
            try {
                await this.makeBCRequest(`journalLines(${lineId})`, 'DELETE', undefined, contextUser);
            } catch (cleanupError) {
                const msg = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
                LogError(`CreateBusinessCentralJournalEntry: failed to delete orphan journalLines(${lineId}): ${msg}`);
            }
        }
    }

    private async resolveGeneralJournal(
        journalCode: string | undefined,
        contextUser: NonNullable<RunActionParams['ContextUser']>
    ): Promise<{ journal?: BCJournal; error?: string }> {
        const response = await this.makeBCRequest<{ value: BCJournal[] }>(
            'journals',
            'GET',
            undefined,
            contextUser
        );
        const journals = response?.value || [];
        if (journals.length === 0) {
            return { error: 'This Business Central company has no journals.' };
        }

        if (journalCode) {
            const match = journals.find(j => j.code === journalCode);
            if (!match) {
                return { error: `JournalCode '${journalCode}' does not exist in Business Central.` };
            }
            if (match.balancingAccountNumber) {
                return {
                    error: `Journal '${journalCode}' has a balancing account; posting a self-balanced multi-line entry would add an extra line. Use a journal without a balancing account.`
                };
            }
            return { journal: match };
        }

        const unbalancing = journals.filter(j => !j.balancingAccountNumber);
        const preferred = unbalancing.find(j => {
            const code = (j.code || '').toUpperCase();
            return code === 'GENERAL' || code === 'DEFAULT';
        }) || unbalancing[0];
        if (!preferred) {
            return {
                error: 'No general journal without a balancing account found. Pass JournalCode for an unbalanced journal, or configure a GENERAL/DEFAULT journal without a balancing account.'
            };
        }
        return { journal: preferred };
    }

    private mapToBCJournalLine(
        line: JournalEntryLine,
        index: number,
        postingDate: string,
        documentNumber: string | undefined,
        batchDescription: string | undefined
    ): Record<string, unknown> {
        const amount = line.debit != null ? line.debit : -(line.credit || 0);
        const body: Record<string, unknown> = {
            lineNumber: (index + 1) * 10000,
            accountType: 'G/L Account',
            postingDate,
            amount,
            description: line.description || batchDescription || ''
        };
        if (documentNumber) {
            body.documentNumber = documentNumber;
        }
        // AM-4: accountNumber wins. Sending both lets a stale accountId override the number.
        if (line.accountNumber) {
            body.accountNumber = line.accountNumber;
        } else if (line.accountId) {
            body.accountId = line.accountId;
        }
        return body;
    }

    public get Params(): ActionParam[] {
        return [
            ...this.getCommonAccountingParams(),
            { Name: 'Lines', Type: 'Input', Value: null },
            { Name: 'EntryDate', Type: 'Input', Value: null },
            { Name: 'DocNumber', Type: 'Input', Value: null },
            { Name: 'PrivateNote', Type: 'Input', Value: null },
            { Name: 'JournalCode', Type: 'Input', Value: null }
        ];
    }
}
