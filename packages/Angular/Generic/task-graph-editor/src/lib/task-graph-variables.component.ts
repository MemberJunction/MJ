/**
 * VS Code VARIABLES pane for a selected workflow step.
 *
 * Paint only. Expanding a row is local UI state. The host owns which step is selected.
 * Preserves expanded variable tree nodes across live poll refreshes of the same step while
 * resetting to top-level scopes when the operator switches to a different step.
 */
import { ChangeDetectionStrategy, Component, Input, OnChanges, SimpleChanges } from '@angular/core';
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

@Component({
    standalone: true,
    selector: 'mj-task-graph-variables',
    imports: [NgTemplateOutlet],
    templateUrl: './task-graph-variables.component.html',
    styleUrls: ['./task-graph-variables.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskGraphVariablesComponent implements OnChanges {
    /**
     * Optional task step entity/snapshot. Supplies `ID`, `Status`, `InputPayload`, and
     * `OutputPayload` when those granular inputs are not bound separately.
     */
    @Input()
    public set Task(value: TaskGraphVariableTaskInput | null | undefined) {
        this.task = value ?? null;
        this.rebuild();
    }
    public get Task(): TaskGraphVariableTaskInput | null | undefined {
        return this.task;
    }

    /** Identifier of the currently selected task step, used to preserve expansion across live polls. */
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
    public Expanded = new Set<string>();

    private task: TaskGraphVariableTaskInput | null = null;
    private taskID: string | null = null;
    private inputRaw: string | null | undefined = undefined;
    private outputRaw: string | null | undefined = undefined;
    private invocation: { data?: unknown; context?: unknown } | null = null;

    private _lastTaskID: string | null | undefined = undefined;
    private _lastTaskStatus: string | null | undefined = undefined;
    private _lastInputPayload: string | null | undefined = undefined;
    private _lastOutputPayload: string | null | undefined = undefined;
    private _lastInvocation: { data?: unknown; context?: unknown } | null | undefined = undefined;
    private _knownScopeNames = new Set<string>();

    public ngOnChanges(_changes?: SimpleChanges): void {
        this.rebuild();
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

    private rebuild(): void {
        const effectiveTaskID = this.taskID ?? this.task?.ID ?? null;
        const effectiveTaskStatus = this.task?.Status ?? null;
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
        this._lastTaskStatus = effectiveTaskStatus;

        if (!isFirstBuild && !taskSwitched && !payloadsChanged) {
            return;
        }

        this._lastInputPayload = effectiveInput;
        this._lastOutputPayload = effectiveOutput;
        this._lastInvocation = this.invocation;

        this.Scopes = BuildVariableScopes({
            input: DecodePayload(effectiveInput),
            output: DecodePayload(effectiveOutput),
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
