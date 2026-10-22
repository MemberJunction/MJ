import fs from 'fs';
import path from 'path';

export interface LogEntry {
  timestamp: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'SUCCESS' | 'TRACE';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  category: 'SYSTEM' | 'AGENT' | 'TOOL' | 'AI_MODEL' | 'DECISION' | 'USER' | 'DATABASE';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  message: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  data?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  duration?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  stepNumber?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
}

export interface ExecutionSummary {
  executionId: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  command: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  startTime: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  endTime?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  duration?: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  agentName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  actionName?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  userPrompt?: string;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  totalSteps: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  successfulSteps: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  failedSteps: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  toolsUsed: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  subAgentsUsed: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  aiModelCalls: number;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  errors: string[];  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
  finalResult?: any;  // case-violation-ok-legacy-back-compat: the type is named in an exported signature, so consumers build object literals against it; an interface has no runtime carrier for a stub
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
    this.Log('INFO', 'SYSTEM', `Execution started: ${command}`, {
      executionId: this.executionId,
      agentName,
      actionName,
      userPrompt
    });
  }

  public Log(level: LogEntry['level'], category: LogEntry['category'], message: string, data?: any, duration?: number): void {
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

  /** @deprecated Use {@link Log}. */
  public log(level: LogEntry['level'], category: LogEntry['category'], message: string, data?: any, duration?: number): void {
    return this.Log(level, category, message, data, duration);
  }

  public LogStep(level: LogEntry['level'], category: LogEntry['category'], stepName: string, data?: any, duration?: number): void {
    this.stepCounter++;
    this.summary.totalSteps++;
    
    if (level === 'SUCCESS') {
      this.summary.successfulSteps++;
    } else if (level === 'ERROR') {
      this.summary.failedSteps++;
    }

    this.Log(level, category, `Step ${this.stepCounter}: ${stepName}`, data, duration);
  }

  /** @deprecated Use {@link LogStep}. */
  public logStep(level: LogEntry['level'], category: LogEntry['category'], stepName: string, data?: any, duration?: number): void {
    return this.LogStep(level, category, stepName, data, duration);
  }

  public LogAgentExecution(agentName: string, phase: string, data?: any, duration?: number): void {
    this.Log('DEBUG', 'AGENT', `Agent execution - ${agentName}: ${phase}`, {
      agentName,
      phase,
      executionData: data,
      step: this.stepCounter
    }, duration);
  }

  /** @deprecated Use {@link LogAgentExecution}. */
  public logAgentExecution(agentName: string, phase: string, data?: any, duration?: number): void {
    return this.LogAgentExecution(agentName, phase, data, duration);
  }

  public LogError(error: string | Error, category: LogEntry['category'] = 'SYSTEM', context?: any): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    this.summary.errors.push(errorMessage);
    this.Log('ERROR', category, errorMessage, {
      stack: errorStack,
      context,
      step: this.stepCounter,
      errorType: error instanceof Error ? error.constructor.name : 'string',
      timestamp: new Date().toISOString()
    });
  }

  /** @deprecated Use {@link LogError}. */
  public logError(error: string | Error, category: LogEntry['category'] = 'SYSTEM', context?: any): void {
    return this.LogError(error, category, context);
  }

  public Finalize(status: 'SUCCESS' | 'FAILED' | 'CANCELLED', finalResult?: any, error?: string): void {
    this.summary.endTime = new Date().toISOString();
    this.summary.duration = new Date(this.summary.endTime).getTime() - new Date(this.summary.startTime).getTime();
    this.summary.status = status;
    this.summary.finalResult = finalResult;

    if (error && !this.summary.errors.includes(error)) {
      this.summary.errors.push(error);
    }

    // Final log entry
    this.Log('INFO', 'SYSTEM', `Execution completed with status: ${status}`, {
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

  /** @deprecated Use {@link Finalize}. */
  public finalize(status: 'SUCCESS' | 'FAILED' | 'CANCELLED', finalResult?: any, error?: string): void {
    return this.Finalize(status, finalResult, error);
  }

  public GetExecutionId(): string {
    return this.executionId;
  }

  /** @deprecated Use {@link GetExecutionId}. */
  public getExecutionId(): string {
    return this.GetExecutionId();
  }

  public GetLogFilePath(): string {
    return this.logFilePath;
  }

  /** @deprecated Use {@link GetLogFilePath}. */
  public getLogFilePath(): string {
    return this.GetLogFilePath();
  }

  public GetSummaryFilePath(): string {
    return this.summaryFilePath;
  }

  /** @deprecated Use {@link GetSummaryFilePath}. */
  public getSummaryFilePath(): string {
    return this.GetSummaryFilePath();
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

export function CreateExecutionLogger(command: string, agentName?: string, actionName?: string, userPrompt?: string): ExecutionLogger {
  return new ExecutionLogger(command, agentName, actionName, userPrompt);
}

/** @deprecated Use {@link CreateExecutionLogger}. */
export function createExecutionLogger(command: string, agentName?: string, actionName?: string, userPrompt?: string): ExecutionLogger {
  return CreateExecutionLogger(command, agentName, actionName, userPrompt);
}