import { EntityFieldInfo, EntityInfo, EntityRelationshipInfo, Metadata, UserInfo } from "@memberjunction/core";
import { TypeTablesCache } from "@memberjunction/core-entities";
import { MJGlobal, UUIDsEqual } from "@memberjunction/global";

/**
 * Represents metadata about an Angular component that is used in the generated code.
 * This includes all the necessary information for importing and using the component
 * in generated Angular modules and templates.
 */
export class AngularComponentInfo {
    /**
     * The TypeScript class name for the component
     */
    public ClassName: string;
    
    /**
     * The name of the Angular module that exports this component,
     * used for proper import statements in the generated module
     */
    public ModuleName: string; 
    
    /**
     * The Angular selector name for the component (e.g., 'mj-user-grid')
     */
    public AngularSelectorName: string;

    /**
     * Constructs a new AngularComponentInfo with empty default values
     */
    public constructor() {
        this.ClassName = "";
        this.ModuleName = "";
        this.AngularSelectorName = "";
    }
}

/**
 * Result object returned by Angular code generation classes.
 * Contains the generated template, optional TypeScript code, and metadata
 * about the generation process.
 */
export class GenerationResult {
    /**
     * Indicates whether the generation process completed successfully
     */
    Success: boolean;
    
    /**
     * If generation failed, contains the error message describing what went wrong
     */
    ErrorMessage?: string;
    
    /**
     * The generated HTML/Angular template code that will be embedded
     * in the final Angular component template
     */
    TemplateOutput: string;
    
    /**
     * Optional TypeScript code that will be injected into the class definition
     * of the Angular component. Useful for adding additional methods, properties,
     * or lifecycle hooks to the component.
     */
    CodeOutput?: string;
    
    /**
     * Reference to the generator component that produced this output.
     * Used for accessing component properties later for imports and module configuration.
     */
    Component: RelatedEntityDisplayComponentGeneratorBase | null;

    /**
     * Constructs a new GenerationResult with default failure state
     */
    public constructor() {
        this.Success = false;
        this.TemplateOutput = "";
        this.Component = null;
    }
}

/**
 * Input parameters required for the Generate() method of component generators.
 * Contains all the context needed to generate appropriate Angular templates
 * for related entity components.
 */
export class GenerationInput {
    /**
     * The primary entity that owns the relationship
     */
    Entity: EntityInfo | null;
    
    /**
     * Metadata about the relationship between the primary entity and related entity,
     * including display configuration and join information
     */
    RelationshipInfo: EntityRelationshipInfo | null;
    
    /**
     * The name of the tab in a multi-tabbed interface. Optional but useful
     * for deferred loading using the IsCurrentTab() method from BaseFormComponent.
     * Allows components to optimize rendering by only loading data when the tab is active.
     */
    TabName: string;

    /**
     * The unique camelCase key for the section in collapsible section-based forms.
     * Used for deferred loading using the IsSectionExpanded() method from BaseFormComponent.
     * Allows components to optimize rendering by only loading data when the section is expanded.
     */
    SectionKey: string;

    /**
     * Constructs a new GenerationInput with null/empty default values
     */
    public constructor() {
        this.Entity = null;
        this.RelationshipInfo = null;
        this.TabName = "";
        this.SectionKey = "";
    }
}


/**
 * Base class for all component configuration classes. Subclasses extend this
 * to define the shape and properties of their specific configuration objects.
 * These configurations are typically stored as JSON in the database and
 * deserialized into strongly-typed objects.
 */
export class ComponentConfigBase {

}

/**
 * Abstract base class responsible for generating Angular template code for related entity display components.
 * Each subclass handles a specific type of related entity display (e.g., UserViewGrid, JoinGrid, Timeline).
 * 
 * The generated templates are injected into Angular forms that extend BaseFormComponent, so all
 * BaseFormComponent methods and properties are available in the generated templates:
 * 
 * **Commonly used BaseFormComponent methods/properties:**
 * - `BuildRelationshipViewParamsByEntityName()` - Creates view parameters for related entities
 * - `NewRecordValues()` - Provides default values for new related records
 * - `IsCurrentTab()` - Checks if the current tab is active (useful for deferred loading)
 * - `GridEditMode()` - Determines if grids should be in edit mode
 * - `GridBottomMargin()` - Provides consistent bottom margin for grids
 * 
 * **Implementation Pattern:**
 * 1. Extend this class
 * 2. Register with `@RegisterClass(RelatedEntityDisplayComponentGeneratorBase, "YourComponentName")`
 * 3. Implement all abstract methods
 * 4. Define a configuration class extending ComponentConfigBase
 * 5. Generate appropriate Angular templates in the Generate() method
 * 
 * @see BaseFormComponent
 */
export abstract class RelatedEntityDisplayComponentGeneratorBase {
    /**
     * Returns the NPM package import path for the Angular components used by this generator.
     * Can be a local import path or an external package (e.g., '@memberjunction/ng-user-view-grid')
     * @returns The import path string
     */
    public abstract get ImportPath(): string;
    
