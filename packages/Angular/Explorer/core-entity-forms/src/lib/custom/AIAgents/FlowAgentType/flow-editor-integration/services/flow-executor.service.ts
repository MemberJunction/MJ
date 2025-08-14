import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject, Observable, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Step, StepType } from '../models/step.model';
import { Connection } from '../models/connection.model';

export interface ExecutionLog {
  timestamp: Date;
  stepId: number;
  stepName: string;
  type: 'start' | 'complete' | 'error' | 'log';
  message: string;
  data?: any;
}

export interface StepExecutionResult {
  stepId: number;
  success: boolean;
  output: any;
  error?: string;
}

export interface ExecutionContext {
  variables: { [key: string]: any };
  results: { [stepId: number]: StepExecutionResult };
}

export type ExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

@Injectable({
  providedIn: 'root'
})
export class FlowExecutorService {
  private executionStatus$ = new BehaviorSubject<ExecutionStatus>('idle');
  private currentStepId$ = new BehaviorSubject<number | null>(null);
  private executionLogs$ = new BehaviorSubject<ExecutionLog[]>([]);
  private executionContext$ = new BehaviorSubject<ExecutionContext>({
    variables: {},
    results: {}
  });
  
  private stopExecution$ = new Subject<void>();
  private pauseExecution$ = new BehaviorSubject<boolean>(false);

  public executionStatus = this.executionStatus$.asObservable();
  public currentStepId = this.currentStepId$.asObservable();
  public executionLogs = this.executionLogs$.asObservable();
  public executionContext = this.executionContext$.asObservable();

  constructor() { }

  async executeFlow(steps: Step[], connections: Connection[]): Promise<void> {
    if (this.executionStatus$.value === 'running') {
      console.warn('Execution already in progress');
      return;
    }

    this.resetExecution();
    this.executionStatus$.next('running');

    try {
      const executionOrder = this.buildExecutionOrder(steps, connections);
      this.addLog(null, 'Flow', 'start', `Starting flow execution with ${executionOrder.length} steps`);

      for (const step of executionOrder) {
        if (this.executionStatus$.value === 'paused' || this.executionStatus$.value === 'idle' || this.executionStatus$.value === 'completed' || this.executionStatus$.value === 'error') {
          break;
        }

        await this.waitForUnpause();
        
        if (this.executionStatus$.value === 'paused' || this.executionStatus$.value === 'idle' || this.executionStatus$.value === 'completed' || this.executionStatus$.value === 'error') {
          break;
        }

        await this.executeStep(step, connections);
      }

      if (this.executionStatus$.value !== 'idle' && this.executionStatus$.value !== 'error' && this.executionStatus$.value !== 'completed' && this.executionStatus$.value !== 'paused') {
        this.executionStatus$.next('completed');
        this.addLog(null, 'Flow', 'complete', 'Flow execution completed successfully');
      }
    } catch (error) {
      this.executionStatus$.next('error');
      this.addLog(null, 'Flow', 'error', `Flow execution failed: ${error}`);
    } finally {
      this.currentStepId$.next(null);
    }
  }

  private async executeStep(step: Step, connections: Connection[]): Promise<void> {
    this.currentStepId$.next(step.id);
    this.addLog(step.id, step.name, 'start', `Executing ${step.type} step`);

    try {
      // Simulate execution delay
      await this.delay(1000);

      // Execute based on step type
      const result = await this.executeStepByType(step);
      
      // Store result in context
      const context = this.executionContext$.value;
      context.results[step.id] = result;
      this.executionContext$.next(context);

      this.addLog(step.id, step.name, 'complete', 'Step completed successfully', result.output);

      // Check conditions for next steps
      if (!result.success) {
        const errorConnections = connections.filter(c => 
          c.source === step.id && c.condition?.expression === 'error'
        );
        if (errorConnections.length > 0) {
          this.addLog(step.id, step.name, 'log', 'Taking error path');
        }
      }
    } catch (error) {
      this.addLog(step.id, step.name, 'error', `Step execution failed: ${error}`);
      throw error;
    }
  }

