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
                        (this as Record<string, unknown>)[key] = trueDefault;
                    }
                    else {
                        (this as Record<string, unknown>)[key] = initData[key];
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

    /**
     * Default JSON serialization for BaseInfo subclasses.
     *
     * Emits all non-underscored direct field declarations. For `_`-prefixed private backing fields
     * (the MJ pattern for collection storage — e.g. `_Fields`, `_RelatedEntities`, `_OrganicKeys`),
     * emits the value of the corresponding same-named public getter instead. Purely computed getters
     * without a backing field (display-name formatters, derived flags) are intentionally skipped —
     * they can throw when source fields are null and don't belong on the wire anyway.
     *
     * Nested BaseInfo instances and arrays of them unwrap automatically via JSON.stringify's
     * native toJSON() protocol.
     *
     * Subclasses may override to emit a filtered subset or custom shape (see EntityFieldValueInfo).
     */
    toJSON(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        const self = this as unknown as Record<string, unknown>;

        for (const key of Object.keys(this)) {
            if (!key.startsWith('_')) {
                result[key] = self[key];
                continue;
            }
            // Private backing field — expose via its public getter if one exists with the same name minus the underscore
            const publicKey = key.slice(1);
            if (!publicKey) continue;
            let proto = Object.getPrototypeOf(this);
            while (proto && proto !== Object.prototype) {
                const desc = Object.getOwnPropertyDescriptor(proto, publicKey);
                if (desc && typeof desc.get === 'function') {
                    result[publicKey] = self[publicKey];
                    break;
                }
                proto = Object.getPrototypeOf(proto);
            }
        }

        return result;
    }
}