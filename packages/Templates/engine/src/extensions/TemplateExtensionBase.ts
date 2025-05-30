import { UserInfo } from "@memberjunction/core";
// TODO: Add type defs based on nunjucks classes used for extensions
type Parser = any;
type Nodes = any;
type Lexer = any;
type Context = any;


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
     * 
     * **IMPORTANT**: The actual signature of this method depends on what you pass to 
     * `nodes.CallExtensionAsync()` in your `parse()` method. The parameters listed here
     * are just placeholders - your actual implementation will have different parameters.
     * 
     * **Common Patterns:**
     * - `CallExtensionAsync(this, 'run', params)` → `run(context, body, callBack)`
     * - `CallExtensionAsync(this, 'run', params, [body])` → `run(context, params, body, callBack)`
     * - `CallExtensionAsync(this, 'run', params, [body, error])` → `run(context, params, body, error, callBack)`
     * 
     * @param context - Always the first parameter: Nunjucks rendering context
     * @param callBack - Always the last parameter: Async callback for results/errors
     * @param ...rest - Middle parameters determined by CallExtensionAsync array argument
     * 
     * @see README.md in this directory for detailed documentation on parameter mapping
     */
    public abstract run(context: Context, ...args: any[]);
}