  private async executeStepByType(step: Step): Promise<StepExecutionResult> {
    const baseResult = {
      stepId: step.id,
      success: true,
      output: {}
    };

    switch (step.type) {
      case 'prompt':
        return this.executePromptStep(step, baseResult);
      case 'agent':
        return this.executeAgentStep(step, baseResult);
      case 'action':
        return this.executeActionStep(step, baseResult);
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  private async executePromptStep(step: Step, baseResult: StepExecutionResult): Promise<StepExecutionResult> {
    const promptType = step.selectedOption || 'system';
    const properties = step.propertyValues || {};
    
    await this.delay(500); // Simulate API call
    
    const mockResponses: { [key: string]: string } = {
      'system': 'System initialized with instructions',
      'user': 'User query processed successfully',
      'assistant': 'Assistant response generated'
    };

    return {
      ...baseResult,
      output: {
        type: promptType,
        message: properties['systemMessage'] || properties['userMessage'] || properties['assistantMessage'] || mockResponses[promptType],
        response: `Mock response for ${promptType} prompt`,
        tokens: Math.floor(Math.random() * 500) + 100
      }
    };
  }

  private async executeAgentStep(step: Step, baseResult: StepExecutionResult): Promise<StepExecutionResult> {
    const agentType = step.selectedOption || 'research';
    const properties = step.propertyValues || {};
    
    await this.delay(2000); // Simulate longer processing
    
    const mockResults: { [key: string]: any } = {
      'research': {
        sources: ['Wikipedia', 'ArXiv', 'Google Scholar'],
        findings: ['Finding 1', 'Finding 2', 'Finding 3'],
        summary: 'Research completed with 3 relevant sources'
      },
      'code': {
        language: properties['language'] || 'python',
        code: `# Generated code\ndef example():\n    return "Hello from ${agentType} agent"`,
        explanation: 'Code generated successfully'
      },
      'analysis': {
        type: properties['analysisType'] || 'statistical',
        results: { score: 0.85, confidence: 0.92 },
        summary: 'Analysis completed with high confidence'
      }
    };

    return {
      ...baseResult,
      output: mockResults[agentType] || { message: `${agentType} agent completed` }
    };
  }

  private async executeActionStep(step: Step, baseResult: StepExecutionResult): Promise<StepExecutionResult> {
    const actionType = step.selectedOption || 'api';
    const properties = step.propertyValues || {};
    
    await this.delay(1500); // Simulate action execution
    
    const mockResults: { [key: string]: any } = {
      'api': {
        endpoint: properties['endpoint'] || 'https://api.example.com',
        method: properties['method'] || 'GET',
        status: 200,
        response: { data: 'API call successful' }
      },
      'database': {
        query: properties['query'] || 'SELECT * FROM users',
        rows: 42,
        executionTime: '125ms'
      },
      'file': {
        operation: properties['operation'] || 'read',
        path: properties['filePath'] || '/tmp/example.txt',
        success: true,
        size: '2.5KB'
      }
    };

    return {
      ...baseResult,
      output: mockResults[actionType] || { message: `${actionType} action completed` }
    };
  }

  private buildExecutionOrder(steps: Step[], connections: Connection[]): Step[] {
    // Simple topological sort for execution order
    const visited = new Set<number>();
    const order: Step[] = [];
    
    // Find starting nodes (no incoming connections)
    const incomingCount = new Map<number, number>();
    steps.forEach(step => incomingCount.set(step.id, 0));
    connections.forEach(conn => {
      incomingCount.set(conn.target, (incomingCount.get(conn.target) || 0) + 1);
    });
    
    const startNodes = steps.filter(step => incomingCount.get(step.id) === 0);
    
    // DFS from each start node
    const visit = (step: Step) => {
      if (visited.has(step.id)) return;
      visited.add(step.id);
      order.push(step);
      
      // Find connected steps
      const nextConnections = connections.filter(c => c.source === step.id);
      nextConnections.forEach(conn => {
        const nextStep = steps.find(s => s.id === conn.target);
        if (nextStep) visit(nextStep);
      });
    };
    
    startNodes.forEach(visit);
    
    // Add any unvisited steps (disconnected nodes)
    steps.forEach(step => {
      if (!visited.has(step.id)) {
        order.push(step);
      }
    });
    
    return order;
  }

  pause(): void {
    if (this.executionStatus$.value === 'running') {
      this.executionStatus$.next('paused');
      this.pauseExecution$.next(true);
      this.addLog(null, 'Flow', 'log', 'Execution paused');
    }
  }

  resume(): void {
    if (this.executionStatus$.value === 'paused') {
      this.executionStatus$.next('running');
      this.pauseExecution$.next(false);
      this.addLog(null, 'Flow', 'log', 'Execution resumed');
    }
  }

  stop(): void {
    const currentStatus = this.executionStatus$.value;
    if (currentStatus === 'running' || currentStatus === 'paused') {
      this.executionStatus$.next('idle');
      this.stopExecution$.next();
      this.currentStepId$.next(null);
      this.addLog(null, 'Flow', 'log', 'Execution stopped by user');
    }
  }

  private async waitForUnpause(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pauseExecution$.value) {
        resolve();
        return;
      }
      
      const sub = this.pauseExecution$.subscribe(isPaused => {
        if (!isPaused) {
          sub.unsubscribe();
          resolve();
        }
      });
    });
  }

  private resetExecution(): void {
    this.executionLogs$.next([]);
    this.executionContext$.next({
      variables: {},
      results: {}
    });
    this.currentStepId$.next(null);
    this.pauseExecution$.next(false);
  }

  private addLog(stepId: number | null, stepName: string, type: ExecutionLog['type'], message: string, data?: any): void {
    const logs = this.executionLogs$.value;
    logs.push({
      timestamp: new Date(),
      stepId: stepId || 0,
      stepName,
      type,
      message,
      data
    });
    this.executionLogs$.next(logs);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = interval(ms).pipe(
        takeUntil(this.stopExecution$)
      ).subscribe(() => {
        timer.unsubscribe();
        resolve();
      });
    });
  }

  getExecutionSummary(): Observable<{
    totalSteps: number;
    completedSteps: number;
    errors: number;
    duration: number;
  }> {
    return new Observable(observer => {
      const logs = this.executionLogs$.value;
      const startLog = logs.find(l => l.type === 'start' && l.stepName === 'Flow');
      const endLog = logs.find(l => (l.type === 'complete' || l.type === 'error') && l.stepName === 'Flow');
      
      const summary = {
        totalSteps: logs.filter(l => l.type === 'start' && l.stepName !== 'Flow').length,
        completedSteps: logs.filter(l => l.type === 'complete' && l.stepName !== 'Flow').length,
        errors: logs.filter(l => l.type === 'error').length,
        duration: startLog && endLog ? endLog.timestamp.getTime() - startLog.timestamp.getTime() : 0
      };
      
      observer.next(summary);
      observer.complete();
    });
  }
}