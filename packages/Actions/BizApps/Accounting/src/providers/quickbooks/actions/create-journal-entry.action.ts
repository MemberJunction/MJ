import { RegisterClass } from '@memberjunction/global';
import { QuickBooksBaseAction } from '../quickbooks-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../../../constants';
import { JournalEntryLine } from '../../../types';
import { journalEntryBalanceError, parseAndValidateJournalEntryLines, totalDebits } from '../../../journal-entry';

export type { JournalEntryLine } from '../../../types';

/**
 * Action to create a journal entry in QuickBooks Online
 */
@RegisterClass(BaseAction, erpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, ERP_INTEGRATION.QuickBooksOnline))
@RegisterClass(BaseAction, 'CreateQuickBooksJournalEntryAction')
export class CreateQuickBooksJournalEntryAction extends QuickBooksBaseAction {
    
    /**
     * Description of the action
     */
    public get Description(): string {
        return 'Creates a journal entry in QuickBooks Online with automatic validation';
    }

    /**
     * Main execution method
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const contextUser = params.ContextUser;
            if (!contextUser) {
                throw new Error('Context user is required for QuickBooks API calls');
            }

            // Store params for use in other methods
            (this as any)._params = params.Params;

            // Get parameter values
            const entryDate = this.getParamValue(params.Params, 'EntryDate') || new Date();
            const docNumber = this.getParamValue(params.Params, 'DocNumber');
            const privateNote = this.getParamValue(params.Params, 'PrivateNote');
            const linesData = this.getParamValue(params.Params, 'Lines');
            const adjustmentEntry = this.getParamValue(params.Params, 'AdjustmentEntry') || false;

            const lines = parseAndValidateJournalEntryLines(linesData);
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].accountId) {
                    throw new Error(`Line ${i + 1}: accountId is required for QuickBooks Online`);
                }
            }

            if (!this.validateJournalEntryBalance(lines)) {
                return journalEntryBalanceError(params.Params);
            }

            // Build the journal entry object for QuickBooks
            const journalEntry = {
                DocNumber: docNumber,
                TxnDate: this.formatQBODate(entryDate instanceof Date ? entryDate : new Date(entryDate)),
                PrivateNote: privateNote,
                Adjustment: adjustmentEntry,
                Line: lines.map((line) => this.mapToQBOJournalLine(line))
            };

            // Create the journal entry in QuickBooks
            const response = await this.makeQBORequest<{ JournalEntry: any }>(
                'journalentry',
                'POST',
                journalEntry,
                contextUser
            );

            const createdEntry = response.JournalEntry;

            // Set output parameters
            const outputParams: ActionParam[] = [
                {
                    Name: 'JournalEntryID',
                    Value: createdEntry.Id,
                    Type: 'Output'
                },
                {
                    Name: 'DocNumber',
                    Value: createdEntry.DocNumber,
                    Type: 'Output'
                },
                {
                    Name: 'TotalAmount',
                    Value: createdEntry.TotalAmt ?? totalDebits(lines),
                    Type: 'Output'
                },
                {
                    Name: 'CreatedDate',
                    Value: createdEntry.MetaData.CreateTime,
                    Type: 'Output'
                }
            ];

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Params: [...params.Params, ...outputParams],
                Message: `Journal entry ${createdEntry.DocNumber} created successfully`
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

    /**
     * Map journal entry line to QuickBooks format
     */
    private mapToQBOJournalLine(line: JournalEntryLine): any {
        const classId = line.classId
            || line.dimensions?.find(d => d.code === 'Class')?.valueCode;
        const departmentId = line.departmentId
            || line.dimensions?.find(d => d.code === 'Department')?.valueCode;

        const qbLine: any = {
            DetailType: 'JournalEntryLineDetail',
            Amount: line.debit || line.credit || 0,
            JournalEntryLineDetail: {
                PostingType: line.debit ? 'Debit' : 'Credit',
                AccountRef: {
                    value: line.accountId
                }
            }
        };

        if (line.description) {
            qbLine.Description = line.description;
        }

        if (line.entityType && line.entityId) {
            qbLine.JournalEntryLineDetail.Entity = {
                Type: line.entityType,
                EntityRef: {
                    value: line.entityId
                }
            };
        }

        if (classId) {
            qbLine.JournalEntryLineDetail.ClassRef = {
                value: classId
            };
        }

        if (departmentId) {
            qbLine.JournalEntryLineDetail.DepartmentRef = {
                value: departmentId
            };
        }

        return qbLine;
    }

}
