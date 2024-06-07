export abstract class BaseInfo {
    /**
     * Primary Key
     */
    ID: number = null

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
                        const noParens = this.stripContainingParens(initialValue);
                        const unicodeStripped = this.stripUnicodePrefix(noParens);
                        const finalValue = this.stripSingleQuotes(unicodeStripped);
                        this[keys[j]] = finalValue;
                    }
                    else
                        this[keys[j]] = initData[keys[j]];
                }
            }
        }
    }

    protected stripUnicodePrefix(value: string): string {
        if (!value){
            return value;
        }

        value = value.trim(); // trim it first

        // check to see if the first character is an N and if the character after
        // that as well as the last character are single quotes, if so, strip all of those out
        if (value && value.toUpperCase().startsWith('N') &&
            value.length > 1 && value.charAt(1) === '\'' && 
            value.charAt(value.length - 1) === '\'') {
            return value.substring(2, value.length - 1); // strip out the N and the single quotes for example N'Active' becomes Active
        }

        return value;
    }

    protected stripSingleQuotes(value: string): string {
        if (!value) return value;

        const val = value.trim(); // trim it first

        // now check for symmetrical single quotes and remove them
        // this is for cases like 'Pending' or 'Active' which are stored in the DB as ('Pending') or ('Active')
        return val.startsWith("'") && val.endsWith("'") ? val.substring(1, val.length - 1) : val;
    }

    protected stripContainingParens(value: string): string {
        if (value.startsWith('(') && value.endsWith(')')) {
            // recursive call so if we have ((0)) we keep stripping parens until we get to inner value
            // could be something like (getdate()) in which case we'll only strip the SYMMENTRIC parens
            return this.stripContainingParens(value.substring(1, value.length - 1));
        }
        return value;
    }
}