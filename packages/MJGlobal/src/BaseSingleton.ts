import { GetGlobalObjectStore } from ".";

/**
 * Generic, abstract base class for any scenario where we want to use a Singleton pattern. This base class abstracts away the complexity of ensuring a truly global 
 * singleton instance across multiple code paths in a deployed application. It uses a Global Object Store to ensure that only one instance of the class exists in the application even
 * if the class has code imported into multiple execution paths (which is not optimal, of course, but can occur in some situations).
 */
export abstract class BaseSingleton<T> {
    private _globalKey: string;
    public get GlobalKey(): string {
        return this._globalKey;
    }
    protected constructor(globalKey: string) {
        this._globalKey = globalKey;
        const g = GetGlobalObjectStore();

        if (g && g[this.GlobalKey]) {
            return g[this.GlobalKey];
        }

        // If we get here, we are the first instance of this class
        if (g) {
            g[this.GlobalKey] = this;
        }
    }

    protected static getInstance<T extends BaseSingleton<any>>(this: new () => T, globalKey: string): T {
        const g = GetGlobalObjectStore();
        if (!g[globalKey]) {
            g[globalKey] = new this();
        }
        return g[globalKey];
    }

    /**
     * The Global Object Store is a place to store global objects that need to be shared across the application. Depending on the execution environment, this could be the window object in a browser, or the global object in a node environment, or something else in other contexts. The key here is that in some cases static variables are not truly shared
     * because it is possible that a given class might have copies of its code in multiple paths in a deployed application. This approach ensures that no matter how many code copies might exist, there is only one instance of the object in question by using the Global Object Store.
     * @returns 
     */
    public GetGlobalObjectStore() {
        return GetGlobalObjectStore();
    }
}