    /**
     * Returns one or more AngularComponentInfo objects that represent the Angular classes
     * used in the generated code. This information is used to generate proper import statements
     * and module declarations.
     * @returns Array of AngularComponentInfo objects
     */
    public abstract get ImportItems(): AngularComponentInfo[];

    /**
     * Generates the Angular template code for the related entity display component.
     * This is the core method that each subclass must implement to create the appropriate
     * Angular template based on the entity relationship and configuration.
     * @param input Contains the entity, relationship info, and tab context needed for generation
     * @returns Promise resolving to the generation result with template and optional code
     */
    public abstract Generate(input: GenerationInput): Promise<GenerationResult>;



    /**
     * Helper method that returns the name of the foreign key field in the specified entity
     * that links to the related entity. Useful for building relationship queries and joins.
     * @param entityName The name of the entity containing the foreign key
     * @param relatedEntityName The name of the entity being referenced
     * @returns The name of the foreign key field
     * @throws Error if the foreign key field cannot be found
     */
    protected GetForeignKeyName(entityName: string, relatedEntityName: string): string {
        const f = this.GetForeignKey(entityName, relatedEntityName);
        return f.Name;
    }
    /**
     * Helper method that returns the EntityFieldInfo object for the foreign key field
     * in the specified entity that links to the related entity. Provides full field metadata.
     * @param entityName The name of the entity containing the foreign key
     * @param relatedEntityName The name of the entity being referenced
     * @returns The EntityFieldInfo object for the foreign key field
     * @throws Error if the entity or foreign key field cannot be found
     */
    protected GetForeignKey(entityName: string, relatedEntityName: string): EntityFieldInfo {
        // find a foreign key field that links the entity to the related entity
        const md = new Metadata();
        const e = md.EntityByName(entityName);
        if (!e)
            throw new Error(`Could not find entity "${entityName}". Verify the entity name is correct and includes any required prefix (e.g., "MJ: ").`);

        // now find the field in e that matches the related entity
        const field = e.Fields.find(f => f.RelatedEntity === relatedEntityName);
        if (!field) {
            const fkFields = e.Fields.filter(f => f.RelatedEntity && f.RelatedEntity.length > 0);
            const available = fkFields.length > 0
                ? fkFields.map(f => `${f.Name} -> ${f.RelatedEntity}`).join(', ')
                : '(none)';
            throw new Error(
                `Could not find a foreign key field in entity "${entityName}" that links to "${relatedEntityName}". ` +
                `Available FK fields: [${available}]. ` +
                `Check if the entity name in DisplayComponentConfiguration JSON needs updating (e.g., adding "MJ: " prefix).`
            );
        }

        return field;
    }

    /**
     * Factory method that dynamically instantiates the correct RelatedEntityDisplayComponentGeneratorBase
     * subclass based on the relationship configuration. Uses the MemberJunction class factory
     * to resolve and create the appropriate component generator.
     * @param relationshipInfo The relationship metadata containing display component configuration
     * @param contextUser User context for database interactions and permission checking
     * @param params Additional parameters passed to the component constructor
     * @returns Promise resolving to the appropriate component generator instance
     * @throws Error if the specified display component cannot be found or instantiated
     */
    public static async GetComponent(relationshipInfo: EntityRelationshipInfo, contextUser: UserInfo, ...params: any[]): Promise<RelatedEntityDisplayComponentGeneratorBase> {
        let key = "EntityDataGrid"; // default key/name of component
        if (relationshipInfo.DisplayComponentID && relationshipInfo.DisplayComponentID.length > 0) {
            // get the component from the component info provided
            await TypeTablesCache.Instance.Config(false, contextUser);
            const component = TypeTablesCache.Instance.EntityRelationshipDisplayComponents.find(x => UUIDsEqual(x.ID, relationshipInfo.DisplayComponentID));
            if (component) {
                key = component.Name;
            }
            else
                throw new Error(`Could not find the DisplayComponent with ID ${relationshipInfo.DisplayComponentID}`);
        }

        // check to see if we have an existing entry in our component instance map, if so use that, otherwise create a new component, add to map, and return
        let instance = RelatedEntityDisplayComponentGeneratorBase._componentInstanceMap.get(key);
        if(instance){
            return instance;
        }
        else {
            // if we get here that means we have the key we need to use so get the component built
            const component = MJGlobal.Instance.ClassFactory.CreateInstance<RelatedEntityDisplayComponentGeneratorBase>(RelatedEntityDisplayComponentGeneratorBase, key, params);
            if(component){
                RelatedEntityDisplayComponentGeneratorBase._componentInstanceMap.set(key, component);
                return component;
            }
            else{
                throw new Error(`Could not create the component with key ${key}`);
            }
        }
    }

    /**
     * Internal cache map storing component instances by their key/name to avoid
     * recreating the same component multiple times during code generation
     */
    private static _componentInstanceMap: Map<string, RelatedEntityDisplayComponentGeneratorBase> = new Map<string, RelatedEntityDisplayComponentGeneratorBase>();

    /**
     * Returns the configuration type class used by this component generator.
     * Each subclass should return their specific configuration class type.
     * @returns The ComponentConfigBase subclass used for configuration
     */
    public abstract get ConfigType(): ComponentConfigBase;
}