import { BrowserManager } from './browser-context';
import * as path from 'path';
import * as fs from 'fs';

export interface ComponentExecutionOptions {
  componentCode: string;
  props?: Record<string, any>;
  setupCode?: string;
  timeout?: number;
  waitForSelector?: string;
  waitForLoadState?: 'load' | 'domcontentloaded' | 'networkidle';
}

export interface ComponentExecutionResult {
  success: boolean;
  html: string;
  errors: string[];
  console: { type: string; text: string }[];
  screenshot?: Buffer;
  executionTime: number;
}

export class ComponentRunner {
  constructor(private browserManager: BrowserManager) {}

  async executeComponent(options: ComponentExecutionOptions): Promise<ComponentExecutionResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const consoleLogs: { type: string; text: string }[] = [];

    try {
      const page = await this.browserManager.getPage();

      // Set up console logging
      page.on('console', (msg: any) => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
      });

      // Set up error handling
      page.on('pageerror', (error: Error) => {
        errors.push(error.message);
      });

      // Create HTML template with React runtime
      const htmlContent = this.createHTMLTemplate(options);
      
      // Navigate to a data URL with the HTML content
      await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

      // Wait for React to render
      if (options.waitForSelector) {
        await this.browserManager.waitForSelector(options.waitForSelector, { 
          timeout: options.timeout || 30000 
        });
      }

      if (options.waitForLoadState) {
        await this.browserManager.waitForLoadState(options.waitForLoadState);
      } else {
        // Default wait for React to finish rendering
        await page.waitForTimeout(100);
      }

      // Get the rendered HTML
      const html = await this.browserManager.getContent();

      // Take screenshot if needed
      const screenshot = await this.browserManager.screenshot();

      return {
        success: errors.length === 0,
        html,
        errors,
        console: consoleLogs,
        screenshot,
        executionTime: Date.now() - startTime
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        html: '',
        errors,
        console: consoleLogs,
        executionTime: Date.now() - startTime
      };
    }
  }

  private createHTMLTemplate(options: ComponentExecutionOptions): string {
    const propsJson = JSON.stringify(options.props || {});
    
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>React Component Test</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    body { margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    ${options.setupCode || ''}
    
    const props = ${propsJson};
    
    ${options.componentCode}
    
    // Render the component
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component, props));
  </script>
</body>
</html>`;
  }

  async executeComponentFromFile(
    filePath: string, 
    props?: Record<string, any>,
    options?: Partial<ComponentExecutionOptions>
  ): Promise<ComponentExecutionResult> {
    const absolutePath = path.resolve(filePath);
    
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Component file not found: ${absolutePath}`);
    }

    const componentCode = fs.readFileSync(absolutePath, 'utf-8');
    
    return this.executeComponent({
      componentCode,
      props,
      ...options
    });
  }
}