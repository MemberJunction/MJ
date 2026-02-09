import { RegisterClass } from "@memberjunction/global";
import { AngularComponentInfo, ComponentConfigBase, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";

/**
 * Default generator class for creating EntityDataGrid components that display related entity data
 * in a standard data grid format. This is the most commonly used related entity display component,
 * providing full CRUD capabilities, filtering, sorting, and pagination.
 *
 * The EntityDataGrid component provides:
 * - Tabular display of related entity records using AG Grid
 * - In-line editing capabilities
 * - Advanced filtering and search
 * - Column sorting and customization
 * - Client-side and infinite scroll pagination
 * - Automatic state persistence
 * - Integration with MemberJunction user views
 * - Automatic relationship parameter binding
 * - Rich Before/After cancelable event system
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "EntityDataGrid")
export class EntityDataGridRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    /**
     * Returns the NPM package path for importing the EntityDataGrid Angular component
     * @returns The import path for the ng-entity-viewer module
     */
    public get ImportPath(): string {
        return "@memberjunction/ng-entity-viewer";
    }
    /**
     * Returns the Angular component information needed for imports and module declarations
     * @returns Empty array since EntityDataGrid uses module-level imports, not component imports
     */
    public get ImportItems(): AngularComponentInfo[] {
        return [];
    }
    /**
     * Generates the Angular template for an EntityDataGrid component that displays related entity data.
     * The generated template includes proper parameter binding for relationships, deferred loading,
     * and integration with the parent form's styling.
     * @param input The generation input containing entity and relationship information
     * @returns Promise resolving to the generation result with the Angular grid template
     */
    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        // Use IsSectionExpanded for new collapsible section-based forms, IsCurrentTab for legacy tab-based forms
        const allowLoadCheck = input.SectionKey && input.SectionKey.length > 0
            ? `IsSectionExpanded('${input.SectionKey.trim()}')`
            : `IsCurrentTab('${input.TabName.trim()}')`;

        // Add AfterDataLoad event binding to capture row count
        const afterDataLoadEvent = input.SectionKey && input.SectionKey.length > 0
            ? `(AfterDataLoad)="SetSectionRowCount('${input.SectionKey.trim()}', $event.totalRowCount)"`
            : '';

        const template = `<mj-explorer-entity-data-grid
    [Params]="BuildRelationshipViewParamsByEntityName('${input.RelationshipInfo!.RelatedEntity.trim()}','${input.RelationshipInfo!.RelatedEntityJoinField.trim()}')"
    [NewRecordValues]="NewRecordValues('${input.RelationshipInfo!.RelatedEntity.trim()}')"
    [AllowLoad]="${allowLoadCheck}"
    [ShowToolbar]="false"
    (Navigate)="OnFormNavigate($event)"${afterDataLoadEvent ? `\n    ${afterDataLoadEvent}` : ''}
    >
</mj-explorer-entity-data-grid>`;
        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: "",
            Component: this
        }
    }

    /**
     * Returns the configuration type for this component. EntityDataGrid uses the base
     * ComponentConfigBase since it doesn't require additional configuration beyond
     * the standard relationship metadata.
     * @returns null since no additional configuration is required
     */
    public get ConfigType(): typeof ComponentConfigBase {
        return null!;
    }
}