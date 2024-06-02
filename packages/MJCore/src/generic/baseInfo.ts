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
                        const noParens = this.stripContainingParens(initData[keys[j]]);
                        // now check for symmetrical single quotes and remove them
                        // this is for cases like 'Pending' or 'Active' which are stored in the DB as ('Pending') or ('Active')
                        const finalValue = noParens.startsWith("'") && noParens.endsWith("'") ? noParens.substring(1, noParens.length - 1) : noParens;
                        this[keys[j]] = finalValue;
                    }
                    else
                        this[keys[j]] = initData[keys[j]];
                }
            }
        }
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