/**
 * Unit tests for ScratchpadManager.
 *
 * Tests cover:
 * - Notes management (set, get, overwrite)
 * - Task upsert (add new, update existing, skip invalid)
 * - Task removal
 * - Composite ApplyScratchpadChanges (notes + tasks in one call)
 * - Task limit enforcement (pruning completed tasks)
 * - Serialization (ToJSON, ToPromptString, GetTaskSummary)
 * - State queries (HasContent, GetTasksByStatus, GetTaskCounts)
 * - Clear / reset
 * - Edge cases (null input, empty arrays, missing fields)
 *
 * @since 2.46.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ScratchpadManager } from '../ScratchpadManager';
import { AgentTask, AgentScratchpad } from '@memberjunction/ai-core-plus';

describe('ScratchpadManager', () => {
    let manager: ScratchpadManager;

    beforeEach(() => {
        manager = new ScratchpadManager();
    });

    // ─── Notes Management ─────────────────────────────────────────────

    describe('Notes Management', () => {
        it('should start with empty notes', () => {
            expect(manager.GetNotes()).toBe('');
        });

        it('should set and get notes', () => {
            manager.SetNotes('Hello world');
            expect(manager.GetNotes()).toBe('Hello world');
        });

        it('should overwrite existing notes', () => {
            manager.SetNotes('First');
            manager.SetNotes('Second');
            expect(manager.GetNotes()).toBe('Second');
        });

        it('should handle null input by setting empty string', () => {
            manager.SetNotes('Something');
            manager.SetNotes(null as unknown as string);
            expect(manager.GetNotes()).toBe('');
        });

        it('should handle undefined input by setting empty string', () => {
            manager.SetNotes('Something');
            manager.SetNotes(undefined as unknown as string);
            expect(manager.GetNotes()).toBe('');
        });

        it('should preserve multiline notes', () => {
            const multiline = 'Line 1\nLine 2\nLine 3';
            manager.SetNotes(multiline);
            expect(manager.GetNotes()).toBe(multiline);
        });
    });

    // ─── Task Upsert ────────────────────────────────────────────────

    describe('UpsertTasks', () => {
        it('should add new tasks', () => {
            const tasks: AgentTask[] = [
                { id: 't1', title: 'Task One', status: 'pending' },
                { id: 't2', title: 'Task Two', status: 'in_progress' }
            ];
            manager.UpsertTasks(tasks);
            expect(manager.GetTasks()).toHaveLength(2);
            expect(manager.GetTasks()[0].id).toBe('t1');
            expect(manager.GetTasks()[1].id).toBe('t2');
        });

        it('should update existing tasks by id', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Original', status: 'pending' }]);
            manager.UpsertTasks([{ id: 't1', title: 'Updated', status: 'completed' }]);

            const tasks = manager.GetTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Updated');
            expect(tasks[0].status).toBe('completed');
        });

        it('should skip tasks with missing id', () => {
            manager.UpsertTasks([
                { id: '', title: 'No ID', status: 'pending' },
                { id: 't1', title: 'Valid', status: 'pending' }
            ]);
            expect(manager.GetTasks()).toHaveLength(1);
            expect(manager.GetTasks()[0].id).toBe('t1');
        });

        it('should skip tasks with missing title', () => {
            manager.UpsertTasks([
                { id: 't1', title: '', status: 'pending' },
                { id: 't2', title: 'Valid', status: 'pending' }
            ]);
            expect(manager.GetTasks()).toHaveLength(1);
            expect(manager.GetTasks()[0].id).toBe('t2');
        });

        it('should skip tasks with missing status', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'No Status', status: '' as AgentTask['status'] },
                { id: 't2', title: 'Valid', status: 'pending' }
            ]);
            expect(manager.GetTasks()).toHaveLength(1);
        });

        it('should handle null input gracefully', () => {
            manager.UpsertTasks(null as unknown as AgentTask[]);
            expect(manager.GetTasks()).toHaveLength(0);
        });

        it('should handle empty array', () => {
            manager.UpsertTasks([]);
            expect(manager.GetTasks()).toHaveLength(0);
        });

        it('should preserve task notes on upsert', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending', notes: 'Important note' }]);
            expect(manager.GetTasks()[0].notes).toBe('Important note');
        });

        it('should return a new array from GetTasks (array-level copy)', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending' }]);
            const tasks1 = manager.GetTasks();
            const tasks2 = manager.GetTasks();
            expect(tasks1).not.toBe(tasks2); // different array references
            expect(tasks1).toEqual(tasks2);  // same content
        });

        it('should store defensive copies on upsert', () => {
            const task: AgentTask = { id: 't1', title: 'Original', status: 'pending' };
            manager.UpsertTasks([task]);
            task.title = 'Mutated after insert';
            expect(manager.GetTasks()[0].title).toBe('Original');
        });
    });

    // ─── Task Removal ───────────────────────────────────────────────

    describe('RemoveTasks', () => {
        beforeEach(() => {
            manager.UpsertTasks([
                { id: 't1', title: 'One', status: 'completed' },
                { id: 't2', title: 'Two', status: 'pending' },
                { id: 't3', title: 'Three', status: 'in_progress' }
            ]);
        });

        it('should remove tasks by id', () => {
            manager.RemoveTasks(['t2']);
            const tasks = manager.GetTasks();
            expect(tasks).toHaveLength(2);
            expect(tasks.map(t => t.id)).toEqual(['t1', 't3']);
        });

        it('should remove multiple tasks', () => {
            manager.RemoveTasks(['t1', 't3']);
            expect(manager.GetTasks()).toHaveLength(1);
            expect(manager.GetTasks()[0].id).toBe('t2');
        });

        it('should handle non-existent ids gracefully', () => {
            manager.RemoveTasks(['t999']);
            expect(manager.GetTasks()).toHaveLength(3);
        });

        it('should handle null input', () => {
            manager.RemoveTasks(null as unknown as string[]);
            expect(manager.GetTasks()).toHaveLength(3);
        });

        it('should handle empty array', () => {
            manager.RemoveTasks([]);
            expect(manager.GetTasks()).toHaveLength(3);
        });
    });

    // ─── ApplyScratchpadChanges ─────────────────────────────────────

    describe('ApplyScratchpadChanges', () => {
        it('should apply notes only', () => {
            manager.ApplyScratchpadChanges({ notes: 'New notes' });
            expect(manager.GetNotes()).toBe('New notes');
            expect(manager.GetTasks()).toHaveLength(0);
        });

        it('should apply task upsert only', () => {
            manager.ApplyScratchpadChanges({
                taskList: {
                    upsert: [{ id: 't1', title: 'Task', status: 'pending' }]
                }
            });
            expect(manager.GetNotes()).toBe('');
            expect(manager.GetTasks()).toHaveLength(1);
        });

        it('should apply notes and tasks together', () => {
            manager.ApplyScratchpadChanges({
                notes: 'Working on analysis',
                taskList: {
                    upsert: [
                        { id: 't1', title: 'Analyze', status: 'in_progress' },
                        { id: 't2', title: 'Report', status: 'pending' }
                    ]
                }
            });
            expect(manager.GetNotes()).toBe('Working on analysis');
            expect(manager.GetTasks()).toHaveLength(2);
        });

        it('should process removes before upserts', () => {
            // Pre-populate with t1
            manager.UpsertTasks([{ id: 't1', title: 'Old', status: 'completed' }]);

            // Remove t1, then upsert a new t1
            manager.ApplyScratchpadChanges({
                taskList: {
                    remove: ['t1'],
                    upsert: [{ id: 't1', title: 'Reborn', status: 'pending' }]
                }
            });

            const tasks = manager.GetTasks();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('Reborn');
            expect(tasks[0].status).toBe('pending');
        });

        it('should handle null scratchpad gracefully', () => {
            manager.SetNotes('Keep me');
            manager.ApplyScratchpadChanges(null as unknown as AgentScratchpad);
            expect(manager.GetNotes()).toBe('Keep me');
        });

        it('should not change notes if notes is undefined', () => {
            manager.SetNotes('Existing notes');
            manager.ApplyScratchpadChanges({ taskList: { upsert: [{ id: 't1', title: 'X', status: 'pending' }] } });
            expect(manager.GetNotes()).toBe('Existing notes');
        });

        it('should clear notes if notes is empty string', () => {
            manager.SetNotes('Existing notes');
            manager.ApplyScratchpadChanges({ notes: '' });
            expect(manager.GetNotes()).toBe('');
        });
    });

    // ─── EnforceTaskLimit ──────────────────────────────────────────

    describe('EnforceTaskLimit', () => {
        beforeEach(() => {
            manager.UpsertTasks([
                { id: 't1', title: 'Done old', status: 'completed' },
                { id: 't2', title: 'Done newer', status: 'completed' },
                { id: 't3', title: 'Active', status: 'in_progress' },
                { id: 't4', title: 'Waiting', status: 'pending' },
                { id: 't5', title: 'Blocked', status: 'blocked' }
            ]);
        });

        it('should not prune when under limit', () => {
            const pruned = manager.EnforceTaskLimit(10);
            expect(pruned).toBe(0);
            expect(manager.GetTasks()).toHaveLength(5);
        });

        it('should not prune when at exactly the limit', () => {
            const pruned = manager.EnforceTaskLimit(5);
            expect(pruned).toBe(0);
            expect(manager.GetTasks()).toHaveLength(5);
        });

        it('should prune oldest completed tasks first', () => {
            const pruned = manager.EnforceTaskLimit(4);
            expect(pruned).toBe(1);
            const tasks = manager.GetTasks();
            expect(tasks).toHaveLength(4);
            // t1 (oldest completed) should be removed
            expect(tasks.find(t => t.id === 't1')).toBeUndefined();
            expect(tasks.find(t => t.id === 't2')).toBeDefined();
        });

        it('should prune multiple completed tasks', () => {
            const pruned = manager.EnforceTaskLimit(3);
            expect(pruned).toBe(2);
            const tasks = manager.GetTasks();
            expect(tasks).toHaveLength(3);
            expect(tasks.map(t => t.id)).toEqual(['t3', 't4', 't5']);
        });

        it('should only prune completed tasks, not active ones', () => {
            // Only 2 completed, but need to drop 3 to reach limit of 2
            const pruned = manager.EnforceTaskLimit(2);
            // Can only prune 2 completed, so 3 remain (still over limit)
            expect(pruned).toBe(2);
            expect(manager.GetTasks()).toHaveLength(3);
        });

        it('should return 0 for invalid limit', () => {
            expect(manager.EnforceTaskLimit(0)).toBe(0);
            expect(manager.EnforceTaskLimit(-1)).toBe(0);
        });
    });

    // ─── Serialization ──────────────────────────────────────────────

    describe('ToJSON', () => {
        it('should return empty snapshot when no content', () => {
            const snapshot = manager.ToJSON();
            expect(snapshot.notes).toBe('');
            expect(snapshot.tasks).toEqual([]);
        });

        it('should include notes and tasks', () => {
            manager.SetNotes('My notes');
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending', notes: 'Detail' }]);

            const snapshot = manager.ToJSON();
            expect(snapshot.notes).toBe('My notes');
            expect(snapshot.tasks).toHaveLength(1);
            expect(snapshot.tasks[0]).toEqual({ id: 't1', title: 'Task', status: 'pending', notes: 'Detail' });
        });

        it('should return defensive copies of tasks', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending' }]);
            const snapshot = manager.ToJSON();
            snapshot.tasks[0].title = 'Mutated';
            expect(manager.GetTasks()[0].title).toBe('Task');
        });
    });

    describe('ToPromptString', () => {
        it('should show placeholder text when empty', () => {
            const prompt = manager.ToPromptString();
            expect(prompt).toContain('_(no notes yet)_');
            expect(prompt).toContain('_(no tasks yet)_');
        });

        it('should include notes when set', () => {
            manager.SetNotes('Analysis in progress');
            const prompt = manager.ToPromptString();
            expect(prompt).toContain('Analysis in progress');
            expect(prompt).not.toContain('_(no notes yet)_');
        });

        it('should format tasks with status icons', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'Done item', status: 'completed' },
                { id: 't2', title: 'Active item', status: 'in_progress' },
                { id: 't3', title: 'Waiting item', status: 'pending' },
                { id: 't4', title: 'Stuck item', status: 'blocked' }
            ]);
            const prompt = manager.ToPromptString();
            expect(prompt).toContain('**t1**');
            expect(prompt).toContain('Done item');
            expect(prompt).toContain('### Task List');
        });

        it('should include task notes with dash separator', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending', notes: 'Some detail' }]);
            const prompt = manager.ToPromptString();
            expect(prompt).toContain('— Some detail');
        });
    });

    describe('GetTaskSummary', () => {
        it('should return "No tasks" when empty', () => {
            expect(manager.GetTaskSummary()).toBe('No tasks');
        });

        it('should report completion progress', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'completed' },
                { id: 't2', title: 'B', status: 'completed' },
                { id: 't3', title: 'C', status: 'pending' }
            ]);
            expect(manager.GetTaskSummary()).toBe('2 of 3 tasks complete');
        });

        it('should include in_progress count', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'completed' },
                { id: 't2', title: 'B', status: 'in_progress' },
                { id: 't3', title: 'C', status: 'pending' }
            ]);
            expect(manager.GetTaskSummary()).toBe('1 of 3 tasks complete, 1 in progress');
        });

        it('should include blocked count', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'pending' },
                { id: 't2', title: 'B', status: 'blocked' }
            ]);
            expect(manager.GetTaskSummary()).toBe('0 of 2 tasks complete, 1 blocked');
        });

        it('should include both in_progress and blocked', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'in_progress' },
                { id: 't2', title: 'B', status: 'blocked' },
                { id: 't3', title: 'C', status: 'completed' },
                { id: 't4', title: 'D', status: 'pending' }
            ]);
            expect(manager.GetTaskSummary()).toBe('1 of 4 tasks complete, 1 in progress, 1 blocked');
        });
    });

    // ─── State Queries ──────────────────────────────────────────────

    describe('HasContent', () => {
        it('should return false when empty', () => {
            expect(manager.HasContent()).toBe(false);
        });

        it('should return true when notes exist', () => {
            manager.SetNotes('Something');
            expect(manager.HasContent()).toBe(true);
        });

        it('should return true when tasks exist', () => {
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending' }]);
            expect(manager.HasContent()).toBe(true);
        });

        it('should return false after clearing notes', () => {
            manager.SetNotes('Something');
            manager.SetNotes('');
            expect(manager.HasContent()).toBe(false);
        });
    });

    describe('GetTasksByStatus', () => {
        beforeEach(() => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'completed' },
                { id: 't2', title: 'B', status: 'pending' },
                { id: 't3', title: 'C', status: 'in_progress' },
                { id: 't4', title: 'D', status: 'completed' }
            ]);
        });

        it('should return tasks matching status', () => {
            const completed = manager.GetTasksByStatus('completed');
            expect(completed).toHaveLength(2);
            expect(completed.map(t => t.id)).toEqual(['t1', 't4']);
        });

        it('should return empty array for status with no matches', () => {
            expect(manager.GetTasksByStatus('blocked')).toHaveLength(0);
        });
    });

    describe('GetTaskCounts', () => {
        it('should return all zeros when empty', () => {
            const counts = manager.GetTaskCounts();
            expect(counts).toEqual({ pending: 0, in_progress: 0, completed: 0, blocked: 0 });
        });

        it('should count tasks by status', () => {
            manager.UpsertTasks([
                { id: 't1', title: 'A', status: 'completed' },
                { id: 't2', title: 'B', status: 'pending' },
                { id: 't3', title: 'C', status: 'in_progress' },
                { id: 't4', title: 'D', status: 'completed' },
                { id: 't5', title: 'E', status: 'blocked' }
            ]);
            expect(manager.GetTaskCounts()).toEqual({
                pending: 1,
                in_progress: 1,
                completed: 2,
                blocked: 1
            });
        });
    });

    // ─── Clear ──────────────────────────────────────────────────────

    describe('Clear', () => {
        it('should reset notes and tasks', () => {
            manager.SetNotes('Notes');
            manager.UpsertTasks([{ id: 't1', title: 'Task', status: 'pending' }]);
            expect(manager.HasContent()).toBe(true);

            manager.Clear();
            expect(manager.GetNotes()).toBe('');
            expect(manager.GetTasks()).toHaveLength(0);
            expect(manager.HasContent()).toBe(false);
        });
    });

    // ─── Multi-Turn Workflow Simulation ──────────────────────────────

    describe('Multi-Turn Workflow', () => {
        it('should simulate a realistic agent workflow', () => {
            // Turn 1: Agent creates initial plan
            manager.ApplyScratchpadChanges({
                notes: 'User wants Q4 sales analysis. Three data sources available.',
                taskList: {
                    upsert: [
                        { id: 't1', title: 'Fetch sales data from DB', status: 'in_progress' },
                        { id: 't2', title: 'Fetch marketing spend data', status: 'pending' },
                        { id: 't3', title: 'Generate comparison report', status: 'pending' }
                    ]
                }
            });
            expect(manager.GetTasks()).toHaveLength(3);
            expect(manager.GetTaskSummary()).toBe('0 of 3 tasks complete, 1 in progress');

            const snapshot1 = manager.ToJSON();
            expect(snapshot1.notes).toContain('Q4 sales');

            // Turn 2: Agent completes t1, starts t2, adds a new task
            manager.ApplyScratchpadChanges({
                notes: 'Sales data loaded: 15,000 records. Found Q3 data too for comparison.',
                taskList: {
                    upsert: [
                        { id: 't1', title: 'Fetch sales data from DB', status: 'completed', notes: '15k records loaded' },
                        { id: 't2', title: 'Fetch marketing spend data', status: 'in_progress' },
                        { id: 't4', title: 'Add Q3 comparison to report', status: 'pending' }
                    ]
                }
            });
            expect(manager.GetTasks()).toHaveLength(4);
            expect(manager.GetTaskSummary()).toBe('1 of 4 tasks complete, 1 in progress');

            // Turn 3: t2 blocked, t3 started
            manager.ApplyScratchpadChanges({
                taskList: {
                    upsert: [
                        { id: 't2', title: 'Fetch marketing spend data', status: 'blocked', notes: 'API rate limited, retrying in 30s' },
                        { id: 't3', title: 'Generate comparison report', status: 'in_progress' }
                    ]
                }
            });
            expect(manager.GetTasksByStatus('blocked')).toHaveLength(1);
            expect(manager.GetTaskSummary()).toContain('1 blocked');

            // Turn 4: Everything done, remove old completed task
            manager.ApplyScratchpadChanges({
                notes: 'Report generation complete. All data sources analyzed.',
                taskList: {
                    upsert: [
                        { id: 't2', title: 'Fetch marketing spend data', status: 'completed' },
                        { id: 't3', title: 'Generate comparison report', status: 'completed' },
                        { id: 't4', title: 'Add Q3 comparison to report', status: 'completed' }
                    ],
                    remove: ['t1']
                }
            });

            const finalTasks = manager.GetTasks();
            expect(finalTasks).toHaveLength(3);
            expect(finalTasks.every(t => t.status === 'completed')).toBe(true);
            expect(manager.GetNotes()).toContain('Report generation complete');
        });
    });
});
