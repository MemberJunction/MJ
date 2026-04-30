import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ActionParam } from '@memberjunction/actions-base';
import { HomeAppPinnedItem, ActionPinConfiguration } from '@memberjunction/ng-shared';

/**
 * Result emitted after the action finishes (or the dialog is cancelled).
 */
export interface ActionPinRunResult {
    Closed: true;
}

interface RuntimeField {
    Name: string;
    Value: string;
}

@Component({
    standalone: false,
    selector: 'mj-action-pin-runner-dialog',
    templateUrl: './action-pin-runner-dialog.component.html',
    styleUrls: ['./action-pin-runner-dialog.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class ActionPinRunnerDialogComponent extends BaseAngularComponent implements OnChanges {
    @Input() Visible = false;
    @Input() Pin: HomeAppPinnedItem | null = null;
    @Output() Result = new EventEmitter<ActionPinRunResult>();

    public RuntimeFields: RuntimeField[] = [];
    public IsRunning = false;
    public RunSucceeded: boolean | null = null;
    public ResultMessage: string | null = null;
    public ErrorMessage: string | null = null;

    constructor(private cdr: ChangeDetectorRef) { super(); }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && this.Visible && this.Pin) {
            this.initFromPin();
        }
    }

    private getConfig(): ActionPinConfiguration | null {
        if (!this.Pin) return null;
        return this.Pin.Configuration as unknown as ActionPinConfiguration;
    }

    private initFromPin(): void {
        const cfg = this.getConfig();
        this.RuntimeFields = (cfg?.runtimeParamNames ?? []).map(name => ({ Name: name, Value: '' }));
        this.IsRunning = false;
        this.RunSucceeded = null;
        this.ResultMessage = null;
        this.ErrorMessage = null;
        this.cdr.markForCheck();
    }

    get AccentColor(): string {
        return this.getConfig()?.accentColor ?? 'var(--mj-brand-primary)';
    }

    get FaIcon(): string {
        return this.Pin?.Icon ?? 'fa-solid fa-bolt';
    }

    get ActionName(): string {
        return this.getConfig()?.actionName ?? 'Action';
    }

    CanRun(): boolean {
        if (this.IsRunning) return false;
        // Runtime fields without values are allowed (action may handle missing params).
        // The action itself reports required-param errors via its result.
        return true;
    }

    async Run(): Promise<void> {
        const cfg = this.getConfig();
        if (!cfg || !cfg.actionId) {
            this.ErrorMessage = 'Pin is missing an actionId — cannot execute.';
            this.cdr.markForCheck();
            return;
        }

        this.IsRunning = true;
        this.RunSucceeded = null;
        this.ResultMessage = null;
        this.ErrorMessage = null;
        this.cdr.markForCheck();

        try {
            const params = this.buildActionParams(cfg);
            const provider = this.ProviderToUse as GraphQLDataProvider;
            const actionClient = new GraphQLActionClient(provider);
            const result = await actionClient.RunAction(cfg.actionId, params);
            this.RunSucceeded = result.Success;
            this.ResultMessage = result.Message ?? (result.Success ? 'Action completed.' : 'Action reported a failure.');
        } catch (err) {
            this.RunSucceeded = false;
            this.ErrorMessage = `Execution failed: ${(err as Error).message}`;
        } finally {
            this.IsRunning = false;
            this.cdr.markForCheck();
        }
    }

    private buildActionParams(cfg: ActionPinConfiguration): ActionParam[] {
        const params: ActionParam[] = [];
        for (const [name, value] of Object.entries(cfg.presetParams ?? {})) {
            params.push({ Name: name, Value: value, Type: 'Input' });
        }
        for (const f of this.RuntimeFields) {
            if (f.Value !== '') {
                params.push({ Name: f.Name, Value: f.Value, Type: 'Input' });
            }
        }
        return params;
    }

    Close(): void {
        if (this.IsRunning) return;
        this.Result.emit({ Closed: true });
    }
}
