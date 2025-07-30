import { ComponentSpec } from "./component-spec";

/**
 * Defines a given option for a generated component that the user can choose. The code/componentObjectName properties are used to render the component in the UI.
 */
export type ComponentOption = {
    /**
     * Full details of the generated component option including functional, technical, code, dependencies and libraries 
     */
    option: ComponentSpec;

    /**
     * If multiple component options are provided a "judge" AI will evaluate all the functional
     * responses and will rank order them with an explanation of why they were each ranked that way. Rankings are not absolute, they are relative to the
     * # of components contained within an array of ComponentOption types.  
     */
    AIRank: number | undefined;
    /**
     * The AI's explanation of why it ranked the component the way it did. This is useful for understanding the AI's reasoning and can be used to improve future components 
     * as well as provide context to the user about why a particular component was chosen as the best option.
     */
    AIRankExplanation: string | undefined;
    /**
     * The user's provided feedback on the component option. Unlike the AIRank, this is a subjective rating provided by the user and is 
     * a number between 1 and 10, where 1 is the lowest rating and 10 is the highest rating.
     */
    UserRank: number | undefined;
    /**
     * If the host application provides a way for the user to provide feedback on the component option, 
     * this is the explanation of why the user rated the component the way they did if they provided feedback.
     */
    UserRankExplanation: string | undefined;
}
