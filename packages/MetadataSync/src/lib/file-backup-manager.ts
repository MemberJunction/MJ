/**
 * @fileoverview File backup and rollback manager for MetadataSync operations
 * @module file-backup-manager
 * 
 * This module provides functionality to create backups of files before modification
 * and allows rolling back all changes if any operation fails. It ensures atomic
 * file operations by maintaining a temporary backup directory during push operations.
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { uuidv4 } from '@memberjunction/global';

/**
 * Represents a backed-up file with its original and backup paths
 */
interface BackupEntry {
  /** Original file path that was backed up */
  originalPath: string;
  /** Path to the backup copy of the file */
  backupPath: string;
  /** Whether the file existed before modification */
  existed: boolean;
}

/**
 * Manages file backups and rollback operations for MetadataSync
 * 
 * Creates temporary backups of all modified files during a push operation,
 * allowing atomic rollback of all file changes if any error occurs.
 * 
 * @class FileBackupManager
 * @example
 * ```typescript
 * const backupManager = new FileBackupManager();
 * await backupManager.initialize();
 * 
 * try {
 *   await backupManager.backupFile('/path/to/file.json');
 *   // Modify the file
 *   await fs.writeJson('/path/to/file.json', newData);
 *   
 *   // If all operations succeed
 *   await backupManager.cleanup();
 * } catch (error) {
 *   // Rollback all file changes
 *   await backupManager.rollback();
 *   throw error;
 * }
 * ```
 */
export class FileBackupManager {
  private backupDir: string = '';
  private backups: BackupEntry[] = [];
  private initialized: boolean = false;
  
  /**
   * Initialize the backup manager by creating a temporary directory
   * 
   * Creates a unique temporary directory for storing file backups during
   * the current operation. Must be called before any backup operations.
   * 
   * @returns Promise that resolves when initialization is complete
   * @throws Error if temporary directory creation fails
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      throw new Error('FileBackupManager already initialized');
    }
    
    // Create a unique temporary directory for this session
    const tempRoot = os.tmpdir();
    const sessionId = uuidv4();
    this.backupDir = path.join(tempRoot, 'mj-metadata-sync', sessionId);
    
    await fs.ensureDir(this.backupDir);
    this.initialized = true;
  }
  
  /**
   * Create a backup of a file before modification
   * 
   * Copies the current state of a file to the backup directory. If the file
   * doesn't exist, records that fact for proper rollback handling.
   * 
   * @param filePath - Absolute path to the file to backup
   * @returns Promise that resolves when backup is complete
   * @throws Error if backup operation fails
   */
  async backupFile(filePath: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('FileBackupManager not initialized. Call initialize() first.');
    }
    
    // Check if we already have a backup for this file
    const existingBackup = this.backups.find(b => b.originalPath === filePath);
    if (existingBackup) {
      // Already backed up, don't backup again
      return;
    }
    
    const exists = await fs.pathExists(filePath);
    const backupFileName = `${path.basename(filePath)}_${Date.now()}_${this.backups.length}`;
    const backupPath = path.join(this.backupDir, backupFileName);
    
    const backupEntry: BackupEntry = {
      originalPath: filePath,
      backupPath: backupPath,
      existed: exists
    };
    
    if (exists) {
      // Copy the file to backup location
      await fs.copy(filePath, backupPath);
    }
    
    this.backups.push(backupEntry);
  }
  
  /**
   * Rollback all file changes by restoring from backups
   * 
   * Restores all backed-up files to their original state. Files that didn't
   * exist before the operation are deleted. This operation is atomic - either
   * all files are restored or none are.
   * 
   * @returns Promise that resolves when rollback is complete
   * @throws Error if any rollback operation fails
   */
  async rollback(): Promise<void> {
    if (!this.initialized) {
      return; // Nothing to rollback
    }
    
    const errors: string[] = [];
    
    // Process backups in reverse order (last modified first)
    for (const backup of this.backups.reverse()) {
      try {
        if (backup.existed) {
          // Restore the original file
          await fs.copy(backup.backupPath, backup.originalPath, { overwrite: true });
        } else {
          // File didn't exist before, remove it
          if (await fs.pathExists(backup.originalPath)) {
            await fs.remove(backup.originalPath);
          }
        }
      } catch (error) {
        const errorMsg = `Failed to rollback ${backup.originalPath}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.error(errorMsg);
      }
    }
    
    // Clean up backup directory
    try {
      await this.cleanup();
    } catch (error) {
      console.error('Failed to cleanup backup directory during rollback:', error);
    }
    
    if (errors.length > 0) {
      throw new Error(`Rollback completed with errors:\n${errors.join('\n')}`);
    }
  }
  
  /**
   * Clean up backup directory after successful operation
   * 
   * Removes all temporary backup files and the backup directory. Should be
   * called after all operations complete successfully.
   * 
   * @returns Promise that resolves when cleanup is complete
   */
  async cleanup(): Promise<void> {
    if (!this.initialized || !this.backupDir) {
      return;
    }
    
    try {
      await fs.remove(this.backupDir);
    } catch (error) {
      // Log but don't throw - cleanup errors shouldn't fail the operation
      console.warn(`Failed to cleanup backup directory ${this.backupDir}:`, error);
    }
    
    this.backups = [];
    this.initialized = false;
    this.backupDir = '';
  }
  
  /**
   * Get statistics about current backup session
   * 
   * @returns Object containing backup statistics
   */
  getStats(): { totalBackups: number; backupDir: string; initialized: boolean } {
    return {
      totalBackups: this.backups.length,
      backupDir: this.backupDir,
      initialized: this.initialized
    };
  }
}