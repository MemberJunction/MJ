import { BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import { Metadata, RunView, BaseEntity } from '@memberjunction/global';

/**
 * Base class for actions that handle file inputs from multiple sources
 * Provides common functionality for loading files from:
 * - MJ Storage (Document Libraries)
 * - URLs
 * - Direct data
 */
export abstract class BaseFileHandlerAction extends BaseAction {
  /**
   * Get file content from various sources based on parameters
   * Priority: FileID > FileURL > Data parameter
   *
   * @param params - Action parameters
   * @param dataParamName - Name of the parameter containing direct data
   * @param fileParamName - Name of the parameter containing file ID (default: 'FileID')
   * @param urlParamName - Name of the parameter containing file URL (default: 'FileURL')
   * @returns Object with content and metadata
   */
  protected async getFileContent(
    params: RunActionParams,
    dataParamName: string,
    fileParamName: string = 'FileID',
    urlParamName: string = 'FileURL'
  ): Promise<{
    content: string | Buffer;
    fileName?: string;
    mimeType?: string;
    source: 'storage' | 'url' | 'direct';
  }> {
    // Check for FileID first (MJ Storage)
    const fileIdParam = params.Params.find((p) => p.Name.trim().toLowerCase() === fileParamName.toLowerCase());
    if (fileIdParam?.Value) {
      return await this.loadFromMJStorage(fileIdParam.Value.toString(), params);
    }

    // Check for FileURL
    const fileUrlParam = params.Params.find((p) => p.Name.trim().toLowerCase() === urlParamName.toLowerCase());
    if (fileUrlParam?.Value) {
      return await this.loadFromURL(fileUrlParam.Value.toString());
    }

    // Check for direct data
    const dataParam = params.Params.find((p) => p.Name.trim().toLowerCase() === dataParamName.toLowerCase());
    if (dataParam?.Value) {
      return {
        content: dataParam.Value.toString(),
        source: 'direct',
      };
    }

    throw new Error(`No input provided. Please provide ${fileParamName}, ${urlParamName}, or ${dataParamName}`);
  }

  /**
   * Load file from MJ Storage (Document Libraries)
   */
  private async loadFromMJStorage(
    fileId: string,
    params: RunActionParams
  ): Promise<{
    content: string | Buffer;
    fileName?: string;
    mimeType?: string;
    source: 'storage';
  }> {
    try {
      const rv = new RunView();
      const result = await rv.RunView<BaseEntity>(
        {
          EntityName: 'Document Libraries',
          ExtraFilter: `ID = '${fileId}'`,
          ResultType: 'entity_object',
        },
        params.ContextUser
      );

      if (!result.Success || !result.Results || result.Results.length === 0) {
        throw new Error(`File not found in Document Libraries: ${fileId}`);
      }

      const doc = result.Results[0];

      // Get the actual file content (this would need implementation based on your storage provider)
      // For now, returning the file info - actual implementation would fetch from storage
      return {
        content: '', // TODO: Implement actual file retrieval based on storage provider
        fileName: doc.Get('FileName'),
        mimeType: doc.Get('MimeType'),
        source: 'storage',
      };
    } catch (error) {
      throw new Error(`Failed to load file from storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Load file from URL
   */
  private async loadFromURL(url: string): Promise<{
    content: string | Buffer;
    fileName?: string;
    mimeType?: string;
    source: 'url';
  }> {
    try {
      // Validate URL
      const urlObj = new URL(url);
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        throw new Error('Only HTTP and HTTPS URLs are supported');
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      const contentDisposition = response.headers.get('content-disposition');
      let fileName: string | undefined;

      // Extract filename from content-disposition if available
      if (contentDisposition) {
        const match = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (match && match[1]) {
          fileName = match[1].replace(/['"]/g, '');
        }
      }

      // If no filename from header, extract from URL
      if (!fileName) {
        fileName = urlObj.pathname.split('/').pop();
      }

      const content = await response.text();

      return {
        content,
        fileName,
        mimeType: contentType || undefined,
        source: 'url',
      };
    } catch (error) {
      throw new Error(`Failed to load file from URL: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save file to MJ Storage
   */
  protected async saveToMJStorage(content: string | Buffer, fileName: string, mimeType: string, params: RunActionParams): Promise<string> {
    try {
      const md = new Metadata();
      const doc = await md.GetEntityObject<BaseEntity>('Document Libraries', params.ContextUser);

      if (!doc) {
        throw new Error('Failed to create Document Library entity');
      }

      doc.Set('FileName', fileName);
      doc.Set('MimeType', mimeType);
      // TODO: Set appropriate fields based on your Document Libraries schema
      // doc.Set('FileSize', Buffer.byteLength(content));
      // doc.Set('StorageProvider', 'default');

      const saveResult = await doc.Save();
      if (!saveResult) {
        throw new Error('Failed to save document to library');
      }

      // TODO: Actually store the file content to the storage provider

      return doc.Get('ID');
    } catch (error) {
      throw new Error(`Failed to save file to storage: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract parameter value by name (case-insensitive)
   */
  protected getParamValue(params: RunActionParams, paramName: string): any {
    const param = params.Params.find((p) => p.Name.trim().toLowerCase() === paramName.toLowerCase());
    return param?.Value;
  }

  /**
   * Get boolean parameter value with default
   */
  protected getBooleanParam(params: RunActionParams, paramName: string, defaultValue: boolean = false): boolean {
    const value = this.getParamValue(params, paramName);
    if (value === undefined || value === null) return defaultValue;
    return String(value).toLowerCase() === 'true';
  }

  /**
   * Get numeric parameter value with default
   */
  protected getNumericParam(params: RunActionParams, paramName: string, defaultValue: number = 0): number {
    const value = this.getParamValue(params, paramName);
    if (value === undefined || value === null) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }
}
