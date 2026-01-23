import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { gzip as gzipCallback, createGunzip } from 'zlib';
import { promisify } from 'util';
import { URL } from 'url';
import { z } from 'zod';
import { DataSourceInfo, ProviderInfo } from './types';
import sql from 'mssql';
import { DatabaseProviderBase } from '@memberjunction/core';

const gzip = promisify(gzipCallback);

type StreamCallback = (jsonObject: any) => void;

/**
 * Utility function to handle HTTP/HTTPS requests with optional compression, custom headers, and streaming response callback for JSON objects.
 * This function accumulates data chunks and parses complete JSON objects, assuming newline-delimited JSON in the stream.
 * 
 * @param {string} url - The URL to which the request is sent.
 * @param {any} payload - The payload to be sent with the request.
 * @param {boolean} useCompression - Flag to determine if payload compression should be used.
 * @param {Record<string, string> | null} headers - Custom headers for the request. Can be null.
 * @param {StreamCallback} [streamCallback] - Optional callback for handling streaming JSON objects.
 * @returns {Promise<any[]>} - A promise that resolves to an array of all JSON objects received during the streaming process.
 */
export async function sendPostRequest(url: string, payload: any, useCompression: boolean, headers: Record<string, string> | null, streamCallback?: StreamCallback): Promise<any[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const { protocol, hostname, port, pathname } = new URL(url);
      let data;
      if (useCompression) {
        try {
          data = await gzip(Buffer.from(JSON.stringify(payload)) as any);
          headers = headers || {}; // Ensure headers is an object
          headers['Content-Encoding'] = 'gzip';
        } catch (error) {
          const err = z.object({ message: z.string() }).safeParse(error);
          console.error(`Error in sendPostRequest while compressing data: ${err.success ? err.data.message : error}`);
          return reject(error);
        }
      } else {
        data = Buffer.from(JSON.stringify(payload));
      }
  
      const options = {
        hostname,
        port: port || (protocol === 'https:' ? 443 : 80),
        path: pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };
  
      const request = protocol === 'https:' ? httpsRequest : httpRequest;
      const jsonObjects: any[] = [];
      let buffer = '';
  
      const req = request(options, (res) => {
        const gunzip = createGunzip();
        const stream = res.headers['content-encoding'] === 'gzip' ? res.pipe(gunzip) : res;
        let streamEnded = false;

        const handleStreamEnd = () => {
          if (streamEnded) return; // Prevent double-resolution
          streamEnded = true;

          // Attempt to parse any remaining data in buffer in case it's a complete JSON object
          if (buffer.trim()) {
            try {
              const jsonObject = JSON.parse(buffer.trim());
              jsonObjects.push(jsonObject);
              streamCallback?.(jsonObject);
            } catch (e) {
              const err = z.object({ message: z.string() }).safeParse(e);
              // Handle JSON parse error for the last chunk
              console.warn(`Error in postRequest().stream(end) while parsing JSON object: ${err.success ? err.data.message : e}`);
            }
          }
          resolve(jsonObjects);
        };

        stream.on('data', (chunk) => {
          buffer += chunk;
          let boundary;
          while ((boundary = buffer.indexOf('\n')) !== -1) {
            const jsonString = buffer.substring(0, boundary);
            buffer = buffer.substring(boundary + 1);
            try {
              const jsonObject = JSON.parse(jsonString);
              jsonObjects.push(jsonObject);
              streamCallback?.(jsonObject);
            } catch (e) {
              const err = z.object({ message: z.string() }).safeParse(e);
              // Handle JSON parse error for cases of malformed JSON objects
              console.warn(`Error in postRequest().stream(data) while parsing JSON object: ${err.success ? err.data.message : e}`);
            }
          }
        });

        stream.on('end', handleStreamEnd);

        // Handle premature connection close (e.g., server crashes mid-response)
        stream.on('close', () => {
          if (!streamEnded) {
            console.warn(`Stream closed prematurely for ${url}`);
            handleStreamEnd();
          }
        });

        // Handle stream errors (decompression failures, etc.)
        stream.on('error', (e) => {
          if (!streamEnded) {
            console.error(`Stream error for ${url}:`, e);
            reject(new Error(`Stream error: ${e.message}`));
          }
        });
      });
  
      req.on('error', (e) => {
        const err = z.object({ message: z.string() }).safeParse(e);
        const errorMessage = err.success ? err.data.message : String(e);
        console.error(`Error in sendPostRequest().req.on(error) for ${hostname}:${port}${pathname}: ${errorMessage}`);

        // Create a more informative error for the rejection
        const contextualError = new Error(`HTTP request failed to ${url}: ${errorMessage}`);
        // Preserve the original error as the cause
        if (e instanceof Error) {
          (contextualError as any).cause = e;
        }
        reject(contextualError);
      });
  
      req.write(data);
      req.end();
    }
    catch (e) {
      const err = z.object({ message: z.string() }).safeParse(e);
      console.error(`Error in sendPostRequest: ${err.success ? err.data.message : e}`)
      reject(e);
    }
  }
  );
}


  /**
   * Returns the read-only data source if it exists, otherwise returns the read-write data source if options is not provided or if options.allowFallbackToReadWrite is true.
   * @param dataSources 
   * @param options 
   * @returns 
   */
  export function GetReadOnlyDataSource(dataSources: DataSourceInfo[], options?: {allowFallbackToReadWrite: boolean}): sql.ConnectionPool & { query: (sql: string, params?: any) => Promise<any[]> } {
    const readOnlyDataSource = dataSources.find((ds) => ds.type === 'Read-Only');
    if (readOnlyDataSource) {
      return extendConnectionPoolWithQuery(readOnlyDataSource.dataSource);
    } 
    else if (!options || options.allowFallbackToReadWrite) {
      // default behavior for backward compatibility prior to MJ 2.22.3 where we introduced this functionality was to have a single
      // connection, so for back-compatability, if we don't have a read-only data source, we'll fall back to the read-write data source
      const readWriteDataSource = dataSources.find((ds) => ds.type === 'Read-Write');
      if (readWriteDataSource) {
        return extendConnectionPoolWithQuery(readWriteDataSource.dataSource);
      }
    }
    throw new Error('No suitable data source found');
  }

  /**
   * Returns the read-only provider if it exists, otherwise returns the original provider if options is not provided or if options.allowFallbackToReadWrite is true.
   * @param options 
   * @returns 
   */
  export function GetReadOnlyProvider(providers: Array<ProviderInfo>, options?: {allowFallbackToReadWrite: boolean}): DatabaseProviderBase {
    if (!providers || providers.length === 0) 
      return null; // no providers available

    const readOnlyProvider = providers.find((p) => p.type === 'Read-Only');
    if (readOnlyProvider) {
      return readOnlyProvider.provider;
    }
    else if (options?.allowFallbackToReadWrite) {
      return providers[0].provider; // if no read-only provider is provided, use the original provider since we are allowed to fallback to read-write
    }
    else {
      return null; // no read only provider available and we are not allowed to fallback to read-write
    }
  }

  /**
   * Returns the read-write provider if it exists, otherwise returns the original provider if options is not provided or if options.allowFallbackToReadOnly is true.
   * @param options 
   * @returns 
   */
  export function GetReadWriteProvider(providers: Array<ProviderInfo>, options?: {allowFallbackToReadOnly: boolean}): DatabaseProviderBase {
    if (!providers || providers.length === 0) 
      return null; // no providers available

    const readWriteProvider = providers.find((p) => p.type === 'Read-Write');
    if (readWriteProvider) {
      return readWriteProvider.provider;
    }
    else if (options?.allowFallbackToReadOnly) {
      return GetReadOnlyProvider(providers, { allowFallbackToReadWrite: false }); // if no read-write provider is provided, use the read-only provider since we are allowed to fallback to read-only
    }
    else {
      return null; // no read-write provider available and we are not allowed to fallback to read-only
    }
  }

  /**
   * Returns the read-write data source if it exists, otherwise throws an error.
   * @param dataSources 
   * @returns 
   */
  export function GetReadWriteDataSource(dataSources: DataSourceInfo[]): sql.ConnectionPool & { query: (sql: string, params?: any) => Promise<any[]> } {
    const readWriteDataSource = dataSources.find((ds) => ds.type === 'Read-Write');
    if (readWriteDataSource) {
      return extendConnectionPoolWithQuery(readWriteDataSource.dataSource);
    }
    throw new Error('No suitable read-write data source found');
  }

  /**
   * Extends a ConnectionPool with a query method that returns results in the format expected by generated code
   * This provides backwards compatibility with code that expects TypeORM-style query results
   */
  export function extendConnectionPoolWithQuery(pool: sql.ConnectionPool): sql.ConnectionPool & { query: (sql: string, params?: any) => Promise<any[]> } {
    const extendedPool = pool as any;
    extendedPool.query = async (sqlQuery: string, parameters?: any): Promise<any[]> => {
      const request = new sql.Request(pool);
      // Add parameters if provided
      if (parameters) {
        if (Array.isArray(parameters)) {
          parameters.forEach((value, index) => {
            request.input(`p${index}`, value);
          });
          // Replace ? with @p0, @p1, etc. in the query
          let paramIndex = 0;
          sqlQuery = sqlQuery.replace(/\?/g, () => `@p${paramIndex++}`);
        }
      }
      const result = await request.query(sqlQuery);
      return result.recordset || [];
    };
    return extendedPool;
  }