import { UserInfo } from "@memberjunction/core";
import { Parser, Nodes, Lexer, Context } from 'nunjucks'; // Assuming these types exist in the Nunjucks TypeScript definitions

// Define the type for the callback function
export type NunjucksCallback = (err: Error | null, result?: any) => void;

/**
 * Used for extending the functionality of the template engine (Nunjucks). Sub-class this class to create a new template extension.
 */
export abstract class TemplateExtensionBase {
    /**
     * One or more tags that represent case-sensitive tag names that will invoke this extension.
     */
    public tags: string[] = [];

    public get ContextUser(): UserInfo {
        return this._contextUser;
    }
    private _contextUser: UserInfo;

    constructor(contextUser: UserInfo) {
        this._contextUser = contextUser;
    }

    /**
     * Required, must implement this method to parse the template and return the results of a call to nodes.CallExtensionAsync()
     * @param parser 
     * @param nodes 
     * @param lexer 
     */
    public abstract parse(parser: Parser, nodes: Nodes, lexer: Lexer): any
    /**
     * Required, must implement this method to run the extension.
     */
    public abstract run(context: Context, body: any, errorBody: any, params: any, callBack: NunjucksCallback);
}