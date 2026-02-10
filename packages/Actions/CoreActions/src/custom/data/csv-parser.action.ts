import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import * as Papa from "papaparse";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that parses CSV data into structured JSON format
 * Supports multiple input sources, custom delimiters, and various parsing options
 * 
 * @example
 * ```typescript
 * // Parse CSV with headers
 * await runAction({
 *   ActionName: 'CSV Parser',
 *   Params: [{
 *     Name: 'CSVData',
 *     Value: 'Name,Age,City\nJohn,30,NYC\nJane,25,LA'
 *   }]
 * });
 * 
 * // Parse CSV from URL with custom delimiter
 * await runAction({
 *   ActionName: 'CSV Parser',
 *   Params: [{
 *     Name: 'FileURL',
 *     Value: 'https://example.com/data.csv'
 *   }, {
 *     Name: 'Delimiter',
 *     Value: ';'
 *   }]
 * });
 * 
 * // Parse CSV without headers
 * await runAction({
 *   ActionName: 'CSV Parser',
 *   Params: [{
 *     Name: 'CSVData',
 *     Value: 'John,30,NYC\nJane,25,LA'
 *   }, {
 *     Name: 'HasHeaders',
 *     Value: false
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "CSV Parser")
export class CSVParserAction extends BaseFileHandlerAction {
    
    /**
     * Parses CSV data into JSON format
     * 
     * @param params - The action parameters containing:
     *   - CSVData: String containing CSV data (direct input)
     *   - FileID: UUID of MJ Storage file (alternative)
     *   - FileURL: URL of CSV file (alternative)
     *   - HasHeaders: Boolean indicating if first row contains headers (default: true)
     *   - Delimiter: Field delimiter character (default: ",")
     *   - QuoteChar: Character used to quote fields (default: '"')
     *   - EscapeChar: Character used to escape quotes (default: '"')
     *   - SkipEmptyRows: Skip empty rows (default: true)
     *   - TrimValues: Trim whitespace from values (default: true)
     *   - DynamicTyping: Convert numeric strings to numbers (default: true)
     *   - MaxRows: Maximum number of rows to parse (optional)
     * 
     * @returns Parsed CSV data as array of objects (if headers) or array of arrays
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            // Get file content from various sources
            const fileContent = await this.getFileContent(params, 'csvdata');
            
            // Get parsing options
            const hasHeaders = this.getBooleanParam(params, 'hasheaders', true);
            const delimiter = this.getParamValue(params, 'delimiter') || ',';
            const quoteChar = this.getParamValue(params, 'quotechar') || '"';
            const escapeChar = this.getParamValue(params, 'escapechar') || '"';
            const skipEmptyRows = this.getBooleanParam(params, 'skipemptyrows', true);
            const trimValues = this.getBooleanParam(params, 'trimvalues', true);
            const dynamicTyping = this.getBooleanParam(params, 'dynamictyping', true);
            const maxRows = this.getNumericParam(params, 'maxrows', 0);

            // Validate delimiter
            if (delimiter.length !== 1) {
                return {
                    Success: false,
                    Message: "Delimiter must be a single character",
                    ResultCode: "INVALID_DELIMITER"
                };
            }

            // Convert Buffer to string if necessary
            const csvString = typeof fileContent.content === 'string' 
                ? fileContent.content 
                : fileContent.content.toString();

            // Parse CSV using PapaParse
            const parseResult = Papa.parse(csvString, {
                header: hasHeaders,
                delimiter: delimiter,
                quoteChar: quoteChar,
                escapeChar: escapeChar,
                skipEmptyLines: skipEmptyRows ? 'greedy' : false,
                dynamicTyping: dynamicTyping,
                preview: maxRows > 0 ? maxRows : undefined,
                transform: (value: string, field: string | number) => {
                    return trimValues ? value.trim() : value;
                }
            });

            // Check for parsing errors
            if (parseResult.errors && parseResult.errors.length > 0) {
                const errorMessages = parseResult.errors.map(e => 
                    `Row ${e.row !== undefined ? e.row + 1 : 'unknown'}: ${e.message}`
                ).join('; ');
                
                return {
                    Success: false,
                    Message: `CSV parsing errors: ${errorMessages}`,
                    ResultCode: "PARSE_ERROR"
                };
            }

            // Prepare result
            const result = {
                data: parseResult.data,
                rowCount: parseResult.data.length,
                columnCount: hasHeaders && parseResult.data.length > 0 
                    ? Object.keys(parseResult.data[0] as object).length 
                    : (parseResult.data.length > 0 ? (parseResult.data[0] as any[]).length : 0),
                hasHeaders: hasHeaders,
                source: fileContent.source,
                fileName: fileContent.fileName,
                delimiter: delimiter
            };

            // Add column info if headers are present
            if (hasHeaders && parseResult.data.length > 0) {
                result['columns'] = Object.keys(parseResult.data[0] as object);
            }

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(result, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to parse CSV: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }
}