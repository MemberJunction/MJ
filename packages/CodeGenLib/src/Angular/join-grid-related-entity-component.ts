import { RegisterClass, SafeJSONParse } from "@memberjunction/global";
import { AngularComponentInfo, ComponentConfigBase, GenerationInput, GenerationResult, RelatedEntityDisplayComponentGeneratorBase } from "./related-entity-components";
import { Metadata } from "@memberjunction/core";


/**
 * Configuration settings for each instance's use of the JoinGrid via the related entity. Defines the shape of the
 * JSON that should be used to configure the JoinGrid component.
 */
export class JoinGridConfigInfo extends ComponentConfigBase {
    public RowsEntityName: string;
    public RowsExtraFilter?: string;
    public RowsEntityDisplayField: string;
    public RowsEntityDisplayName?: string;
    public RowsOrderBy?: string;
    public JoinEntityDisplayColumns?: string[];
}

/**
 * Implementation of the UserViewGridRelatedEntityGenerator class that generates the Angular component for a related entity in a UserViewGrid display component
 */
@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "JoinGrid")
export class JoinGridRelatedEntityGenerator extends RelatedEntityDisplayComponentGeneratorBase {
    public get ConfigType(): typeof JoinGridConfigInfo {
        return JoinGridConfigInfo;
    }
    public get ImportPath(): string {
        return "@memberjunction/ng-join-grid";
    }
    public get ImportItems(): AngularComponentInfo[] {
        return [
            { 
                ClassName: "JoinGridComponent",  
                AngularSelectorName: "mj-join-grid",
                ModuleName: "JoinGridModule" 
            }
        ];
    }

    protected GetForeignKeyName(entityName: string, relatedEntityName: string): string {
        // find a foreign key field that links the entity to the related entity
        const md = new Metadata();
        const e = md.EntityByName(entityName);
        if (!e)
            throw new Error("Could not find entity " + entityName);

        // now find the field in e that matches the related entity
        const field = e.Fields.find(f => f.RelatedEntity === relatedEntityName);
        if (!field)
            throw new Error("Could not find a foreign key field in entity " + entityName + " that links to " + relatedEntityName);

        return field.Name;
    }

    public async Generate(input: GenerationInput): Promise<GenerationResult> {
        const config = SafeJSONParse<JoinGridConfigInfo>(input.RelationshipInfo.DisplayComponentConfiguration);
        if (!config)
            throw new Error("Invalid configuration for JoinGrid component for relationship " + input.RelationshipInfo.ID);

        const template = `<mj-join-grid
    [ShowSaveButton]="false"
    [ShowCancelButton]="false"
    [EditMode]="GridEditMode()"
    RowsEntityName="${config.RowsEntityName}"
    RowsEntityDisplayField="${config.RowsEntityDisplayField}"
    RowsExtraFilter="${config.RowsExtraFilter ? config.RowsExtraFilter : ''}"
    RowsEntityDataSource="FullEntity"
    RowsOrderBy="${config.RowsOrderBy ? config.RowsOrderBy : ''}"
    RowsEntityDisplayName="${config.RowsEntityDisplayName ? config.RowsEntityDisplayName : config.RowsEntityDisplayField}"
    ColumnsMode="Fields"
    JoinEntityName="${input.RelationshipInfo.RelatedEntity}"
    JoinEntityRowForeignKey="${this.GetForeignKeyName(input.RelationshipInfo.RelatedEntity, config.RowsEntityName)}"
    [JoinEntityExtraFilter]="'${this.GetForeignKeyName(input.RelationshipInfo.RelatedEntity, input.Entity.Name)}=' + record.${input.Entity.FirstPrimaryKey.Name}"
    [JoinEntityDisplayColumns]="${config.JoinEntityDisplayColumns ? `[${config.JoinEntityDisplayColumns.map(c => `'${c}'`).join(',')}]` : '[]'}"
    [NewRecordDefaultValues]="{${this.GetForeignKeyName(input.RelationshipInfo.RelatedEntity, input.Entity.Name)}: record.${input.Entity.FirstPrimaryKey.Name}}"
>
</mj-join-grid>
`
        return {
            Success: true,
            TemplateOutput: template,
            CodeOutput: null,
            Component: this
        }
    }
}