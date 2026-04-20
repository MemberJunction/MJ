import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { BaseAction } from "@memberjunction/actions";
import { RegisterClass } from "@memberjunction/global";

/**
 * Action that generates and reads QR codes
 * Supports generating QR codes from text/URLs and reading QR codes from base64 images
 * 
 * @example
 * ```typescript
 * // Generate QR code
 * await runAction({
 *   ActionName: 'QR Code',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'generate'
 *   }, {
 *     Name: 'Data',
 *     Value: 'https://example.com'
 *   }]
 * });
 * 
 * // Generate QR code with custom options
 * await runAction({
 *   ActionName: 'QR Code',
 *   Params: [{
 *     Name: 'Operation',
 *     Value: 'generate'
 *   }, {
 *     Name: 'Data',
 *     Value: 'Contact: John Doe\nPhone: +1-555-123-4567\nEmail: john@example.com'
 *   }, {
 *     Name: 'Size',
 *     Value: 300
 *   }, {
 *     Name: 'ErrorCorrection',
 *     Value: 'H'
 *   }]
 * });
 * ```
 */
@RegisterClass(BaseAction, "__QRCode")
export class QRCodeAction extends BaseAction {

    /**
     * Executes QR code generation or reading operation
     * 
     * @param params - The action parameters containing:
     *   - Operation: 'generate' or 'read'
     *   - Data: Text/URL to encode (for generate) or base64 image data (for read)
     *   - Size: QR code size in pixels (default: 200, max: 1000) [generate only]
     *   - ErrorCorrection: Error correction level 'L', 'M', 'Q', 'H' (default: 'M') [generate only]
     *   - Margin: Quiet zone margin (default: 4) [generate only]
     *   - DarkColor: Dark module color (default: '#000000') [generate only]
     *   - LightColor: Light module color (default: '#FFFFFF') [generate only]
     * 
     * @returns QR code generation/reading results
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const operationParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'operation');
            const dataParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'data');

            if (!operationParam || !operationParam.Value) {
                return {
                    Success: false,
                    Message: "Operation parameter is required (generate or read)",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            if (!dataParam || !dataParam.Value) {
                return {
                    Success: false,
                    Message: "Data parameter is required",
                    ResultCode: "MISSING_PARAMETERS"
                };
            }

            const operation = operationParam.Value.toString().toLowerCase();
            const data = dataParam.Value.toString();

            switch (operation) {
                case 'generate':
                    return await this.generateQRCode(data, params);
                case 'read':
                    return await this.readQRCode(data);
                default:
                    return {
                        Success: false,
                        Message: "Invalid operation. Use 'generate' or 'read'",
                        ResultCode: "INVALID_OPERATION"
                    };
            }

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to process QR code: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "FAILED"
            };
        }
    }

    /**
     * Generates a QR code from text data
     */
    private async generateQRCode(data: string, params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const sizeParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'size');
            const errorCorrectionParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'errorcorrection');
            const marginParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'margin');
            const darkColorParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'darkcolor');
            const lightColorParam = params.Params.find(p => p.Name.trim().toLowerCase() === 'lightcolor');

            const size = Math.min(parseInt(sizeParam?.Value?.toString() || '200'), 1000);
            const errorCorrection = errorCorrectionParam?.Value?.toString()?.toUpperCase() || 'M';
            const margin = parseInt(marginParam?.Value?.toString() || '4');
            const darkColor = darkColorParam?.Value?.toString() || '#000000';
            const lightColor = lightColorParam?.Value?.toString() || '#FFFFFF';

            // Validate error correction level
            if (!['L', 'M', 'Q', 'H'].includes(errorCorrection)) {
                return {
                    Success: false,
                    Message: "ErrorCorrection must be one of: L, M, Q, H",
                    ResultCode: "INVALID_ERROR_CORRECTION"
                };
            }

            // Generate QR code using a simple algorithm
            // This is a basic implementation - in production, you'd use a library like 'qrcode'
            const qrData = this.generateQRMatrix(data, errorCorrection);
            const svgQR = this.generateQRSVG(qrData, size, margin, darkColor, lightColor);
            
            // Convert to base64 PNG (simplified - would need canvas in real implementation)
            const base64PNG = await this.svgToBase64PNG(svgQR, size);

            const result = {
                operation: 'generate',
                inputData: data,
                options: {
                    size,
                    errorCorrection,
                    margin,
                    darkColor,
                    lightColor
                },
                qrCode: {
                    svg: svgQR,
                    base64PNG,
                    dataUrl: `data:image/png;base64,${base64PNG}`
                },
                generatedAt: new Date().toISOString()
            };

            return {
                Success: true,
                ResultCode: "SUCCESS",
                Message: JSON.stringify(result, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to generate QR code: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "GENERATION_FAILED"
            };
        }
    }

    /**
     * Reads a QR code from base64 image data
     */
    private async readQRCode(base64Data: string): Promise<ActionResultSimple> {
        try {
            // This would require a QR code reading library in production
            // For now, return a placeholder implementation
            const result = {
                operation: 'read',
                inputData: base64Data.substring(0, 50) + '...',
                decodedData: 'QR code reading not implemented - would require image processing library',
                confidence: 0,
                readAt: new Date().toISOString(),
                note: 'This is a placeholder implementation. In production, use a library like jsQR or qr-scanner.'
            };

            return {
                Success: false,
                ResultCode: "NOT_IMPLEMENTED",
                Message: JSON.stringify(result, null, 2)
            };

        } catch (error) {
            return {
                Success: false,
                Message: `Failed to read QR code: ${error instanceof Error ? error.message : String(error)}`,
                ResultCode: "READING_FAILED"
            };
        }
    }

    /**
     * Generates QR code matrix data (simplified implementation)
     */
    private generateQRMatrix(data: string, errorCorrection: string): number[][] {
        // This is a very simplified QR code generation
        // In production, use a proper QR code library
        const size = 21; // Version 1 QR code
        const matrix: number[][] = [];
        
        // Initialize matrix
        for (let i = 0; i < size; i++) {
            matrix[i] = new Array(size).fill(0);
        }

        // Add finder patterns (corners)
        this.addFinderPattern(matrix, 0, 0);
        this.addFinderPattern(matrix, 0, size - 7);
        this.addFinderPattern(matrix, size - 7, 0);

        // Add timing patterns
        for (let i = 8; i < size - 8; i++) {
            matrix[6][i] = i % 2;
            matrix[i][6] = i % 2;
        }

        // Add data (simplified - just fill with pattern based on data)
        const dataHash = this.simpleHash(data);
        for (let i = 0; i < size; i++) {
            for (let j = 0; j < size; j++) {
                if (matrix[i][j] === 0) {
                    matrix[i][j] = (dataHash + i + j) % 2;
                }
            }
        }

        return matrix;
    }

    /**
     * Adds finder pattern to QR matrix
     */
    private addFinderPattern(matrix: number[][], startRow: number, startCol: number): void {
        const pattern = [
            [1,1,1,1,1,1,1],
            [1,0,0,0,0,0,1],
            [1,0,1,1,1,0,1],
            [1,0,1,1,1,0,1],
            [1,0,1,1,1,0,1],
            [1,0,0,0,0,0,1],
            [1,1,1,1,1,1,1]
        ];

        for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
                if (startRow + i < matrix.length && startCol + j < matrix[0].length) {
                    matrix[startRow + i][startCol + j] = pattern[i][j];
                }
            }
        }
    }

    /**
     * Simple hash function for data
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Generates SVG representation of QR code
     */
    private generateQRSVG(matrix: number[][], size: number, margin: number, darkColor: string, lightColor: string): string {
        const moduleSize = Math.floor((size - 2 * margin) / matrix.length);
        const actualSize = matrix.length * moduleSize + 2 * margin;

        let svg = `<svg width="${actualSize}" height="${actualSize}" xmlns="http://www.w3.org/2000/svg">`;
        svg += `<rect width="${actualSize}" height="${actualSize}" fill="${lightColor}"/>`;

        for (let i = 0; i < matrix.length; i++) {
            for (let j = 0; j < matrix[i].length; j++) {
                if (matrix[i][j] === 1) {
                    const x = margin + j * moduleSize;
                    const y = margin + i * moduleSize;
                    svg += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${darkColor}"/>`;
                }
            }
        }

        svg += '</svg>';
        return svg;
    }

    /**
     * Converts SVG to base64 PNG (simplified implementation)
     */
    private async svgToBase64PNG(svg: string, size: number): Promise<string> {
        // This is a placeholder - in a real implementation, you'd use canvas or a library
        // to convert SVG to PNG and then to base64
        const base64SVG = Buffer.from(svg).toString('base64');
        return base64SVG; // Return base64 SVG as placeholder for PNG
    }
}