import { LogError } from "./logging";

/**
 * Returns the TypeScript type that corresponds to the SQL type passed in
 */
export function TypeScriptTypeFromSQLType(sqlType: string): 'string' | 'number' | 'boolean' | 'Date' {
    switch (sqlType.trim().toLowerCase()) {
        case 'text':
        case 'char':
        case 'varchar':
        case 'ntext':
        case 'nchar':
        case 'nvarchar':
        case 'uniqueidentifier': //treat this as a string
        case 'uuid': // PostgreSQL UUID type
        case 'bytea': // PostgreSQL binary data, treat as string (base64)
            return 'string';
        case 'datetime':
        case 'datetime2':
        case 'datetimeoffset':
        case 'date':
        case 'time':
        case 'timestamp': // PostgreSQL timestamp
        case 'timestamptz': // PostgreSQL timestamp with time zone
        case 'timestamp with time zone': // PostgreSQL full type name
        case 'timestamp without time zone': // PostgreSQL full type name
            return 'Date';
        case 'bit':
        case 'boolean': // PostgreSQL boolean type
            return 'boolean';
        default:
            return 'number';      
    }
}

export function TypeScriptTypeFromSQLTypeWithNullableOption(sqlType: string, addNullableOption: boolean): 'string' | 'string | null' | 'number' | 'number | null' | 'boolean' | 'boolean | null' | 'Date' | 'Date | null' {
    const retVal = TypeScriptTypeFromSQLType(sqlType);
    if (addNullableOption) {
        return retVal + ' | null' as 'string | null' | 'number | null' | 'boolean | null' | 'Date | null';
    }
    else {
        return retVal;
    }
}


/**
 * Formats a value based on the parameters passed in
 * @param sqlType - Required - the base type in SQL Server, for example int, nvarchar, etc. For types that have a length like numeric(28,4) or nvarchar(50) do NOT provide the length, just numeric and nvarchar in those examples
 * @param value - Value to format
 * @param decimals Number of decimals to show, defaults to 2
 * @param currency Currency to use when formatting, defaults to USD
 * @param maxLength Maximum length of the string to return, if the formatted value is longer than this length then the string will be truncated and the trailingChars will be appended to the end of the string 
 * @param trailingChars Only used if maxLength is > 0 and the string being formatted is > maxLength, this is the string that will be appended to the end of the string to indicate that it was truncated, defaults to "..."
 * @returns either the original string value or a formatted version. If the format cannot be applied an an exception occurs it is captured and the error is put to the log, and the original value is returned
 */
export function FormatValue(sqlType: string, 
                            value: any, 
                            decimals: number = 2, 
                            currency: string = 'USD', 
                            maxLength: number = 0, 
                            trailingChars: string = "..."): string {
    try {
        const retVal = FormatValueInternal(sqlType, value, decimals, currency, maxLength, trailingChars);
        if (maxLength > 0 && retVal && retVal.length > maxLength)
            return retVal.substring(0, maxLength) + trailingChars;
        else
            return retVal;
    }
    catch (e) {
        LogError(`Error formatting value ${value} of type ${sqlType} with decimals ${decimals} and currency ${currency}`, e);
        return value; // just return the value as is if we cant format it
    }
}

