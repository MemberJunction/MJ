import { ExtractActualDefaultValue } from "./util";

/**
 * Base class for all MemberJunction metadata info classes.
 * Provides common functionality for copying initialization data and handling default values.
 * All Info classes (EntityInfo, QueryInfo, etc.) extend this base class.
 */
export abstract class BaseInfo {
    /**
     * Primary Key
     */
    ID: any = null

    /**
     * Copies initialization data from a plain object to the class instance.
     * Only copies properties that already exist on the class to prevent creating new fields.
     * Special handling for DefaultValue fields to extract actual values from SQL Server syntax.
     * @param initData - The initialization data object
     */
    protected copyInitData(initData: any) {
        if (initData) {
            // copy the properties from the init data to the new class instance we are constructing
            const keys = Object.keys(initData);
            for (let j = 0; j < keys.length; j++) {
                const key = keys[j];
                // make sure it is one of our keys, we don't want to create NEW fields
                if (Object.prototype.hasOwnProperty.call(this, key)) {
                    // fast path for exact match first, fallback to length check + lowercasing
                    if ((key === 'DefaultValue' || (key.length === 12 && key.toLowerCase() === 'defaultvalue')) && initData[key]) {
                        // strip parens from default value from the DB, if they exist, for example defaults might be ((1)) or (getdate())   
                        // could also be something like (('Pending')) in which case we'll want to remove the SYMMETRIC parens
                        const initialValue: string = initData[key];
                        const trueDefault: string = ExtractActualDefaultValue(initialValue);
                        this[key as keyof this] = trueDefault as any;
                    }
                    else {
                        this[key as keyof this] = initData[key];
                    }
                }
            }
        }
    }

    /**
     * Creates a new instance of the BaseInfo-derived class.
     * @param initData - Optional initialization data to populate the instance
     */
    constructor(initData: any = null) {
        if (initData) {
            this.copyInitData(initData);
        }
    }
}