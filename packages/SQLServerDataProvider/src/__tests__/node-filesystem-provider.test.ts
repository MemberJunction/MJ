import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the fs module
// ---------------------------------------------------------------------------
vi.mock('fs', () => ({
    default: {
        appendFileSync: vi.fn(),
        writeFileSync: vi.fn(),
        readFileSync: vi.fn(),
        accessSync: vi.fn(),
    },
    appendFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(),
    accessSync: vi.fn(),
}));

// Mock @memberjunction/core to avoid pulling in framework dependencies
vi.mock('@memberjunction/core', () => ({
    IFileSystemProvider: class {},
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import { NodeFileSystemProvider } from '../NodeFileSystemProvider';
import * as fs from 'fs';

// =====================================================================
// Tests for NodeFileSystemProvider
// =====================================================================
describe('NodeFileSystemProvider', () => {
    let provider: NodeFileSystemProvider;

    beforeEach(() => {
        vi.clearAllMocks();
        provider = new NodeFileSystemProvider();
    });

    // -----------------------------------------------------------------
    // AppendToFile
    // -----------------------------------------------------------------
    describe('AppendToFile', () => {
        it('should call fs.appendFileSync with the correct arguments', async () => {
            await provider.AppendToFile('/tmp/test.log', 'hello world');

            expect(fs.appendFileSync).toHaveBeenCalledOnce();
            expect(fs.appendFileSync).toHaveBeenCalledWith('/tmp/test.log', 'hello world', 'utf8');
        });

        it('should call appendFileSync with empty content', async () => {
            await provider.AppendToFile('/tmp/empty.log', '');

            expect(fs.appendFileSync).toHaveBeenCalledWith('/tmp/empty.log', '', 'utf8');
        });
    });

    // -----------------------------------------------------------------
    // WriteFile
    // -----------------------------------------------------------------
    describe('WriteFile', () => {
        it('should call fs.writeFileSync with the correct arguments', async () => {
            await provider.WriteFile('/tmp/output.txt', 'file content');

            expect(fs.writeFileSync).toHaveBeenCalledOnce();
            expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/output.txt', 'file content', 'utf8');
        });

        it('should call writeFileSync with empty content', async () => {
            await provider.WriteFile('/tmp/empty.txt', '');

            expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/empty.txt', '', 'utf8');
        });
    });

    // -----------------------------------------------------------------
    // ReadFile
    // -----------------------------------------------------------------
    describe('ReadFile', () => {
        it('should return file content on success', async () => {
            vi.mocked(fs.readFileSync).mockReturnValue('file contents here');

            const result = await provider.ReadFile('/tmp/input.txt');

            expect(result).toBe('file contents here');
            expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/input.txt', 'utf8');
        });

        it('should return null when file read throws an error', async () => {
            vi.mocked(fs.readFileSync).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            const result = await provider.ReadFile('/tmp/nonexistent.txt');

            expect(result).toBeNull();
        });

        it('should return empty string when file is empty', async () => {
            vi.mocked(fs.readFileSync).mockReturnValue('');

            const result = await provider.ReadFile('/tmp/empty.txt');

            expect(result).toBe('');
        });
    });

    // -----------------------------------------------------------------
    // FileExists
    // -----------------------------------------------------------------
    describe('FileExists', () => {
        it('should return true when file is accessible', async () => {
            vi.mocked(fs.accessSync).mockReturnValue(undefined);

            const result = await provider.FileExists('/tmp/exists.txt');

            expect(result).toBe(true);
            expect(fs.accessSync).toHaveBeenCalledWith('/tmp/exists.txt');
        });

        it('should return false when file access throws an error', async () => {
            vi.mocked(fs.accessSync).mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            const result = await provider.FileExists('/tmp/missing.txt');

            expect(result).toBe(false);
        });
    });
});
