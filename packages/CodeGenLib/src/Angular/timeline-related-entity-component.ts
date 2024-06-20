import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { AngularComponentInfo, ComponentConfigBase, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";
import { Metadata } from "@memberjunction/core";


/**
 * Configuration settings for each instance's use of the timeline component
 */
export class TimelineConfigInfo extends ComponentConfigBase {
    /**
     * The name of the field in the related entity that has the date that will be used for display on the timeline
     */
    DateField: string;
    /**
     * The name of the field in the related entity that has the title that will be used for display on the timeline
     */
    TitleField: string
    /**
     * Optional, the name of the field in the related entity that has the subtitle that will be used for display on the timeline
     */
    SubTitleField?: string;
    /**
     * Optional, the name of the field in the related entity that has the description that will be used for display on the timeline
     */
    DescriptionField?: string;
    /**
     * Optional, determines if the timeline will be displayed horizontally or vertically, defaults to vertical if not provided
     */
    DisplayOrientation? : 'horizontal' | 'vertical' = 'vertical';
}

/**
 * Implementation of the UserViewGridRelatedEntityGenerator class that generates the Angular component for a related entity in a UserViewGrid display component
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "Timeline")
export class TimelineRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    public get ConfigType(): typeof TimelineConfigInfo {
        return TimelineConfigInfo;
    }
    public get ImportPath(): string {
        return "@memberjunction/ng-timeline";
    }
    public get ImportItems(): AngularComponentInfo[] {
        return [
            { 
                ClassName: "TimelineComponent",  
                AngularSelectorName: "mj-timeline",
                ModuleName: "TimelineModule" 
            }
        ];
    }
 

    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        const config = SafeJSONParse<TimelineConfigInfo>(input.RelationshipInfo.DisplayComponentConfiguration);
        if (!config)
            throw new Error("Invalid configuration for component for relationship " + input.RelationshipInfo.ID);

        const fk = this.GetForeignKey(input.Entity.Name, input.RelationshipInfo.RelatedEntity);
        const filter = `${fk.Name} = record.${input.Entity.FirstPrimaryKey.Name}`;
        const template = `<mj-timeline
    DisplayOrientation="${config.DisplayOrientation}"
    [Groups]="[{EntityName: '${input.RelationshipInfo.RelatedEntity}', DataSourceType='entity', Filter='${filter}', TitleFieldName='${config.TitleField}', DateFieldName='${config.DateField}'}]">
</mj-timeline>
`
        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: null,
            Component: this
        }
    }
}