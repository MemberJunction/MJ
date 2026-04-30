import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { RunView } from '@memberjunction/core';
import { MJActionParamEntity } from '@memberjunction/core-entities';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

/**
 * One row in the param configuration table — either a preset-value or a runtime-prompted param.
 */
export interface ActionPinParamConfig {
    Name: string;
    Description: string;
    IsRequired: boolean;
    DefaultValue: string;
    Mode: 'preset' | 'runtime';
    PresetValue: string;
}

/**
 * Payload returned when the user saves the dialog.
 */
export interface ActionPinConfigResult {
    Action: 'save' | 'cancel';
    Pin?: {
        DisplayName: string;
        ActionID: string;
        ActionName: string;
        AccentColor: string;
        FaIcon: string;
        PresetParams: Record<string, string>;
        RuntimeParamNames: string[];
    };
}

const COLOR_PALETTE = [
    { name: 'Indigo', value: '#4F46E5' },
    { name: 'Emerald', value: '#10B981' },
    { name: 'Rose', value: '#F43F5E' },
    { name: 'Amber', value: '#F59E0B' },
    { name: 'Sky', value: '#0EA5E9' },
    { name: 'Violet', value: '#8B5CF6' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Slate', value: '#475569' }
];

const FA_ICON_PALETTE = [
    'fa-solid fa-bolt', 'fa-solid fa-rocket', 'fa-solid fa-wand-magic-sparkles',
    'fa-solid fa-robot', 'fa-solid fa-gears', 'fa-solid fa-play',
    'fa-solid fa-bullhorn', 'fa-solid fa-envelope', 'fa-solid fa-chart-line',
    'fa-solid fa-file-export', 'fa-solid fa-file-import', 'fa-solid fa-database',
    'fa-solid fa-code', 'fa-solid fa-terminal', 'fa-solid fa-paper-plane',
    'fa-solid fa-camera', 'fa-solid fa-image', 'fa-solid fa-bell',
    'fa-solid fa-flag', 'fa-solid fa-star', 'fa-solid fa-heart',
    'fa-solid fa-bookmark', 'fa-solid fa-tag', 'fa-solid fa-lightbulb',
    'fa-solid fa-brain', 'fa-solid fa-microchip', 'fa-solid fa-server',
    'fa-solid fa-cloud', 'fa-solid fa-cube', 'fa-solid fa-thumbtack'
];

@Component({
    standalone: false,
    selector: 'mj-action-pin-config-dialog',
    templateUrl: './action-pin-config-dialog.component.html',
    styleUrls: ['./action-pin-config-dialog.component.css'],
    encapsulation: ViewEncapsulation.None
})
export class ActionPinConfigDialogComponent extends BaseAngularComponent implements OnChanges {
    @Input() Visible = false;
    @Input() ActionID: string | null = null;
    @Input() ActionName: string | null = null;
    @Input() ActionDescription: string | null = null;
    @Output() Result = new EventEmitter<ActionPinConfigResult>();

    public readonly ColorPalette = COLOR_PALETTE;
    public readonly FaIconPalette = FA_ICON_PALETTE;

    public DisplayName = '';
    public AccentColor: string = COLOR_PALETTE[0].value;
    public FaIcon = FA_ICON_PALETTE[0];

    public Params: ActionPinParamConfig[] = [];

    public IsLoadingParams = false;
    public ErrorMessage: string | null = null;

    constructor(private cdr: ChangeDetectorRef) { super(); }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['Visible'] && this.Visible && this.ActionID) {
            this.resetState();
            this.loadParams();
        }
    }

    private resetState(): void {
        this.DisplayName = this.ActionName ?? '';
        this.AccentColor = COLOR_PALETTE[0].value;
        this.FaIcon = FA_ICON_PALETTE[0];
        this.Params = [];
        this.ErrorMessage = null;
        this.IsLoadingParams = false;
    }

    private async loadParams(): Promise<void> {
        if (!this.ActionID) return;
        this.IsLoadingParams = true;
        this.cdr.markForCheck();
        try {
            const rv = RunView.FromMetadataProvider(this.ProviderToUse);
            const result = await rv.RunView<MJActionParamEntity>({
                EntityName: 'MJ: Action Params',
                ExtraFilter: `ActionID='${this.ActionID}' AND (Type='Input' OR Type='Both')`,
                OrderBy: 'Name',
                ResultType: 'entity_object'
            });
            if (!result.Success) {
                this.ErrorMessage = `Could not load parameters: ${result.ErrorMessage}`;
                return;
            }
            this.Params = (result.Results ?? []).map(p => ({
                Name: p.Name,
                Description: p.Description ?? '',
                IsRequired: p.IsRequired,
                DefaultValue: p.DefaultValue ?? '',
                Mode: p.IsRequired ? 'preset' : 'runtime',
                PresetValue: p.DefaultValue ?? ''
            }));
        } catch (err) {
            this.ErrorMessage = `Failed to load action parameters: ${(err as Error).message}`;
        } finally {
            this.IsLoadingParams = false;
            this.cdr.markForCheck();
        }
    }

    SelectColor(hex: string): void {
        this.AccentColor = hex;
        this.cdr.markForCheck();
    }

    SelectFaIcon(icon: string): void {
        this.FaIcon = icon;
        this.cdr.markForCheck();
    }

    SetParamMode(param: ActionPinParamConfig, mode: 'preset' | 'runtime'): void {
        param.Mode = mode;
        this.cdr.markForCheck();
    }

    CanSave(): boolean {
        if (!this.DisplayName.trim()) return false;
        for (const p of this.Params) {
            if (p.Mode === 'preset' && p.IsRequired && !p.PresetValue.trim()) return false;
        }
        return true;
    }

    Save(): void {
        if (!this.CanSave() || !this.ActionID || !this.ActionName) return;
        const presetParams: Record<string, string> = {};
        const runtimeParamNames: string[] = [];
        for (const p of this.Params) {
            if (p.Mode === 'preset') {
                if (p.PresetValue.trim() !== '') presetParams[p.Name] = p.PresetValue;
            } else {
                runtimeParamNames.push(p.Name);
            }
        }
        this.Result.emit({
            Action: 'save',
            Pin: {
                DisplayName: this.DisplayName.trim(),
                ActionID: this.ActionID,
                ActionName: this.ActionName,
                AccentColor: this.AccentColor,
                FaIcon: this.FaIcon,
                PresetParams: presetParams,
                RuntimeParamNames: runtimeParamNames
            }
        });
    }

    Cancel(): void {
        this.Result.emit({ Action: 'cancel' });
    }
}
