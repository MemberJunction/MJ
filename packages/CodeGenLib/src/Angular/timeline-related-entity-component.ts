import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { AngularComponentInfo, ComponentConfigBase, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";


/**
 * Configuration settings for timeline component instances. Defines how related entity data
 * should be displayed in a chronological timeline format, including which fields to use
 * for dates, titles, and descriptions.
 */
export class TimelineConfigInfo extends ComponentConfigBase {
    /**
     * The name of the field in the related entity that contains the date/timestamp
     * for positioning items on the timeline (e.g., 'CreatedAt', 'EventDate')
     */
    DateField: string;
    
    /**
     * The name of the field in the related entity that contains the main title
     * text to display for each timeline item (e.g., 'Title', 'Name', 'Subject')
     */
    TitleField: string
    
    /**
     * Optional field name for subtitle text displayed below the main title.
     * Useful for additional context or secondary information.
     */
    SubTitleField?: string;
    
    /**
     * Optional field name for longer description text displayed in the timeline item.
     * Typically contains detailed information about the timeline event.
     */
    DescriptionField?: string;
    
    /**
     * Controls the visual layout of the timeline. Vertical timelines stack items
     * top-to-bottom, while horizontal timelines arrange items left-to-right.
     * @default 'vertical'
     */
    DisplayOrientation? : 'horizontal' | 'vertical' = 'vertical';

    /**
     * Constructs a new TimelineConfigInfo with required fields initialized to empty strings
     */
    constructor() {
        super();
        this.DateField = "";
        this.TitleField = "";
    }
}

/**
 * Generator class for creating timeline components that display related entity data
 * in chronological order. This component is ideal for showing time-based relationships
 * like activity logs, event histories, deal stages, or any date-sequenced data.
 * 
 * The timeline component provides:
 * - Chronological visualization of related records
 * - Configurable horizontal or vertical layout
 * - Flexible field mapping for dates, titles, and descriptions
 * - Automatic filtering based on parent entity relationships
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "Timeline")
export class TimelineRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    /**
     * Returns the configuration type class used for this timeline generator
     * @returns The TimelineConfigInfo class type
     */
    public get ConfigType(): typeof TimelineConfigInfo {
        return TimelineConfigInfo;
    }
    /**
     * Returns the NPM package path for importing the Timeline Angular component
     * @returns The import path for the ng-timeline module
     */
    public get ImportPath(): string {
        return "@memberjunction/ng-timeline";
    }
    /**
     * Returns the Angular component information needed for imports and module declarations
     * @returns Array containing the TimelineComponent import details
     */
    public get ImportItems(): AngularComponentInfo[] {
        return [
            { 
                ClassName: "TimelineComponent",  
                AngularSelectorName: "mj-timeline",
                ModuleName: "TimelineModule" 
            }
        ];
    }
 

    /**
     * Generates the Angular template for a Timeline component based on the relationship configuration.
     * Creates a timeline that displays related entity records in chronological order using the
     * configured date, title, and optional description fields.
     * @param input The generation input containing entity and relationship information
     * @returns Promise resolving to the generation result with the Angular timeline template
     * @throws Error if the DisplayComponentConfiguration is invalid JSON
     */
    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        const config = SafeJSONParse<TimelineConfigInfo>(input.RelationshipInfo!.DisplayComponentConfiguration);
        if (!config)
            throw new Error("Invalid configuration for component for relationship " + input.RelationshipInfo!.ID);

        // Get the foreign key field that links the related entity back to the parent entity
        const fk = this.GetForeignKey(input.RelationshipInfo!.RelatedEntity, input.Entity!.Name);
        // Build the filter expression to show only records related to the current parent record
        const filter = `'${fk.Name}=' + record.${input.Entity!.FirstPrimaryKey.Name}`;
        
        // Generate the Angular template with timeline configuration
        const template = `<mj-timeline
    DisplayOrientation="${config.DisplayOrientation}"
    [Groups]="[{EntityName: '${input.RelationshipInfo!.RelatedEntity}', DataSourceType: 'entity', Filter: ${filter}, TitleFieldName: '${config.TitleField}', DateFieldName: '${config.DateField}'}]">
</mj-timeline>`

        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: "",
            Component: this
        }
    }
}