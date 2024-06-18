import { EntityInfo, EntityRelationshipInfo, UserInfo } from "@memberjunction/core";
import { TypeTablesCache } from "@memberjunction/core-entities";
import { MJGlobal } from "@memberjunction/global";

/**
 * Represents info on an Angular class that is used in the generated code
 */
export class AngularComponentInfo {
    /**
     * The typescript class name for the component
     */
    public ClassName: string;
    /**
     * The name of the module so it can be properly imported by the generated module
     */
    public ModuleName: string; 
    /**
     * The Angular selector name for the component
     */
    public AngularSelectorName: string;
}

/**
 * Classes that generate Angular code must return this type
 */
export class GenerationResult {
    /**
     * Was the generation successful?
     */
    Success: boolean;
    /**
     * If generation was not successful, this will contain the error message
     */
    ErrorMessage?: string;
    /**
     * This is the HTML/Angular template code that will be used by the caller in generating the final Angular component
     */
    TemplateOutput: string;
    /**
     * Optional, TypeScript code that will be injected into the class definition for the Angular component. This is useful for adding additional methods or properties to the component
     */
    CodeOutput?: string;
    /**
     * A reference to the component that generated the output. Useful for accessing the properties of the component later on for imports/etc
     */
    Component: RelatedEntityDisplayComponentGeneratorBase;
}

/**
 * Properties needed for the Generate() method to execute
 */
export class GenerationInput {
    /**
     * The entity that is the primary entity
     */
    Entity: EntityInfo;
    /**
     * Relationship Information for this component
     */
    RelationshipInfo: EntityRelationshipInfo;
    /**
     * The name of the tab on a multi-tabbed interface, this is often provided but not mandatory. Use it if it makes sense for your component and 
     * it is most commonly used to defer loading by using the IsCurrentTab() method from the BaseFormComponent that all of the generated components inherit from
     */
    TabName: string;
}


/**
 * Base Class that is responsible for generating the Angular template code for the related entity display component.
 * 
 * The built-in functionality within the {@link BaseFormComponent} can be used in the Angular template without any changes since the generated code will be injected
 * into the Angular template of a sub-class of {@link BaseFormComponent}. If you need additional code to be added to the sub-class on the TypeScript side, you can
 * provide that in the optional `CodeOutput` property of the `GenerationResult` object that is returned by the `Generate` method.
 * 
 * Some of the commonly used methods/properties of the {@link BaseFormComponent} that can be used in the Angular template are below. Check out the documentation in the `@memberjunction/ng-base-forms` package and the
 * {@link BaseFormComponent} class for more details.
 * 
 * * {@link BaseFormComponent#BuildRelationshipViewParamsByEntityName BuildRelationshipViewParamsByEntityName}
 * * {@link BaseFormComponent#NewRecordValues NewRecordValues}
 * * {@link BaseFormComponent#IsCurrentTab IsCurrentTab}
 * * {@link BaseFormComponent#GridEditMode GridEditMode}
 * * {@link BaseFormComponent#GridBottomMargin GridBottomMargin}
 * 
 * @see {@link BaseFormComponent}
 */
export abstract class RelatedEntityDisplayComponentGeneratorBase {
    /**
     * The subclass provides the package import path which can be local or from a repository such as @memberjunction/ng-user-view-grid as an example
     */
    public abstract get ImportPath(): string;
    /**
     * The subclass must define 1 or more AngularClassInfo objects that represent the Angular classes that are being used in the generated code
     */
    public abstract get ImportItems(): AngularComponentInfo[];

    /**
     * The subclass must implement this method to generate the Angular template code for the related entity display component
     * @param entity The entity that is the primary entity
     * @param relatedEntity The entity that is the related entity
     */
    public abstract Generate(input: GenerationInput): Promise<GenerationResult>;

    /**
     * Use this method to dynamically instantiate the correct RelatedEntityDisplayComponentGeneratorBase subclass based on the relationshipInfo provided
     * @param relationshipInfo The relationship info that contains the info needed to get the right component
     * @param contextUser Context user for any needed database interaction
     * @param params Provide any number of additional parameters that should be passed along to the constructor of the component
     */
    public static async GetComponent(relationshipInfo: EntityRelationshipInfo, contextUser: UserInfo, ...params: any[]): Promise<RelatedEntityDisplayComponentGeneratorBase> {
        let key = "UserViewGrid"; // default key/name of component
        if (relationshipInfo.DisplayComponentID && relationshipInfo.DisplayComponentID > 0) {
            // get the component from the component info provided
            await TypeTablesCache.Instance.Config(false, contextUser);
            const component = TypeTablesCache.Instance.EntityRelationshipDisplayComponents.find(x => x.ID === relationshipInfo.DisplayComponentID);
            if (component) {
                key = component.Name;
            }
            else
                throw new Error(`Could not find the DisplayComponent with ID ${relationshipInfo.DisplayComponentID}`);
        }

        // check to see if we have an existing entry in our component instance map, if so use that, otherwise create a new component, add to map, and return
        if (RelatedEntityDisplayComponentGeneratorBase._componentInstanceMap.has(key)) {
            return RelatedEntityDisplayComponentGeneratorBase._componentInstanceMap.get(key);
        }
        else {
            // if we get here that means we have the key we need to use so get the component built
            const component = MJGlobal.Instance.ClassFactory.CreateInstance<RelatedEntityDisplayComponentGeneratorBase>(RelatedEntityDisplayComponentGeneratorBase, key, params);
            RelatedEntityDisplayComponentGeneratorBase._componentInstanceMap.set(key, component);
            return component;
        }
    }

    private static _componentInstanceMap: Map<string, RelatedEntityDisplayComponentGeneratorBase> = new Map<string, RelatedEntityDisplayComponentGeneratorBase>();
}