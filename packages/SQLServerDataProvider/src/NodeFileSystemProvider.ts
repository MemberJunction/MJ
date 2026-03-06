import * as fs from 'fs';
import { IFileSystemProvider } from '@memberjunction/core';

/**
 * Node.js implementation of IFileSystemProvider using the built-in `fs` module.
 * Used by SQLServerDataProvider to provide filesystem access on the server side.
 *
 * Uses synchronous fs methods wrapped in an async interface for simplicity and
 * backward compatibility with existing logging behavior (previously appendFileSync).
 * Can be upgraded to true async (fs.promises) in the future if needed.
 */
export class NodeFileSystemProvider implements IFileSystemProvider {
    async AppendToFile(filePath: string, content: string): Promise<void> {
        fs.appendFileSync(filePath, content, 'utf8');
    }

    async WriteFile(filePath: string, content: string): Promise<void> {
        fs.writeFileSync(filePath, content, 'utf8');
    }

    async ReadFile(filePath: string): Promise<string | null> {
        try {
            return fs.readFileSync(filePath, 'utf8');
        } catch {
            return null;
        }
    }

    async FileExists(filePath: string): Promise<boolean> {
        try {
            fs.accessSync(filePath);
            return true;
        } catch {
            return false;
        }
    }
}
