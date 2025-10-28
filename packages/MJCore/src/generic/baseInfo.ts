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
            const thisKeys = Object.keys(this);
            for (let j = 0; j < keys.length; j++) {
                // make sure it is one of our keys, we don't want to create NEW fields
                if (thisKeys.indexOf(keys[j]) >= 0) {
                    if (keys[j].trim().toLowerCase() === 'defaultvalue' && initData[keys[j]]) {
                        // strip parens from default value from the DB, if they exist, for example defaults might be ((1)) or (getdate())   
                        // could also be something like (('Pending')) in which case we'll want to remove the SYMMETRIC parens
                        const initialValue: string = initData[keys[j]];
                        const trueDefault: string = ExtractActualDefaultValue(initialValue);
                        this[keys[j]] = trueDefault;
                    }
                    else
                        this[keys[j]] = initData[keys[j]];
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