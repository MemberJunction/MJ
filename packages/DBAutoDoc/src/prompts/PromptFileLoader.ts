/**
 * Custom Nunjucks loader for file-based prompts
 * Pattern adapted from Templates package's TemplateEntityLoader
 */

import nunjucks from 'nunjucks';
import * as fs from 'fs/promises';
import * as path from 'path';

export class PromptFileLoader extends nunjucks.Loader {
  public async: true = true;

  private prompts: Map<string, string> = new Map();

  constructor(private promptsDir: string) {
    super();
  }

  /**
   * Load all prompt files from directory
   */
  public async loadAll(): Promise<void> {
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

  /**
   * Required by Nunjucks Loader - provides template source
   * Pattern from Templates package
   */
  public getSource(name: string, callback: any): void {
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
}
