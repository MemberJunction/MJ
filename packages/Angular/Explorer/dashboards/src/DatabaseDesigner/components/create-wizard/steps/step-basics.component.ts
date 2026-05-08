/**
 * @module step-basics.component
 * @description Step 1 of the create wizard — entity name, table name, schema, description.
 *
 * Auto-derives the table name from entity name (PascalCase, no spaces) but
 * lets the user override it freely.  Once the user manually edits the table
 * name it stops tracking entity name changes.
 */

import {
    Component, Input, Output, EventEmitter, OnInit,
    ChangeDetectionStrategy, ChangeDetectorRef, inject,
} from '@angular/core';
import type { BasicsStepValue, SchemaOption } from '../../../database-designer.types.js';

@Component({
    standalone: false,
    selector: 'mj-entity-step-basics',
    templateUrl: './step-basics.component.html',
    styleUrls: ['./step-basics.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepBasicsComponent implements OnInit {

    private readonly cdr = inject(ChangeDetectorRef);

    @Input() public InitialValue: Partial<BasicsStepValue> = {};

    private _availableSchemas: SchemaOption[] = [];
    @Input()
    set AvailableSchemas(schemas: SchemaOption[]) {
        this._availableSchemas = schemas;
        // Schemas arrive async — if SchemaName wasn't set by InitialValue, auto-select the default now.
        if (!this.SchemaName && schemas.length > 0) {
            this.SchemaName = this.defaultSchema();
            this.updateCustomSchemaVisibility();
            this.emit();
            this.cdr.markForCheck();
        }
    }
    get AvailableSchemas(): SchemaOption[] { return this._availableSchemas; }

    @Output() public readonly ValueChanged = new EventEmitter<BasicsStepValue>();

    // ─── Form fields ───────────────────────────────────────────────────────

    public EntityName = '';
    public TableName = '';
    public SchemaName = '';
    public Description = '';

    /** When true, TableName auto-tracks EntityName changes. */
    public tableNameIsAuto = true;

    // ─── Custom schema input ───────────────────────────────────────────────

    public ShowCustomSchemaInput = false;
    public CustomSchemaName = '';

    // ─── Lifecycle ─────────────────────────────────────────────────────────

    ngOnInit(): void {
        this.EntityName  = this.InitialValue.entityName  ?? '';
        this.TableName   = this.InitialValue.tableName   ?? '';
        this.SchemaName  = this.InitialValue.schemaName  ?? this.defaultSchema();
        this.Description = this.InitialValue.description ?? '';
        this.tableNameIsAuto = this.InitialValue.tableNameIsAuto ?? true;
        // If SchemaName was a previously typed value (no matching dropdown option),
        // restore it to CustomSchemaName so the text field is pre-populated on back-nav.
        const knownOpt = this.AvailableSchemas.find(s => s.value === this.SchemaName);
        if (knownOpt == null && this.SchemaName) {
            this.CustomSchemaName = this.SchemaName;
        }
        this.updateCustomSchemaVisibility();
    }

    // ─── Event handlers ────────────────────────────────────────────────────

    public OnEntityNameChange(value: string): void {
        this.EntityName = value;
        if (this.tableNameIsAuto) {
            this.TableName = this.deriveTableName(value);
        }
        this.emit();
    }

    public OnTableNameChange(value: string): void {
        this.TableName = value;
        // User has taken manual control
        this.tableNameIsAuto = value === this.deriveTableName(this.EntityName);
        this.emit();
    }

    public OnSchemaChange(value: string): void {
        this.SchemaName = value;
        this.updateCustomSchemaVisibility();
        if (!this.ShowCustomSchemaInput) this.CustomSchemaName = '';
        this.emit();
    }

    public OnCustomSchemaChange(value: string): void {
        this.CustomSchemaName = value;
        this.SchemaName = value;
        this.emit();
    }

    public OnDescriptionChange(value: string): void {
        this.Description = value;
        this.emit();
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    /** Pick the first schema in the list as default (usually '__mj_UDT'). */
    private defaultSchema(): string {
        const def = this.AvailableSchemas.find(s => s.isDefault);
        return def?.value ?? this.AvailableSchemas[0]?.value ?? '';
    }

    private updateCustomSchemaVisibility(): void {
        const opt = this.AvailableSchemas.find(s => s.value === this.SchemaName);
        // Show the free-text input only for the "Other" sentinel option (value === '').
        // Named schemas like 'testing_ethan' already have their name from the dropdown.
        // If SchemaName doesn't match any option (back-navigation from a typed entry),
        // show the input so the user can still edit their previously typed value.
        this.ShowCustomSchemaInput = opt != null ? opt.value === '' : this.SchemaName !== '';
    }

    /** Convert "Support Tickets" → "SupportTickets". */
    public deriveTableName(entityName: string): string {
        return entityName
            .replace(/[^a-zA-Z0-9 ]/g, '')
            .split(' ')
            .filter(Boolean)
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join('');
    }

    private emit(): void {
        this.ValueChanged.emit({
            entityName: this.EntityName,
            tableName:  this.TableName,
            schemaName: this.SchemaName,
            description: this.Description,
            tableNameIsAuto: this.tableNameIsAuto,
        });
        this.cdr.markForCheck();
    }
}
