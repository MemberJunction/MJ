/**
 * VS Code VARIABLES pane + Before ⇄ After Payload Diff for a selected workflow step.
 *
 * Paint only. Expanding a row, filtering, or toggling Tree/Diff is local UI state.
 * Preserves expanded variable tree nodes across live poll refreshes of the same step while
 * resetting to top-level scopes when the operator switches to a different step.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
    BuildVariableScopes,
    DecodePayload,
    type DebugVariable,
    type DebugVariableScope,
} from './debug-variables';

/** Minimal shape for a task step passed directly into {@link TaskGraphVariablesComponent}. */
export interface TaskGraphVariableTaskInput {
    ID?: string | null;
    Status?: string | null;
    InputPayload?: string | null;
    OutputPayload?: string | null;
}

/** One row of the Before ⇄ After payload diff comparing Input vs Output keys. */
export interface PayloadDiffEntry {
    Key: string;
    Before: string;
    After: string;
    Kind: 'added' | 'changed' | 'removed' | 'unchanged';
}

export type VariablesViewMode = 'tree' | 'diff';

/** Computes a shallow key-by-key Before ⇄ After payload diff between decoded Input and Output objects. */
export function ComputePayloadDiff(inputVal: unknown, outputVal: unknown): PayloadDiffEntry[] {
    const beforeObj = toPlainRecord(inputVal);
    const afterObj = toPlainRecord(outputVal);
    const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])).sort();
    return keys.map((key) => {
        const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
        const beforeStr = hasBefore ? formatDiffValue(beforeObj[key]) : '—';
        const afterStr = hasAfter ? formatDiffValue(afterObj[key]) : '—';
        let kind: PayloadDiffEntry['Kind'] = 'unchanged';
        if (!hasBefore && hasAfter) kind = 'added';
        else if (hasBefore && !hasAfter) kind = 'removed';
        else if (beforeStr !== afterStr) kind = 'changed';
        return { Key: key, Before: beforeStr, After: afterStr, Kind: kind };
    });
}

function toPlainRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (value !== undefined && value !== null) {
        return { value };
    }
    return {};
}

function formatDiffValue(value: unknown): string {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value.length > 80 ? `"${value.slice(0, 77)}…"` : `"${value}"`;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    const json = JSON.stringify(value);
    return json && json.length > 80 ? `${json.slice(0, 77)}…` : (json ?? String(value));
}

