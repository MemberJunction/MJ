import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { gzip as gzipCallback, createGunzip } from 'zlib';
import { promisify } from 'util';
import { URL } from 'url';
import { z } from 'zod';
import { DataSourceInfo } from './types';
import sql from 'mssql';

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
          data = await gzip(Buffer.from(JSON.stringify(payload)));
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
  
        stream.on('end', () => {
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
        });
      });
  
      req.on('error', (e) => {
        const err = z.object({ message: z.string() }).safeParse(e);
        console.error(`Error in sendPostRequest().req.on(error): ${err.success ? err.data.message : e}`);
        reject(e);
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