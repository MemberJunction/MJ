import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseFileHandlerAction } from "../utilities/base-file-handler";
import * as archiver from "archiver";
import * as unzipper from "unzipper";
import { Readable } from "stream";
import { JSONParamHelper } from "../utilities/json-param-helper";
import { BaseAction } from '@memberjunction/actions';

/**
 * Action that compresses or decompresses files
 * Supports ZIP format with various compression levels
 * 
 * @example
 * ```typescript
 * // Compress multiple files into ZIP
 * await runAction({
 *   ActionName: 'File Compress',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'compress'
 *   }, {
 *     Name: 'Files',
 *     Value: [
 *       { name: 'report.pdf', data: pdfBase64Data },
 *       { name: 'data.csv', data: csvData }
 *     ]
 *   }]
 * });
 * 
 * // Decompress ZIP file
 * await runAction({
 *   ActionName: 'File Compress',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'decompress'
 *   }, {
 *     Name: 'FileURL',
 *     Value: 'https://example.com/archive.zip'
 *   }]
 * });
 * 
 * // Compress with options
 * await runAction({
 *   ActionName: 'File Compress',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'compress'
 *   }, {
 *     Name: 'Files',
 *     Value: filesArray
 *   }, {
 *     Name: 'CompressionLevel',
 *     Value: 9
 *   }, {
 *     Name: 'OutputFileID',
 *     Value: true
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "File Compress")
export class FileCompressAction extends BaseFileHandlerAction {
    
    /**
     * Compresses or decompresses files
     * 
     * @param params - The action parameters containing:
     *   - Operation: "compress" | "decompress" (required)
     *   - For compress:
     *     - Files: Array of file objects with { name: string, data: string/Buffer }
     *     - CompressionLevel: 0-9 (default: 6, 0=store only, 9=maximum compression)
     *     - Format: "zip" (currently only ZIP supported)
     *   - For decompress:
     *     - FileID/FileURL/Data: Input compressed file
     *   - OutputFileID: Save result to MJ Storage (optional)
     *   - FileName: Name for output file (default: 'archive.zip' or 'extracted_files.json')
     * 
     * @returns Compressed/decompressed data
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const operation = (this.getParamValue(params, 'operation') || '').toLowerCase();
            
            if (!['compress', 'decompress'].includes(operation)) {
                return {
                    Success: false,
                    Message: "Operation must be 'compress' or 'decompress'",
                    ResultCode: "INVALID_OPERATION"
                };
            }

            if (operation === 'compress') {
                return await this.compress(params);
            } else {
                return await this.decompress(params);
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to ${this.getParamValue(params, 'operation')} files: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "OPERATION_FAILED"
            };
        }
    }

    /**
     * Compress files
     */
    private async compress(params: RunActionParams): Promise<ActionResultSimple> {
        let files: any[];
        try {
            files = JSONParamHelper.getRequiredJSONParam(params, 'files');
        } catch (error) {
            return {
                Success: false,
                Message: error instanceof Error ? error.message : String(error),
                ResultCode: "MISSING_FILES"
            };
        }
        
        const compressionLevel = this.getNumericParam(params, 'compressionlevel', 6);
        const format = (this.getParamValue(params, 'format') || 'zip').toLowerCase();
        const outputFileId = this.getParamValue(params, 'outputfileid');
        const fileName = this.getParamValue(params, 'filename') || 'archive.zip';

        if (!Array.isArray(files) || files.length === 0) {
            return {
                Success: false,
                Message: "Files must be a non-empty array",
                ResultCode: "INVALID_FILES"
            };
        }

        // Validate compression level
        if (compressionLevel < 0 || compressionLevel > 9) {
            return {
                Success: false,
                Message: "CompressionLevel must be between 0 and 9",
                ResultCode: "INVALID_COMPRESSION_LEVEL"
            };
        }

        // Currently only support ZIP
        if (format !== 'zip') {
            return {
                Success: false,
                Message: "Currently only 'zip' format is supported",
                ResultCode: "UNSUPPORTED_FORMAT"
            };
        }

        // Create archive
        const archive = archiver('zip', {
            zlib: { level: compressionLevel }
        });

        const chunks: Buffer[] = [];
        archive.on('data', (chunk) => chunks.push(chunk));

        // Add files to archive
        for (const file of files) {
            if (!file.name) {
                return {
                    Success: false,
                    Message: "Each file must have a 'name' property",
                    ResultCode: "INVALID_FILE_DEFINITION"
                };
            }

            let fileData: Buffer;
            if (typeof file.data === 'string') {
                // Check if base64
                if (this.isBase64(file.data)) {
                    fileData = Buffer.from(file.data, 'base64');
                } else {
                    fileData = Buffer.from(file.data);
                }
            } else if (Buffer.isBuffer(file.data)) {
                fileData = file.data;
            } else {
                return {
                    Success: false,
                    Message: `Invalid data type for file '${file.name}'`,
                    ResultCode: "INVALID_FILE_DATA"
                };
            }

            archive.append(fileData, { name: file.name });
        }

        // Finalize archive
        await archive.finalize();
        const buffer = Buffer.concat(chunks as unknown as Uint8Array[]);

        // Save to storage if requested
        if (outputFileId) {
            try {
                const fileId = await this.saveToMJStorage(
                    buffer,
                    fileName,
                    'application/zip',
                    params
                );
                
                params.Params.push({
                    Name: 'CompressedFileID',
                    Type: 'Output',
                    Value: fileId
                });

                return {
                    Success: true,
                    ResultCode: "SUCCESS_SAVED",
                    Message: JSON.stringify({
                        message: "Files compressed and saved successfully",
                        fileId: fileId,
                        fileName: fileName,
                        filesCompressed: files.length,
                        compressionLevel: compressionLevel,
                        compressedSize: buffer.length
                    }, null, 2)
                };
            } catch (error) {
                console.error('Failed to save to storage:', error);
            }
        }

        // Return as base64
        const base64Data = buffer.toString('base64');
        
        params.Params.push({
            Name: 'CompressedData',
            Type: 'Output',
            Value: base64Data
        });

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify({
                message: "Files compressed successfully",
                fileName: fileName,
                filesCompressed: files.length,
                compressionLevel: compressionLevel,
                compressedSize: buffer.length,
                base64Length: base64Data.length
            }, null, 2)
        };
    }

    /**
     * Decompress files
     */
    private async decompress(params: RunActionParams): Promise<ActionResultSimple> {
        // Get compressed file content
        const fileContent = await this.getFileContent(params, 'data', 'fileid', 'fileurl');
        const outputFileId = this.getParamValue(params, 'outputfileid');
        const fileName = this.getParamValue(params, 'filename') || 'extracted_files.json';

        // Convert to Buffer
        let zipBuffer: Buffer;
        if (typeof fileContent.content === 'string') {
            if (this.isBase64(fileContent.content)) {
                zipBuffer = Buffer.from(fileContent.content, 'base64');
            } else {
                zipBuffer = Buffer.from(fileContent.content, 'binary');
            }
        } else {
            zipBuffer = fileContent.content;
        }

        // Extract files
        const extractedFiles: any[] = [];
        
        try {
            const directory = await unzipper.Open.buffer(zipBuffer);
            
            for (const file of directory.files) {
                if (!file.type || file.type === 'File') {
                    const content = await file.buffer();
                    extractedFiles.push({
                        name: file.path,
                        size: file.uncompressedSize,
                        data: content.toString('base64'),
                        compressed: file.compressedSize,
                        compressionMethod: file.compressionMethod
                    });
                }
            }
        } catch (error) {
            return {
                Success: false,
                Message: `Failed to decompress file: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "DECOMPRESSION_FAILED"
            };
        }

        const result = {
            files: extractedFiles,
            totalFiles: extractedFiles.length,
            source: fileContent.source,
            sourceFileName: fileContent.fileName
        };

        // Add output parameter
        params.Params.push({
            Name: 'ExtractedFiles',
            Type: 'Output',
            Value: extractedFiles
        });

        return {
            Success: true,
            ResultCode: "SUCCESS",
            Message: JSON.stringify(result, null, 2)
        };
    }

    /**
     * Check if string is base64
     */
    private isBase64(str: string): boolean {
        try {
            return Buffer.from(str, 'base64').toString('base64') === str;
        } catch {
            return false;
        }
    }
}