// internal only function used by FormatValue() to do the actual formatting
function FormatValueInternal(sqlType: string, 
                             value: any, 
                             decimals: number = 2, 
                             currency: string = 'USD', 
                             maxLength: number = 0, 
                             trailingChars: string = "...") {
    if (value === null || value === undefined) {
        return value;
    }

    switch (sqlType.trim().toLowerCase()) {
        case 'money':
            if (isNaN(value))
                return value;
            else
                return new Intl.NumberFormat(undefined, { style: 'currency', 
                                                    currency: currency, 
                                                    minimumFractionDigits: decimals, 
                                                    maximumFractionDigits: decimals}).format(value);
        case 'date':
        case 'time':
        case 'datetime':
        case 'datetime2':
        case 'datetimeoffset':
          let date = new Date(value);
          return new Intl.DateTimeFormat().format(date);
        case 'decimal':
        case 'real':
        case 'float':
          return new Intl.NumberFormat(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
        case 'int':
          return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
        case 'percent':
          return new Intl.NumberFormat(undefined, { style: 'percent', 
                                                    minimumFractionDigits: decimals, 
                                                    maximumFractionDigits: decimals}).format(value);
        default:
          return value;
    }    
}


/**
 * Returns a string that contains the full SQL type including length, precision and scale if applicable
 * @param baseType 
 * @param length 
 * @param precision 
 * @param scale 
 * @returns 
 */
export function SQLFullType(baseType: string, length: number, precision: number, scale: number): string {
    const type = baseType.trim().toLowerCase();
    let sOutput: string = type;
    if (type === 'varchar' )
        sOutput += `(${length > 0 ? length : 'MAX'})`;
    else if (type === 'nvarchar')
        sOutput += `(${length > 0 ? length / 2 : 'MAX'})`; // nvarchar divide the system length by 2 to get the actual length for the output
    else if (type === 'char')
        sOutput += `(${length})`;
    else if (type === 'nchar')
        sOutput += `(${length / 2})`; // nchar divide the system length by 2 to get the actual length for the output
    else if (type === 'decimal' || type === 'numeric')
        sOutput += `(${precision}, ${scale})`;
    else if (type === 'float')
        sOutput += `(${precision})`;

    return sOutput;
}

/**
 * This function determines the actual maximum length for a given SQL field based on the base type and the length specified in the schema. 
 * For example, for a varchar(50) field, the length is 50, for an nvarchar(50) field, the length is 50/2 = 25
 * @param sqlBaseType 
 * @param sqlLength 
 * @returns 
 */
export function SQLMaxLength(sqlBaseType: string, sqlLength: number): number {
    switch (sqlBaseType.trim().toLowerCase()) {
        case 'varchar':
        case 'char':
        case 'text':
            return sqlLength;
        case 'nvarchar':
        case 'nchar':
        case 'ntext':
            return sqlLength / 2; // length in the schema is the # of bytes and on unicode fields we divide by 2 to get the # of characters a user is allowed to put in.
        default:
            return 0;
    }
}

const _stopwords = [
    "a", "about", "above", "after", "again", "against", "ain", "all", "am", "an", "and", "any", "are", "aren", "aren't", "as", "at",
    "be", "because", "been", "before", "being", "below", "between", "both", "but", "by",
    "can", "couldn", "couldn't", "could",
    "d", "did", "didn", "didn't", "do", "does", "doesn", "doesn't", "doing", "don", "don't", "down", "during",
    "each",
    "few", "for", "from", "further",
    "had", "hadn", "hadn't", "has", "hasn", "hasn't", "have", "haven", "haven't", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how",
    "i", "if", "in", "into", "is", "isn", "isn't", "it", "it's", "its", "itself",
    "just",
    "ll",
    "m", "ma", "me", "mightn", "mightn't", "more", "most", "mustn", "mustn't", "my", "myself",
    "needn", "needn't", "no", "nor", "not", "now",
    "o", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own",
    "re",
    "s", "same", "shan", "shan't", "she", "she's", "should", "should've", "shouldn", "shouldn't", "so", "some", "such",
    "t", "than", "that", "that'll", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too",
    "under", "until", "up",
    "ve", "very",
    "was", "wasn", "wasn't", "we", "were", "weren", "weren't", "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "won", "won't", "wouldn", "wouldn't",
    "y", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
];

/**
 * This function returns an array of common stop words that are used in text processing
 * @returns An array of common stop words that are used in text processing
 */
export function CommonStopWords(): string[] {
    return _stopwords;
}

/**
 * This function takes a string and removes common stop words from it, using the CommonStopWords() function to get the list of stop words
 * @param inputString 
 * @returns 
 */
export function StripStopWords(inputString: string): string {
    const stopwordPattern = new RegExp(`\\b(${_stopwords.join('|')})\\b`, 'gi');
    let outputString = inputString.replace(stopwordPattern, '');
    outputString = outputString.replace(/ +/g, ' ');  // Replace multiple spaces with a single space
    return outputString;
}


/**
 * Returns a system-wide standard CodeName which is a programmatically acceptable identifier for a class, variable, etc using a standard replacement strategy for characters that are not acceptable in that context from a regular name
 */
export function CodeNameFromString(input: string): string {
    // the code below replaces characters invalid for SQL or TypeScript identifiers with _ and stashes the result in a private variable so we only do this once
    // Replace all invalid characters with _
    let codeName = input.replace(/[^a-zA-Z0-9_]/g, "_");

    // Prepend an underscore if the first character is a number
    if (/^[0-9]/.test(codeName)) {
        codeName = "_" + codeName;
    }
    return codeName;
}

/**
 * Run concurrent promises with a maximum concurrency level
 * @param concurrency - The number of concurrently running promises
 * @param funcs - An array of functions that return promises
 * @returns A promise that resolves to an array of the resolved values from the promises returned by funcs
 */
export function Concurrent<V>(concurrency: number, funcs: (() => Promise<V>)[]): Promise<V[]> {
  return new Promise((resolve, reject) => {
    let index = -1;
    const p: Promise<V>[] = [];
    for (let i = 0; i < Math.max(1, Math.min(concurrency, funcs.length)); i++) runPromise();
    function runPromise() {
      if (++index < funcs.length) (p[p.length] = funcs[index]()).then(runPromise).catch(reject);
      else if (index === funcs.length) Promise.all(p).then(resolve).catch(reject);
    }
  });
}

/**
 * The DBMS may store the default value for a column with extra parens, for example ((1)) or (getdate()) or (('Pending')) or (('Active')) and in addition for unicode characters
 * it may prefix the value with an N, for example N'Active'. This function will strip out the extra parens and the N prefix if it exists and return the actual default value
 * @param storedDefaultValue - The default value as stored in the DBMS 
 */
export function ExtractActualDefaultValue(storedDefaultValue: string): string {
    if (!storedDefaultValue || storedDefaultValue.trim().length === 0)
        return storedDefaultValue;

    const noParens = StripContainingParens(storedDefaultValue);
    const unicodeStripped = StripUnicodePrefix(noParens);

    // now, we need to see if the unicodeStripped value is exactly equal to NULL which should be treated 
    // as the same as no default value. Without checking this, string data types that have a DEFAULT set to NULL
    // which is the same as no default, will end up with a STRING 'null' in the default value, but that isn't the
    // intent. 
    // BY CHECKING this BEFORE we strip the single quotes, we allow for a string of 'NULL', 'null' etc to exist
    // in a string data type's default value. As odd as that might be for a string default value it should be allowed
    if (unicodeStripped.trim().toLowerCase() === 'null') {
        return null;  // return the actual TypeScript/JavaScript null here as opposed to a string
    }
    else {
        // our unicodeStripped value is NOT equal to exact match of null, so whatever we have is what we use
        // but we strip single quotes now
        const finalValue = StripSingleQuotes(unicodeStripped);

        return finalValue;    
    }
}


/**
 * Strips out the N prefix and single quotes from a string if they exist so that a value like
 * N'Active' becomes Active
 */
export function StripUnicodePrefix(value: string): string {
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

/**
 * Strips out single quotes from a string if they exist so that a value like
 * 'Active' becomes Active
 * @param value 
 * @returns 
 */
export function StripSingleQuotes(value: string): string {
    if (!value) return value;

    const val = value.trim(); // trim it first

    // now check for symmetrical single quotes and remove them
    // this is for cases like 'Pending' or 'Active' which are stored in the DB as ('Pending') or ('Active')
    return val.startsWith("'") && val.endsWith("'") ? val.substring(1, val.length - 1) : val;
}


/**
 * Strips out any number of symmetric containing parens from a string, for example ((0)) becomes 0
 * and ('Active') becomes 'Active'
 * @param value 
 * @returns 
 */
export function StripContainingParens(value: string): string {
    if (value.startsWith('(') && value.endsWith(')')) {
        // recursive call so if we have ((0)) we keep stripping parens until we get to inner value
        // could be something like (getdate()) in which case we'll only strip the SYMMENTRIC parens
        return StripContainingParens(value.substring(1, value.length - 1));
    }
    return value;
}