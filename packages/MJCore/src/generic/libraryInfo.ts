import { BaseInfo } from "./baseInfo"

/**
 * Metadata about a single library that's available for code generation or other purposes.
 */
export class LibraryInfo extends BaseInfo {
    /**
     * Name of the library - used for import statements and within package.json
     */
    public Name: string = null;
    /**
     * User readable/AI readable description of the library
     */
    public Description: string = null;
    /**
     * Only Active libraries are used for new code generation but disabling a library means it won't be used for new code generation, but doesn't remove it from use from previously generated code.
     */
    public Status: 'Pending' | 'Active' | 'Disabled' = null;
    /**
     * Comma-delimted list of items that are exported from the library such as classes, functions, types, etc.
     */
    public ExportedItems: string = null;
    /**
     * Code definitions for the types that are exported from the library
     */
    public TypeDefinitions: string = null;
    /**
     * Sample code that demonstrates how to use the library
     */
    public SampleCode: string = null;
    CreatedAt: Date = null
    UpdatedAt: Date = null

    // virtual fields - returned by the database VIEW
    Parent: string = null

    constructor(initData: any = null) {
        super();
        if (initData) {
            this.copyInitData(initData);
        }
    }
}
