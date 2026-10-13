/**
 * VS Code VARIABLES pane for a selected workflow step.
 *
 * Paint only. Expanding a row is local UI state. The host owns which step is selected.
 */
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
    BuildVariableScopes,
    DecodePayload,
    type DebugVariable,
    type DebugVariableScope,
} from './debug-variables';

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
    public set InputPayload(value: string | null | undefined) {
        this.inputRaw = value;
        this.rebuild();
    }
    @Input()
    public set OutputPayload(value: string | null | undefined) {
        this.outputRaw = value;
        this.rebuild();
    }
    @Input()
    public set Invocation(value: { data?: unknown; context?: unknown } | null) {
        this.invocation = value;
        this.rebuild();
    }

    public Scopes: DebugVariableScope[] = [];
    public Expanded = new Set<string>();

    private inputRaw: string | null | undefined;
    private outputRaw: string | null | undefined;
    private invocation: { data?: unknown; context?: unknown } | null = null;

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
        this.Scopes = BuildVariableScopes({
            input: DecodePayload(this.inputRaw),
            output: DecodePayload(this.outputRaw),
            invocation: this.invocation,
        });
        this.Expanded = new Set(this.Scopes.map((s) => s.Name));
    }
}
