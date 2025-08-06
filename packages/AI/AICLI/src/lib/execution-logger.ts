import fs from 'fs';
import path from 'path';

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'SUCCESS' | 'TRACE';
  category: 'SYSTEM' | 'AGENT' | 'TOOL' | 'AI_MODEL' | 'DECISION' | 'USER' | 'DATABASE';
  message: string;
  data?: any;
  duration?: number;
  stepNumber?: number;
}

export interface ExecutionSummary {
  executionId: string;
  command: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  agentName?: string;
  actionName?: string;
  userPrompt?: string;
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  toolsUsed: string[];
  subAgentsUsed: string[];
  aiModelCalls: number;
  errors: string[];
  finalResult?: any;
}

export class ExecutionLogger {
  private logFilePath: string;
  private summaryFilePath: string;
  private executionId: string;
  private logs: LogEntry[] = [];
  private summary: ExecutionSummary;
  private stepCounter: number = 0;

  constructor(command: string, agentName?: string, actionName?: string, userPrompt?: string) {
    // Create timestamp for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    this.executionId = `${timestamp}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create output directory in a more appropriate location for oclif CLI
    const outputDir = path.join(process.cwd(), '.mj-ai', 'logs');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Create file paths
    this.logFilePath = path.join(outputDir, `${this.executionId}_execution.log`);
    this.summaryFilePath = path.join(outputDir, `${this.executionId}_summary.json`);

    // Initialize summary
    this.summary = {
      executionId: this.executionId,
      command,
      startTime: new Date().toISOString(),
      status: 'RUNNING',
      agentName,
      actionName,
      userPrompt,
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0,
      toolsUsed: [],
      subAgentsUsed: [],
      aiModelCalls: 0,
      errors: []
    };

    // Log session start
    this.log('INFO', 'SYSTEM', `Execution started: ${command}`, {
      executionId: this.executionId,
      agentName,
      actionName,
      userPrompt
    });
  }

  public log(level: LogEntry['level'], category: LogEntry['category'], message: string, data?: any, duration?: number): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      duration,
      stepNumber: this.stepCounter
    };

    this.logs.push(entry);
    this.updateSummaryFromLog(entry);
    this.writeLogEntry(entry);
  }

  public logStep(level: LogEntry['level'], category: LogEntry['category'], stepName: string, data?: any, duration?: number): void {
    this.stepCounter++;
    this.summary.totalSteps++;
    
    if (level === 'SUCCESS') {
      this.summary.successfulSteps++;
    } else if (level === 'ERROR') {
      this.summary.failedSteps++;
    }

    this.log(level, category, `Step ${this.stepCounter}: ${stepName}`, data, duration);
  }

  public logAgentExecution(agentName: string, phase: string, data?: any, duration?: number): void {
    this.log('DEBUG', 'AGENT', `Agent execution - ${agentName}: ${phase}`, {
      agentName,
      phase,
      executionData: data,
      step: this.stepCounter
    }, duration);
  }

  public logError(error: string | Error, category: LogEntry['category'] = 'SYSTEM', context?: any): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    this.summary.errors.push(errorMessage);
    this.log('ERROR', category, errorMessage, {
      stack: errorStack,
      context,
      step: this.stepCounter,
      errorType: error instanceof Error ? error.constructor.name : 'string',
      timestamp: new Date().toISOString()
    });
  }

  public finalize(status: 'SUCCESS' | 'FAILED' | 'CANCELLED', finalResult?: any, error?: string): void {
    this.summary.endTime = new Date().toISOString();
    this.summary.duration = new Date(this.summary.endTime).getTime() - new Date(this.summary.startTime).getTime();
    this.summary.status = status;
    this.summary.finalResult = finalResult;

    if (error && !this.summary.errors.includes(error)) {
      this.summary.errors.push(error);
    }

    // Final log entry
    this.log('INFO', 'SYSTEM', `Execution completed with status: ${status}`, {
      duration: this.summary.duration,
      finalResult,
      error
    });

    // Write summary file
    this.writeSummary();

    // Write final log separator
    this.writeToFile('\n' + '='.repeat(80) + '\n' + 
                     `EXECUTION SUMMARY - ${status}\n` +
                     `Duration: ${this.summary.duration}ms\n` +
                     `Total Steps: ${this.summary.totalSteps}\n` +
                     `Successful: ${this.summary.successfulSteps}\n` +
                     `Failed: ${this.summary.failedSteps}\n` +
                     `Tools Used: ${this.summary.toolsUsed.join(', ') || 'None'}\n` +
                     `Sub-Agents: ${this.summary.subAgentsUsed.join(', ') || 'None'}\n` +
                     `AI Model Calls: ${this.summary.aiModelCalls}\n` +
                     `Errors: ${this.summary.errors.length}\n` +
                     '='.repeat(80) + '\n');
  }

  public getExecutionId(): string {
    return this.executionId;
  }

  public getLogFilePath(): string {
    return this.logFilePath;
  }

  public getSummaryFilePath(): string {
    return this.summaryFilePath;
  }

  private updateSummaryFromLog(entry: LogEntry): void {
    // Track various metrics based on log entries
    if (entry.level === 'ERROR') {
      if (!this.summary.errors.includes(entry.message)) {
        this.summary.errors.push(entry.message);
      }
    }
  }

  private writeLogEntry(entry: LogEntry): void {
    const logLine = this.formatLogEntry(entry);
    this.writeToFile(logLine + '\n');
  }

  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp;
    const level = entry.level.padEnd(7);
    const category = entry.category.padEnd(10);
    const stepInfo = entry.stepNumber ? `[Step ${entry.stepNumber.toString().padStart(3)}] ` : '';
    const durationInfo = entry.duration ? ` (${entry.duration}ms)` : '';
    
    let logLine = `${timestamp} | ${level} | ${category} | ${stepInfo}${entry.message}${durationInfo}`;
    
    // Add structured data on new lines if present
    if (entry.data) {
      const dataStr = JSON.stringify(entry.data, null, 2);
      logLine += `\n    DATA: ${dataStr.replace(/\n/g, '\n    ')}`;
    }
    
    return logLine;
  }

  private writeToFile(content: string): void {
    try {
      fs.appendFileSync(this.logFilePath, content, 'utf8');
    } catch (error) {
      // Silently fail to avoid breaking the CLI if logging fails
      console.error(`Failed to write to log file: ${error}`);
    }
  }

  private writeSummary(): void {
    try {
      fs.writeFileSync(this.summaryFilePath, JSON.stringify(this.summary, null, 2), 'utf8');
    } catch (error) {
      console.error(`Failed to write summary file: ${error}`);
    }
  }
}

export function createExecutionLogger(command: string, agentName?: string, actionName?: string, userPrompt?: string): ExecutionLogger {
  return new ExecutionLogger(command, agentName, actionName, userPrompt);
}