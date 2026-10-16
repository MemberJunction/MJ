import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { FileBackupManager } from '../lib/file-backup-manager';

describe('FileBackupManager.releaseBackup', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-backup-test-'));
    });

    afterEach(async () => {
        await fs.remove(dir);
    });

    it('leaves a released file as it is when the rest are rolled back', async () => {
        const kept = path.join(dir, 'kept.json');
        const restored = path.join(dir, 'restored.json');
        await fs.writeFile(kept, 'old-kept');
        await fs.writeFile(restored, 'old-restored');

        const manager = new FileBackupManager();
        await manager.initialize();
        await manager.backupFile(kept);
        await manager.backupFile(restored);
        await fs.writeFile(kept, 'new-kept');
        await fs.writeFile(restored, 'new-restored');

        expect(manager.releaseBackup(kept)).toBe(true);
        await manager.rollback();

        expect(await fs.readFile(kept, 'utf-8')).toBe('new-kept');
        expect(await fs.readFile(restored, 'utf-8')).toBe('old-restored');
    });

    it('returns false for a file that was never backed up', async () => {
        const manager = new FileBackupManager();
        await manager.initialize();
        expect(manager.releaseBackup(path.join(dir, 'unknown.json'))).toBe(false);
        await manager.cleanup();
    });
});
