import fs from 'fs-extra';
import path from 'path';
import { BaseEntity } from '@memberjunction/core';

/**
 * Handles externalization of field values to separate files with @file: references
 */
export class FieldExternalizer {
  /**
   * Externalize a field value to a separate file and return @file: reference
   */
  async externalizeField(
    fieldName: string,
    fieldValue: any,
    pattern: string,
    recordData: BaseEntity,
    targetDir: string,
    existingFileReference?: string,
    mergeStrategy: string = 'merge',
    verbose?: boolean
  ): Promise<string> {
    const { finalFilePath, fileReference } = this.determineFilePath(
      pattern, 
      recordData, 
      targetDir, 
      existingFileReference, 
      mergeStrategy, 
      fieldName, 
      verbose
    );
    
    const shouldWrite = await this.shouldWriteFile(finalFilePath, fieldValue, fieldName);
    
    if (shouldWrite) {
      await this.writeExternalFile(finalFilePath, fieldValue, fieldName, verbose);
    } else if (verbose) {
      console.log(`External file ${finalFilePath} unchanged, skipping write`);
    }
    
    return fileReference;
  }

  /**
   * Determines the file path and reference for externalization
   */
  private determineFilePath(
    pattern: string,
    recordData: BaseEntity,
    targetDir: string,
    existingFileReference?: string,
    mergeStrategy: string = 'merge',
    fieldName: string = '',
    verbose?: boolean
  ): { finalFilePath: string; fileReference: string } {
    if (this.shouldUseExistingReference(existingFileReference, mergeStrategy)) {
      return this.useExistingFileReference(existingFileReference!, targetDir, verbose);
    }
    
    return this.createNewFileReference(pattern, recordData, targetDir, fieldName, verbose);
  }

  /**
   * Checks if we should use an existing file reference
   */
  private shouldUseExistingReference(existingFileReference?: string, mergeStrategy: string = 'merge'): boolean {
    return mergeStrategy === 'merge' && 
           !!existingFileReference && 
           typeof existingFileReference === 'string' && 
           existingFileReference.startsWith('@file:');
  }

  /**
   * Uses an existing file reference
   */
  private useExistingFileReference(
    existingFileReference: string, 
    targetDir: string, 
    verbose?: boolean
  ): { finalFilePath: string; fileReference: string } {
    const existingPath = existingFileReference.substring(6); // Remove @file: prefix
    const finalFilePath = path.resolve(targetDir, existingPath);
    
    if (verbose) {
      console.log(`Using existing external file: ${finalFilePath}`);
    }
    
    return { finalFilePath, fileReference: existingFileReference };
  }

  /**
   * Creates a new file reference using the pattern
   */
  private createNewFileReference(
    pattern: string,
    recordData: BaseEntity,
    targetDir: string,
    fieldName: string,
    verbose?: boolean
  ): { finalFilePath: string; fileReference: string } {
    const processedPattern = this.processPattern(pattern, recordData, fieldName);
    const cleanPattern = this.removeFilePrefix(processedPattern);
    const finalFilePath = path.resolve(targetDir, cleanPattern);
    const fileReference = `@file:${cleanPattern}`;
    
    if (verbose) {
      console.log(`Creating new external file: ${finalFilePath}`);
    }
    
    return { finalFilePath, fileReference };
  }

  /**
   * Processes pattern placeholders with actual values
   */
  private processPattern(pattern: string, recordData: BaseEntity, fieldName: string): string {
    let processedPattern = pattern;
    
    // Replace common placeholders
    processedPattern = this.replacePlaceholder(processedPattern, 'Name', (recordData as any).Name);
    processedPattern = this.replacePlaceholder(processedPattern, 'ID', (recordData as any).ID);
    processedPattern = this.replacePlaceholder(processedPattern, 'FieldName', fieldName);
    
    // Replace any other field placeholders
    processedPattern = this.replaceFieldPlaceholders(processedPattern, recordData);
    
    return processedPattern;
  }

  /**
   * Replaces a single placeholder in the pattern
   */
  private replacePlaceholder(pattern: string, placeholder: string, value: any): string {
    if (value != null) {
      const sanitizedValue = this.sanitizeForFilename(String(value));
      return pattern.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), sanitizedValue);
    }
    return pattern;
  }

  /**
   * Replaces field placeholders with values from the record
   */
  private replaceFieldPlaceholders(pattern: string, recordData: BaseEntity): string {
    let processedPattern = pattern;
    
    for (const [key, value] of Object.entries(recordData as any)) {
      if (value != null) {
        const sanitizedValue = this.sanitizeForFilename(String(value));
        processedPattern = processedPattern.replace(new RegExp(`\\{${key}\\}`, 'g'), sanitizedValue);
      }
    }
    
    return processedPattern;
  }

  /**
   * Removes @file: prefix if present
   */
  private removeFilePrefix(pattern: string): string {
    return pattern.startsWith('@file:') ? pattern.substring(6) : pattern;
  }

  /**
   * Determines if the file should be written based on content comparison
   */
  private async shouldWriteFile(finalFilePath: string, fieldValue: any, fieldName: string): Promise<boolean> {
    if (!(await fs.pathExists(finalFilePath))) {
      return true; // File doesn't exist, should write
    }
    
    try {
      const existingContent = await fs.readFile(finalFilePath, 'utf8');
      const contentToWrite = this.prepareContentForWriting(fieldValue, fieldName);
      
      return existingContent !== contentToWrite;
    } catch (error) {
      return true; // Error reading existing file, should write
    }
  }

  /**
   * Writes the external file with the field content
   */
  private async writeExternalFile(
    finalFilePath: string, 
    fieldValue: any, 
    fieldName: string, 
    verbose?: boolean
  ): Promise<void> {
    // Ensure the directory exists
    await fs.ensureDir(path.dirname(finalFilePath));
    
    // Write the field value to the file
    const contentToWrite = this.prepareContentForWriting(fieldValue, fieldName);
    await fs.writeFile(finalFilePath, contentToWrite, 'utf8');
    
    if (verbose) {
      console.log(`Wrote externalized field ${fieldName} to ${finalFilePath}`);
    }
  }

  /**
   * Prepares content for writing, with JSON pretty-printing if applicable
   */
  private prepareContentForWriting(fieldValue: any, fieldName: string): string {
    let contentToWrite = String(fieldValue);
    
    // If the value looks like JSON, try to pretty-print it
    if (this.shouldPrettyPrintAsJson(fieldName)) {
      try {
        const parsed = JSON.parse(contentToWrite);
        contentToWrite = JSON.stringify(parsed, null, 2);
      } catch {
        // Not valid JSON, use as-is
      }
    }
    
    return contentToWrite;
  }

  /**
   * Determines if content should be pretty-printed as JSON
   */
  private shouldPrettyPrintAsJson(fieldName: string): boolean {
    const lowerFieldName = fieldName.toLowerCase();
    return lowerFieldName.includes('json') || lowerFieldName.includes('example');
  }

  /**
   * Sanitize a string for use in filenames
   */
  private sanitizeForFilename(input: string): string {
    return input
      .toLowerCase()
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/[^a-z0-9.-]/g, '') // Remove special characters except dots and hyphens
      .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  }
}