import { describe, it, expect } from 'vitest';
import {
    FieldComparison,
    MergeConfig,
    MergeComparisonResult,
    MergeActionResult,
    MergeConfirmedEvent,
    FieldSelectionEvent
} from '../lib/record-merge-types';

describe('Record Merge Types', () => {
    describe('FieldComparison', () => {
        it('should represent a matching field', () => {
            const field: FieldComparison = {
                FieldName: 'FirstName',
                DisplayLabel: 'First Name',
                LeftValue: 'John',
                RightValue: 'John',
                HasConflict: false,
                SelectedSide: 'left',
                IsReadOnly: false,
                DataType: 'string'
            };

            expect(field.HasConflict).toBe(false);
            expect(field.LeftValue).toBe(field.RightValue);
        });

        it('should represent a conflicting field', () => {
            const field: FieldComparison = {
                FieldName: 'Email',
                DisplayLabel: 'Email',
                LeftValue: 'john@a.com',
                RightValue: 'john@b.com',
                HasConflict: true,
                SelectedSide: 'left',
                IsReadOnly: false,
                DataType: 'string'
            };

            expect(field.HasConflict).toBe(true);
            expect(field.LeftValue).not.toBe(field.RightValue);
        });

        it('should support read-only fields', () => {
            const field: FieldComparison = {
                FieldName: 'ID',
                DisplayLabel: 'ID',
                LeftValue: 'abc-123',
                RightValue: 'def-456',
                HasConflict: true,
                SelectedSide: 'left',
                IsReadOnly: true,
                DataType: 'string'
            };

            expect(field.IsReadOnly).toBe(true);
        });

        it('should support custom value selection', () => {
            const field: FieldComparison = {
                FieldName: 'Phone',
                DisplayLabel: 'Phone',
                LeftValue: '555-0100',
                RightValue: '555-0200',
                HasConflict: true,
                SelectedSide: 'custom',
                CustomValue: '555-0150',
                IsReadOnly: false,
                DataType: 'string'
            };

            expect(field.SelectedSide).toBe('custom');
            expect(field.CustomValue).toBe('555-0150');
        });
    });

    describe('MergeConfig', () => {
        it('should define merge parameters', () => {
            const config: MergeConfig = {
                EntityName: 'Contacts',
                LeftRecordID: 'rec-1',
                RightRecordID: 'rec-2',
                SurvivorSide: 'left',
                LeftLabel: 'Record A',
                RightLabel: 'Record B'
            };

            expect(config.SurvivorSide).toBe('left');
            expect(config.EntityName).toBe('Contacts');
        });
    });

    describe('MergeComparisonResult', () => {
        it('should separate conflict and matching fields', () => {
            const result: MergeComparisonResult = {
                Fields: [],
                ConflictFields: [
                    createField('Email', true),
                    createField('Phone', true)
                ],
                MatchingFields: [
                    createField('FirstName', false),
                    createField('LastName', false),
                    createField('City', false)
                ],
                TotalFieldCount: 5,
                ConflictCount: 2
            };

            expect(result.ConflictCount).toBe(2);
            expect(result.MatchingFields).toHaveLength(3);
            expect(result.TotalFieldCount).toBe(5);
        });
    });

    describe('MergeActionResult', () => {
        it('should represent successful merge', () => {
            const result: MergeActionResult = {
                Success: true,
                SurvivorRecordID: 'rec-1',
                MergedRecordID: 'rec-2',
                UpdatedFieldCount: 3
            };

            expect(result.Success).toBe(true);
            expect(result.UpdatedFieldCount).toBe(3);
        });

        it('should represent failed merge', () => {
            const result: MergeActionResult = {
                Success: false,
                SurvivorRecordID: 'rec-1',
                MergedRecordID: 'rec-2',
                UpdatedFieldCount: 0,
                ErrorMessage: 'Record locked by another user'
            };

            expect(result.Success).toBe(false);
            expect(result.ErrorMessage).toBeDefined();
        });
    });
});

function createField(name: string, hasConflict: boolean): FieldComparison {
    return {
        FieldName: name,
        DisplayLabel: name,
        LeftValue: `left-${name}`,
        RightValue: hasConflict ? `right-${name}` : `left-${name}`,
        HasConflict: hasConflict,
        SelectedSide: 'left',
        IsReadOnly: false,
        DataType: 'string'
    };
}
