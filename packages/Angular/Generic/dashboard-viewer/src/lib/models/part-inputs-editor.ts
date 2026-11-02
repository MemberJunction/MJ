/**
 * The model behind a part's Inputs list in the part dialog: every input the part declares, each fed
 * by a dashboard property, fixed by a default, both (the default when the property has no value), or
 * left to its own default. Server-set inputs are listed but can't be mapped. Mappings to inputs the
 * part no longer declares are kept apart so the user sees and removes them. Plain TypeScript.
 */
import type { PropertyDefault, PropertyValueType } from '@memberjunction/core';
import { ValidatePartMappings } from './dashboard-config-validator';
import {
    DashboardPartInput,
    DashboardPartInputMapping,
    DashboardPartInterface,
    DashboardProperty,
    IsTypeCompatible,
} from './dashboard-properties';

/** One declared input and how it is fed. */
export interface PartInputRow {
    Input: DashboardPartInput;
    /** The dashboard property that feeds it, or null. */
    Property: string | null;
    /** Its default: alone it fixes the input; with a property it is used when the property has no value. */
    Default: PropertyDefault | undefined;
}

export class PartInputsEditor {
    /** One row per declared input, in the part's order. */
    public readonly Rows: PartInputRow[];
    /** Mappings to inputs the part doesn't declare (for example a view property renamed since). */
    public Orphans: DashboardPartInputMapping[];

    constructor(public readonly Interface: DashboardPartInterface, mappings: DashboardPartInputMapping[]) {
        this.Rows = Interface.Inputs.map(input => {
            const mapping = mappings.find(m => m.Input === input.Name);
            return { Input: input, Property: mapping?.Property ?? null, Default: mapping?.Default };
        });
        this.Orphans = mappings.filter(m => !Interface.Inputs.some(i => i.Name === m.Input));
    }

    /** The type a row's default takes: the input's type, or text for an input that takes any value. */
    public DefaultType(row: PartInputRow): PropertyValueType {
        const type = row.Input.Type;
        return type === 'any' || type === 'unsupported' ? 'string' : type;
    }

    /** The dashboard properties whose type fits the row's input. */
    public CompatibleProperties(row: PartInputRow, properties: DashboardProperty[]): DashboardProperty[] {
        return properties.filter(p => IsTypeCompatible(p.Type, row.Input.Type));
    }

    /** True when the input can be mapped: not server-set, and of a type a property can fill. */
    public CanMap(row: PartInputRow): boolean {
        return !row.Input.ServerSet && row.Input.Type !== 'unsupported';
    }

    public RemoveOrphan(index: number): void {
        this.Orphans = this.Orphans.filter((_, i) => i !== index);
    }

    /** The part's mappings: each row with a property or a default, then the orphans (which a save refuses). */
    public BuildMappings(): DashboardPartInputMapping[] {
        const mappings: DashboardPartInputMapping[] = [];
        for (const row of this.Rows) {
            if (!row.Property && !row.Default) continue;
            const mapping: DashboardPartInputMapping = { Input: row.Input.Name };
            if (row.Property) mapping.Property = row.Property;
            if (row.Default) mapping.Default = row.Default;
            mappings.push(mapping);
        }
        return [...mappings, ...this.Orphans];
    }

    /** What the part dialog refuses: undeclared or server-set inputs, missing properties, mismatched types, bad defaults. */
    public Problems(partTitle: string, properties: DashboardProperty[]): string[] {
        return ValidatePartMappings(partTitle, this.BuildMappings(), this.Interface, properties);
    }
}
