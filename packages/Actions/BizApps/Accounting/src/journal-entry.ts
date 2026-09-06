import { ActionParam, ActionResultSimple } from '@memberjunction/actions-base';
import { JournalEntryLine } from './types';

/**
 * Parse the Lines param and enforce the provider-agnostic journal rules:
 * array of ≥ 2 lines, each with accountId or accountNumber, exactly one of
 * debit/credit, non-negative amounts. Throws with the historical QBO messages
 * so existing callers keep ResultCode ERROR for structural problems.
 */
export function parseAndValidateJournalEntryLines(linesParam: unknown): JournalEntryLine[] {
    if (!linesParam) {
        throw new Error('Lines parameter is required');
    }

    let lines: JournalEntryLine[];

    if (typeof linesParam === 'string') {
        try {
            lines = JSON.parse(linesParam);
        } catch {
            throw new Error('Invalid JSON format for Lines parameter');
        }
    } else {
        lines = linesParam as JournalEntryLine[];
    }

    if (!Array.isArray(lines)) {
        throw new Error('Lines must be an array');
    }

    if (lines.length < 2) {
        throw new Error('Journal entry must have at least 2 lines');
    }

    lines.forEach((line, index) => {
        const hasAccountId = line.accountId != null && String(line.accountId).trim() !== '';
        const hasAccountNumber = line.accountNumber != null && String(line.accountNumber).trim() !== '';
        if (!hasAccountId && !hasAccountNumber) {
            throw new Error(`Line ${index + 1}: accountId or accountNumber is required`);
        }

        if (line.debit === undefined && line.credit === undefined) {
            throw new Error(`Line ${index + 1}: either debit or credit amount is required`);
        }

        if (line.debit !== undefined && line.credit !== undefined) {
            throw new Error(`Line ${index + 1}: cannot have both debit and credit on the same line`);
        }

        if (line.debit !== undefined && line.debit < 0) {
            throw new Error(`Line ${index + 1}: debit amount cannot be negative`);
        }

        if (line.credit !== undefined && line.credit < 0) {
            throw new Error(`Line ${index + 1}: credit amount cannot be negative`);
        }
    });

    return lines;
}

export function journalEntryBalanceError(params: ActionParam[]): ActionResultSimple {
    return {
        Success: false,
        ResultCode: 'VALIDATION_ERROR',
        Message: 'Journal entry is not balanced. Total debits must equal total credits.',
        Params: params,
    };
}

export function totalDebits(lines: JournalEntryLine[]): number {
    return lines.reduce((sum, line) => sum + (line.debit || 0), 0);
}
