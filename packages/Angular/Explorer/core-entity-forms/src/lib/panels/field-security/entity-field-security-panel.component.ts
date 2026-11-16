import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';

/**
 * Field-level security on/off control for the Entities form.
 *
 * Shows whether field-level security is on for the entity and, in edit mode, a switch to change
 * it. Turning it on asks for confirmation first, because the save writes one permission row per
 * field and role, copied from the entity's current role permissions. Turning it off keeps those
 * rows; they stop applying until it is turned on again.
 *
 * The panel only reports the choice (`EnabledChange`); the host sets it on the entity record and
 * saves through the normal record save, which is where the server writes the rows.
 */
@Component({
    standalone: false,
    selector: 'mj-entity-field-security-panel',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './entity-field-security-panel.component.html',
    styleUrls: ['./entity-field-security-panel.component.css'],
})
export class EntityFieldSecurityPanelComponent {
    /** Whether field-level security is on, as currently set on the record. */
    @Input() Enabled = false;
    /** The switch shows only in edit mode; otherwise the panel is read-only. */
    @Input() EditMode = false;
    /** How many field permission rows the entity has, or null while unknown. */
    @Input() FieldPermissionCount: number | null = null;
    /** Fires with the new value once the user has made (and, to turn it on, confirmed) the change. */
    @Output() EnabledChange = new EventEmitter<boolean>();

    /** True while the "turn on?" confirmation is showing. */
    public ConfirmingEnable = false;

    /** What the switch shows: on while the user is being asked to confirm turning it on. */
    public get SwitchValue(): boolean {
        return this.Enabled || this.ConfirmingEnable;
    }

    public OnSwitchChange(value: boolean): void {
        if (value && !this.Enabled) {
            this.ConfirmingEnable = true;
            return;
        }
        this.ConfirmingEnable = false;
        if (value !== this.Enabled) {
            this.EnabledChange.emit(value);
        }
    }

    public ConfirmEnable(): void {
        this.ConfirmingEnable = false;
        this.EnabledChange.emit(true);
    }

    public CancelEnable(): void {
        this.ConfirmingEnable = false;
    }
}
