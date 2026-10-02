/**
 * Custom Nunjucks loader for file-based prompts
 * Pattern adapted from Templates package's TemplateEntityLoader
 */

import nunjucks from 'nunjucks';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PromptFileLoader extends nunjucks.Loader {
  public Async: true = true;

  /** @deprecated Use {@link Async}. */
  public get async(): true {
    return this.Async;
  }
  /** @deprecated Use {@link Async}. */
  public set async(value: true) {
    this.Async = value;
  }

  private prompts: Map<string, string> = new Map();

  constructor(private promptsDir: string) {
    super();
  }

  /**
   * Load all prompt files from directory
   */
  public async LoadAll(): Promise<void> {
    const files = await fs.readdir(this.promptsDir);

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        const promptName = path.basename(file, path.extname(file));
        const filePath = path.join(this.promptsDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        this.prompts.set(promptName, content);
      }
    }
  }

  /** @deprecated Use {@link LoadAll}. */
  public async loadAll(): Promise<void> {
    return this.LoadAll();
  }

  /**
   * Required by Nunjucks Loader - provides template source
   * Pattern from Templates package
   */
  public GetSource(name: string, callback: any): void {
    const content = this.prompts.get(name);
    if (content) {
      callback(null, {
        src: content,
        path: name,
        noCache: true
      });
    } else {
      callback(new Error(`Prompt not found: ${name}`));
    }
  }

  /** @deprecated Use {@link GetSource}. */
  public getSource(name: string, callback: any): void {
    return this.GetSource(name, callback);
  }
}
