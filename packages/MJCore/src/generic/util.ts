import { LogError } from "./logging";

export function TypeScriptTypeFromSQLType(sqlType: string): string {
    switch (sqlType.trim().toLowerCase()) {
        case 'text':
        case 'char':
        case 'varchar':
        case 'ntext':
        case 'nchar':
        case 'nvarchar':
        case 'uniqueidentifier': //treat this as a string
            return 'string';
        case 'datetime':
        case 'datetime2':
        case 'datetimeoffset':
        case 'date':
        case 'time':
            return 'Date';
        case 'bit':
            return 'boolean';
        default:
            return 'number';      
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
        case 'datetime':
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

export function CommonStopWords(): string[] {
    return _stopwords;
}

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
