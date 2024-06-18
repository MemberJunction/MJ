import { RegisterClass } from "@memberjunction/global";
import { AngularComponentInfo, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";

/**
 * Implementation of the UserViewGridRelatedEntityGenerator class that generates the Angular component for a related entity in a UserViewGrid display component
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "UserViewGrid")
export class UserViewGridRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    public get ImportPath(): string {
        return "@memberjunction/ng-user-view-grid";
    }
    public get ImportItems(): AngularComponentInfo[] {
        return [
            { 
                ClassName: "UserViewGridComponent",  
                AngularSelectorName: "mj-user-view-grid",
                ModuleName: "UserViewGridModule" 
            }
        ];
    }
    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        const template = `<mj-user-view-grid 
    [Params]="BuildRelationshipViewParamsByEntityName('${input.RelationshipInfo.RelatedEntity}')"  
    [NewRecordValues]="NewRecordValues('${input.RelationshipInfo.RelatedEntity}')"
    [AllowLoad]="IsCurrentTab('${input.TabName}')"  
    [EditMode]="GridEditMode()"  
    [BottomMargin]="GridBottomMargin">
</mj-user-view-grid>`
        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: null,
            Component: this
        }
    }
}