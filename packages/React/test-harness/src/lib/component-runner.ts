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
  childComponents?: ComponentSpec[];
  registerChildren?: boolean;
}

export interface ComponentSpec {
  componentName: string;
  componentCode?: string;
  childComponents?: ComponentSpec[];
  components?: ComponentSpec[]; // Alternative property name for children
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
    
    // Generate child component registration code if needed
    let childComponentCode = '';
    if (options.registerChildren !== false && options.childComponents && options.childComponents.length > 0) {
      childComponentCode = this.generateChildComponentRegistration(options.childComponents);
    }
    
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
    
    // Register child components
    const registeredComponents = {};
    ${childComponentCode}
    
    const props = ${propsJson};
    
    // Add registered components to props if main component expects them
    if (Object.keys(registeredComponents).length > 0) {
      props.components = registeredComponents;
    }
    
    ${options.componentCode}
    
    // Render the component
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(Component, props));
  </script>
</body>
</html>`;
  }

  private generateChildComponentRegistration(specs: ComponentSpec[]): string {
    const registrationCode: string[] = [];
    
    // Recursively process all components in dependency order
    const processSpec = (spec: ComponentSpec, depth: number = 0) => {
      // Process children first (leaf nodes)
      const children = spec.childComponents || spec.components || [];
      children.forEach(child => processSpec(child, depth + 1));
      
      // Then register this component
      if (spec.componentCode) {
        registrationCode.push(`
    // Register ${spec.componentName}
    (function() {
      ${spec.componentCode}
      // Wrap the component to inject nested components
      const WrappedComponent = (props) => {
        return React.createElement(Component, { 
          ...props, 
          components: registeredComponents 
        });
      };
      registeredComponents['${spec.componentName}'] = WrappedComponent;
    })();`);
      }
    };
    
    // Process all specs
    specs.forEach(spec => processSpec(spec));
    
    // Return only the registration code (the object is declared in the HTML template)
    return registrationCode.join('\n');
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