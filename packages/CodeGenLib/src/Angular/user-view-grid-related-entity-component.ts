import { RegisterClass } from "@memberjunction/global";
import { AngularComponentInfo, ComponentConfigBase, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";

/**
 * Default generator class for creating UserViewGrid components that display related entity data
 * in a standard data grid format. This is the most commonly used related entity display component,
 * providing full CRUD capabilities, filtering, sorting, and pagination.
 * 
 * The UserViewGrid component provides:
 * - Tabular display of related entity records
 * - In-line editing capabilities
 * - Advanced filtering and search
 * - Column sorting and customization
 * - Pagination for large datasets
 * - Integration with MemberJunction user views
 * - Automatic relationship parameter binding
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "UserViewGrid")
export class UserViewGridRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    /**
     * Returns the NPM package path for importing the UserViewGrid Angular component
     * @returns The import path for the ng-user-view-grid module
     */
    public get ImportPath(): string {
        return "@memberjunction/ng-user-view-grid";
    }
    /**
     * Returns the Angular component information needed for imports and module declarations
     * @returns Array containing the UserViewGridComponent import details
     */
    public get ImportItems(): AngularComponentInfo[] {
        return [
            { 
                ClassName: "UserViewGridComponent",  
                AngularSelectorName: "mj-user-view-grid",
                ModuleName: "UserViewGridModule" 
            }
        ];
    }
    /**
     * Generates the Angular template for a UserViewGrid component that displays related entity data.
     * The generated template includes proper parameter binding for relationships, deferred loading,
     * and integration with the parent form's edit mode and styling.
     * @param input The generation input containing entity and relationship information
     * @returns Promise resolving to the generation result with the Angular grid template
     */
    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        const template = `<mj-user-view-grid 
    [Params]="BuildRelationshipViewParamsByEntityName('${input.RelationshipInfo!.RelatedEntity.trim()}','${input.RelationshipInfo!.RelatedEntityJoinField.trim()}')"  
    [NewRecordValues]="NewRecordValues('${input.RelationshipInfo!.RelatedEntity.trim()}')"
    [AllowLoad]="IsCurrentTab('${input.TabName.trim()}')"  
    [EditMode]="GridEditMode()"  
    [BottomMargin]="GridBottomMargin">
</mj-user-view-grid>`
        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: "",
            Component: this
        }
    }

    /**
     * Returns the configuration type for this component. UserViewGrid uses the base
     * ComponentConfigBase since it doesn't require additional configuration beyond
     * the standard relationship metadata.
     * @returns null since no additional configuration is required
     */
    public get ConfigType(): typeof ComponentConfigBase {
        return null!;
    }
}