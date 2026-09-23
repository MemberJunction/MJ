import { describe, it, expect } from 'vitest';
import {
    ClassifyAndResolveUniqueKey,
    DetectIntraPlanCollisions,
    PlannedRecordNode,
} from '../UniqueKeyClassifier';

describe('UniqueKeyClassifier', () => {
    describe('ClassifyAndResolveUniqueKey', () => {
        it('classifies server-allocated fields as ServerAllocated and resolved via Reset', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'Orders',
                KeyDef: { Fields: ['OrderNumber'], Scope: 'Global' },
                ServerAllocatedFields: ['OrderNumber'],
            });

            expect(result.Classification).toBe('ServerAllocated');
            expect(result.IsResolved).toBe(true);
            expect(result.ActionRequired).toBe('Reset');
            expect(result.Blocked).toBe(false);
        });

        it('classifies parent-scoped uniques as ParentScoped', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'ActionParam',
                KeyDef: {
                    Fields: ['ActionID', 'Name'],
                    Scope: 'Parent',
                    ScopeField: 'ActionID',
                },
            });

            expect(result.Classification).toBe('ParentScoped');
            expect(result.IsResolved).toBe(true);
            expect(result.ActionRequired).toBe('VerifyParent');
            expect(result.Blocked).toBe(false);
        });

        it('resolves live-state unique when reset rule is present', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'FormVersion',
                KeyDef: { Fields: ['IsPublished'], Scope: 'LiveState', ScopeField: 'IsPublished' },
                ResetFields: { IsPublished: false },
            });

            expect(result.Classification).toBe('LiveState');
            expect(result.IsResolved).toBe(true);
            expect(result.Blocked).toBe(false);
        });

        it('blocks live-state unique when reset rule is missing', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'FormVersion',
                KeyDef: { Fields: ['IsPublished'], Scope: 'LiveState', ScopeField: 'IsPublished' },
                ResetFields: {},
            });

            expect(result.Classification).toBe('LiveState');
            expect(result.IsResolved).toBe(false);
            expect(result.Blocked).toBe(true);
            expect(result.Warning?.Code).toBe('ROW_DISABLED');
        });

        it('classifies global string unique as GlobalString with Rename resolution', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'Applications',
                KeyDef: { Fields: ['Name'], Scope: 'Global' },
                IsStringField: () => true,
            });

            expect(result.Classification).toBe('GlobalString');
            expect(result.IsResolved).toBe(true);
            expect(result.ActionRequired).toBe('Rename');
            expect(result.Blocked).toBe(false);
        });

        it('resolves global non-string unique when PromptFor is provided', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'Users',
                KeyDef: { Fields: ['Email'], Scope: 'Global' },
                IsStringField: () => false,
                PromptForFields: ['Email'],
            });

            expect(result.Classification).toBe('GlobalNonString');
            expect(result.IsResolved).toBe(true);
            expect(result.ActionRequired).toBe('Prompt');
            expect(result.Blocked).toBe(false);
        });

        it('blocks global non-string unique when no prompt or reset rule exists', () => {
            const result = ClassifyAndResolveUniqueKey({
                EntityName: 'Users',
                KeyDef: { Fields: ['Email'], Scope: 'Global' },
                IsStringField: () => false,
                PromptForFields: [],
                PromptedValues: {},
                ResetFields: {},
            });

            expect(result.Classification).toBe('GlobalNonString');
            expect(result.IsResolved).toBe(false);
            expect(result.Blocked).toBe(true);
            expect(result.Warning?.Code).toBe('UNIQUE_PROMPT_REQUIRED');
        });
    });

    describe('DetectIntraPlanCollisions', () => {
        it('detects collisions among siblings under the same parent', () => {
            const nodes: PlannedRecordNode[] = [
                {
                    NodeKey: 'Param::1',
                    EntityName: 'ActionParam',
                    ParentKey: 'Action::100',
                    Values: { Name: 'InputParam', ParamType: 'string' },
                },
                {
                    NodeKey: 'Param::2',
                    EntityName: 'ActionParam',
                    ParentKey: 'Action::100',
                    Values: { Name: 'InputParam', ParamType: 'number' },
                },
                {
                    NodeKey: 'Param::3',
                    EntityName: 'ActionParam',
                    ParentKey: 'Action::200', // Different parent!
                    Values: { Name: 'InputParam', ParamType: 'string' },
                },
            ];

            const collisions = DetectIntraPlanCollisions(nodes, {
                ActionParam: [
                    {
                        Fields: ['Name'],
                        Scope: 'Parent',
                        ScopeField: 'ActionID',
                    },
                ],
            });

            expect(collisions).toHaveLength(1);
            expect(collisions[0].NodeKeyA).toBe('Param::1');
            expect(collisions[0].NodeKeyB).toBe('Param::2');
        });

        it('returns empty array when there are no collisions', () => {
            const nodes: PlannedRecordNode[] = [
                {
                    NodeKey: 'Param::1',
                    EntityName: 'ActionParam',
                    ParentKey: 'Action::100',
                    Values: { Name: 'ParamA' },
                },
                {
                    NodeKey: 'Param::2',
                    EntityName: 'ActionParam',
                    ParentKey: 'Action::100',
                    Values: { Name: 'ParamB' },
                },
            ];

            const collisions = DetectIntraPlanCollisions(nodes, {
                ActionParam: [
                    {
                        Fields: ['Name'],
                        Scope: 'Parent',
                    },
                ],
            });

            expect(collisions).toHaveLength(0);
        });
    });
});
