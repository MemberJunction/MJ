import { RegisterClass } from '@memberjunction/global';
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

            const journal = await this.resolveGeneralJournal(journalCode, contextUser);
            if (!journal) {
                return {
                    Success: false,
                    ResultCode: 'ERROR',
                    Message: 'No general journal found in Business Central. Pass JournalCode or configure a GENERAL/DEFAULT journal without a balancing account.',
                    Params: params.Params
                };
            }

            let lastLine: BCJournalLineResult | undefined;
            for (let i = 0; i < lines.length; i++) {
                lastLine = await this.makeBCRequest<BCJournalLineResult>(
                    `journals(${journal.id})/journalLines`,
                    'POST',
                    this.mapToBCJournalLine(lines[i], i, postingDate, docNumber, description),
                    contextUser
                );
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

    private async resolveGeneralJournal(
        journalCode: string | undefined,
        contextUser: NonNullable<RunActionParams['ContextUser']>
    ): Promise<BCJournal | undefined> {
        const response = await this.makeBCRequest<{ value: BCJournal[] }>(
            'journals',
            'GET',
            undefined,
            contextUser
        );
        const journals = response?.value || [];
        if (journals.length === 0) {
            return undefined;
        }

        if (journalCode) {
            return journals.find(j => j.code === journalCode);
        }

        const unbalancing = journals.filter(j => !j.balancingAccountNumber);
        return unbalancing.find(j => {
            const code = (j.code || '').toUpperCase();
            return code === 'GENERAL' || code === 'DEFAULT';
        }) || unbalancing[0] || journals[0];
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
        if (line.accountNumber) {
            body.accountNumber = line.accountNumber;
        }
        if (line.accountId) {
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