@Component({
    standalone: true,
    selector: 'mj-task-graph-variables',
    imports: [NgTemplateOutlet],
    templateUrl: './task-graph-variables.component.html',
    styleUrls: ['./task-graph-variables.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskGraphVariablesComponent {
    @Input()
    public set Task(value: TaskGraphVariableTaskInput | null | undefined) {
        this.task = value ?? null;
        this.rebuild();
    }
    public get Task(): TaskGraphVariableTaskInput | null | undefined {
        return this.task;
    }

    @Input()
    public set TaskID(value: string | null | undefined) {
        this.taskID = value ?? null;
        this.rebuild();
    }
    public get TaskID(): string | null | undefined {
        return this.taskID;
    }

    @Input()
    public set InputPayload(value: string | null | undefined) {
        this.inputRaw = value;
        this.rebuild();
    }
    public get InputPayload(): string | null | undefined {
        return this.inputRaw;
    }

    @Input()
    public set OutputPayload(value: string | null | undefined) {
        this.outputRaw = value;
        this.rebuild();
    }
    public get OutputPayload(): string | null | undefined {
        return this.outputRaw;
    }

    @Input()
    public set Invocation(value: { data?: unknown; context?: unknown } | null) {
        this.invocation = value;
        this.rebuild();
    }
    public get Invocation(): { data?: unknown; context?: unknown } | null {
        return this.invocation;
    }

    public Scopes: DebugVariableScope[] = [];
    public DiffEntries: PayloadDiffEntry[] = [];
    public Expanded = new Set<string>();
    public ViewMode: VariablesViewMode = 'tree';
    public SearchQuery = '';
    public CopiedFeedback = false;

    private task: TaskGraphVariableTaskInput | null = null;
    private taskID: string | null = null;
    private inputRaw: string | null | undefined = undefined;
    private outputRaw: string | null | undefined = undefined;
    private invocation: { data?: unknown; context?: unknown } | null = null;
    private decodedInput: unknown = undefined;
    private decodedOutput: unknown = undefined;

    private _lastTaskID: string | null | undefined = undefined;
    private _lastInputPayload: string | null | undefined = undefined;
    private _lastOutputPayload: string | null | undefined = undefined;
    private _lastInvocation: { data?: unknown; context?: unknown } | null | undefined = undefined;
    private _knownScopeNames = new Set<string>();

    public get FilteredScopes(): DebugVariableScope[] {
        const q = this.SearchQuery.trim().toLowerCase();
        if (!q) return this.Scopes;
        return this.Scopes
            .map((scope) => ({
                ...scope,
                Variables: scope.Variables.filter((v) => this.matchesVariable(v, q)),
            }))
            .filter((scope) => scope.Variables.length > 0);
    }

    public get FilteredDiffEntries(): PayloadDiffEntry[] {
        const q = this.SearchQuery.trim().toLowerCase();
        if (!q) return this.DiffEntries;
        return this.DiffEntries.filter(
            (e) =>
                e.Key.toLowerCase().includes(q) ||
                e.Before.toLowerCase().includes(q) ||
                e.After.toLowerCase().includes(q),
        );
    }

    public OnSearchInput(event: Event): void {
        const target = event.target;
        this.SearchQuery = target instanceof HTMLInputElement ? target.value : '';
    }

    public SetViewMode(mode: VariablesViewMode): void {
        this.ViewMode = mode;
    }

    public CopyJson(): void {
        const payload = {
            input: this.decodedInput ?? null,
            output: this.decodedOutput ?? null,
            ...(this.invocation ? { invocation: this.invocation } : {}),
        };
        const text = JSON.stringify(payload, null, 2);
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(text);
        }
        this.CopiedFeedback = true;
        setTimeout(() => {
            this.CopiedFeedback = false;
        }, 1500);
    }

    public Toggle(path: string): void {
        if (this.Expanded.has(path)) this.Expanded.delete(path);
        else this.Expanded.add(path);
        this.Expanded = new Set(this.Expanded);
    }

    public IsExpanded(path: string): boolean {
        return this.Expanded.has(path);
    }

    public Path(scope: string, name: string, parent?: string): string {
        return parent ? `${parent}.${name}` : `${scope}.${name}`;
    }

    public HasChildren(variable: DebugVariable): boolean {
        return variable.Children.length > 0;
    }

    private matchesVariable(v: DebugVariable, q: string): boolean {
        if (v.Name.toLowerCase().includes(q) || v.Preview.toLowerCase().includes(q)) return true;
        return v.Children.some((c) => this.matchesVariable(c, q));
    }

    private rebuild(): void {
        const effectiveTaskID = this.taskID ?? this.task?.ID ?? null;
        const effectiveInput = this.inputRaw !== undefined ? this.inputRaw : this.task?.InputPayload;
        const effectiveOutput = this.outputRaw !== undefined ? this.outputRaw : this.task?.OutputPayload;

        const isFirstBuild =
            this._lastTaskID === undefined &&
            this._lastInputPayload === undefined &&
            this._lastOutputPayload === undefined &&
            this._lastInvocation === undefined;
        const taskSwitched =
            !isFirstBuild &&
            this._lastTaskID !== null &&
            effectiveTaskID !== this._lastTaskID;
        const payloadsChanged =
            effectiveInput !== this._lastInputPayload ||
            effectiveOutput !== this._lastOutputPayload ||
            this.invocation !== this._lastInvocation;

        this._lastTaskID = effectiveTaskID;

        if (!isFirstBuild && !taskSwitched && !payloadsChanged) {
            return;
        }

        this._lastInputPayload = effectiveInput;
        this._lastOutputPayload = effectiveOutput;
        this._lastInvocation = this.invocation;

        this.decodedInput = DecodePayload(effectiveInput);
        this.decodedOutput = DecodePayload(effectiveOutput);
        this.DiffEntries = ComputePayloadDiff(this.decodedInput, this.decodedOutput);

        this.Scopes = BuildVariableScopes({
            input: this.decodedInput,
            output: this.decodedOutput,
            invocation: this.invocation,
        });

        if (this.Scopes.length === 0) {
            this._knownScopeNames.clear();
            this.Expanded = new Set();
            return;
        }

        if (taskSwitched || this._knownScopeNames.size === 0) {
            const topScopeNames = this.Scopes.map((s) => s.Name);
            this._knownScopeNames = new Set(topScopeNames);
            this.Expanded = new Set(topScopeNames);
            return;
        }

        const nextExpanded = new Set(this.Expanded);
        for (const scope of this.Scopes) {
            if (!this._knownScopeNames.has(scope.Name)) {
                this._knownScopeNames.add(scope.Name);
                nextExpanded.add(scope.Name);
            }
        }
        this.Expanded = nextExpanded;
    }
}
