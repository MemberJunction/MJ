/**
 * Headless Browser QA Agent for Testing AI-Generated Components
 * 
 * This system serves as a QA feedback loop for testing AI-generated HTML/JS artifacts
 * before they're sent to the Angular application. It:
 * 1. Takes AI-generated HTML/JS content
 * 2. Launches a headless browser to render the content
 * 3. Captures console errors and visual rendering issues
 * 4. Returns feedback to the AI for correction
 * 5. Repeats until no errors are found
 */

import * as fs from 'fs';
import * as path from 'path';
import { chromium, firefox, webkit, Browser, BrowserContext, Page, ConsoleMessage } from 'playwright';
import { v4 as uuidv4 } from 'uuid';

// This interface is used only for typing the expected shape of errors
// collected from the browser context, but we don't directly use 'window' in this context
export interface BrowserErrorData {
  type: string;
  text: string;
  location?: string;
  stackTrace?: string;
}

// Interface for configuration options
export interface QAOptions {
  browser: 'chromium' | 'firefox' | 'webkit';
  timeout: number;
  viewport: { width: number; height: number };
  storageDir: string;
  maxRetries: number;
  cssIncludes?: string[];
  scriptIncludes?: string[];
}

// Interface for test results
export interface TestResult {
  success: boolean;
  errors: ConsoleErrorData[];
  screenshot?: string; // Base64 encoded screenshot
}

// Interface for console error data - matched with BrowserErrorData for consistency
export interface ConsoleErrorData {
  type: string;
  error: any; // This can be a string or an object
  location?: string;
  stackTrace?: string;
}

export class AskSkipHTMLReportQAAgent {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: QAOptions;
  
  constructor(options: Partial<QAOptions> = {}) {
    // Default options
    this.options = {
      browser: options.browser || 'chromium',
      timeout: options.timeout || 30000,
      viewport: options.viewport || { width: 1280, height: 720 },
      storageDir: options.storageDir || path.join(process.cwd(), 'qa-tests'),
      maxRetries: options.maxRetries || 3,
      cssIncludes: options.cssIncludes || [],
      scriptIncludes: options.scriptIncludes || [],
    };
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.options.storageDir)) {
      fs.mkdirSync(this.options.storageDir, { recursive: true });
    }
  }
  
  /**
   * Initialize the browser
   */
  public async initialize(): Promise<void> {
    try {
      // Select the browser based on config
      switch (this.options.browser) {
        case 'firefox':
          this.browser = await firefox.launch();
          break;
        case 'webkit':
          this.browser = await webkit.launch();
          break;
        case 'chromium':
        default:
          this.browser = await chromium.launch();
      }
      
      // Create a browser context with viewport settings
      this.context = await this.browser.newContext({
        viewport: this.options.viewport,
        acceptDownloads: true
      });
      
      console.log(`Initialized ${this.options.browser} browser`);
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }
  
  /**
   * Close browser resources
   */
  public async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
  
  /**
   * Save HTML content to a temporary file
   */
  private saveToTempFile(content: string, extension: string = 'html'): string {
    const filename = `${uuidv4()}.${extension}`;
    const filePath = path.join(this.options.storageDir, filename);
    
    fs.writeFileSync(filePath, content);
    return filePath;
  }
  
  /**
   * Create a complete HTML document from a partial HTML component
   */
  private createCompleteHtml(reportHtml: string, reportObjectName: string): string {
    const initJs = `
        const reportObject = window['${reportObjectName}'];
        const dataContext = getDataContext(); // provided to playwright context via the exposeFunction call 
        if (reportObject && dataContext) {
            const userState = {};
            reportObject.init(dataContext, userState, {
                RefreshData: () => {
                    console.log('HTML Report requested data refresh');
                },
                OpenEntityRecord: (entityName, key) => {
                    console.log('HTML Report requested to open entity record:', entityName, key);
                },
                UpdateUserState: (userState) => {
                    console.log('HTML Report updated user state:', userState);
                },
                NotifyEvent: (eventName, eventData) => {
                    console.log('HTML Report notified event:', eventName, eventData);
                }
            });
        }
        else {
            if (!reportObject) {
                console.error('HTML Report object not found');
                logError(window);
                console.error('keys found in window:', Object.keys(window));
                //console.error(window); // pass the window object to the console for debugging
            }
            else {
                console.error('Data context is empty');
            }
        }
    `

    // Include any external resources or CSS frameworks needed by your components
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Component Test</title>
${this.options.cssIncludes ? this.options.cssIncludes.map(css => `          <link rel="stylesheet" href="${css}">`).join('\n') : ''}  
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .component-container { border: 1px solid #eee; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="component-container">
          ${reportHtml}
        </div>
        
${this.options.scriptIncludes ? this.options.scriptIncludes.map(script => `          <script src="${script}"></script>`).join('\n') : ''}      
        <script>
          // Error tracking - declare on window properly
          window.testErrors = [];
          window.originalConsoleError = console.error;
          console.error = function() {
            // call the logError function that is exposed to the page via exposeFunction
            //logError(Array.from(arguments).join(' '));
            logError(arguments);
            window.originalConsoleError.apply(console, arguments);
          };
          
          // JS to init the component here
          ${initJs}
        </script>
      </body>
      </html>
    `;
  }
  
  /**
   * Test a component and collect console errors
   */
  public async testComponent(
    reportHtml: string, 
    reportObjectName: string, 
    flattenedDataContext: Record<string, any>,
    includeScreenshot: boolean = true
  ): Promise<TestResult> {
    if (!this.browser || !this.context) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }
    
    // Create a complete HTML document
    const htmlContent = this.createCompleteHtml(reportHtml, reportObjectName);
    const filePath = this.saveToTempFile(htmlContent);
    const fileUrl = `file://${filePath}`;
    
    const page = await this.context.newPage();
    const consoleErrors: ConsoleErrorData[] = [];
    
    try {
        await page.exposeFunction('getDataContext', () => {
            return flattenedDataContext;
        });

        await page.exposeFunction('logError', (error: any) => {
            consoleErrors.push({
                type: 'js_error',
                error: error,    
                location: 'JavaScript'
            });
        });
        
        // Collect console messages
        page.on('console', (msg: ConsoleMessage) => {
          if (msg.type() === 'error') {
            consoleErrors.push({
              type: msg.type(),
              error: msg.text(),
              location: msg.location().url,
            });
          }
        });
        
        // Collect page errors
        page.on('pageerror', (error) => {
          consoleErrors.push({
            type: 'pageerror',
            error: error.message,
            stackTrace: error.stack
          });
        });
    
        await page.goto(fileUrl, { timeout: this.options.timeout, waitUntil: 'networkidle' });
      
        // Wait a bit for any JS to execute and potentially cause errors
        await page.waitForTimeout(1000);
               
        let screenshot = '';
        if (includeScreenshot) {
            // Take a screenshot for visual verification
            const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 80 });
            screenshot = screenshotBuffer.toString('base64');
        }
        
        return {
            success: consoleErrors.length === 0,
            errors: consoleErrors,
            screenshot: includeScreenshot ? screenshot : undefined
        };
    } catch (error) {
        console.error('Error during component testing:', error);
        return {
            success: false,
            errors: [{
            type: 'test_failure',
            error: `Failed to test component: ${(error as any).message}`
            }]
        };
    } finally {
        await page.close();
        // Clean up temp file
        fs.unlinkSync(filePath);
    }
  }
}