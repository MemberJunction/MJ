import { LogStatus, LogError } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { GetReadWriteDataSource } from '../util.js';
import { AskSkipResolver } from '../resolvers/AskSkipResolver.js';
import { DataSourceInfo } from '../types.js';
import { getSystemUser } from '../auth/index.js';
import { BaseSingleton } from '@memberjunction/global';

/**
 * A simple scheduler for the Skip AI learning cycle
 * Implements BaseSingleton pattern for cross-instance synchronization
 */
export class LearningCycleScheduler extends BaseSingleton<LearningCycleScheduler> {
  private intervalId: NodeJS.Timeout | null = null;
  
  // Track executions by organization ID instead of a global flag
  private runningOrganizations: Map<string, { startTime: Date, learningCycleId: string }> = new Map();
  
  private lastRunTime: Date | null = null;
  private dataSources: DataSourceInfo[] = [];
  
  // Protected constructor to enforce singleton pattern via BaseSingleton
  protected constructor() {
    super();
  }
  
  public static get Instance(): LearningCycleScheduler {
    return super.getInstance<LearningCycleScheduler>();
  }
  
  /**
   * Set the data sources for the scheduler
   * @param dataSources Array of data sources
   */
  public setDataSources(dataSources: DataSourceInfo[]): void {
    this.dataSources = dataSources;
  }
  
  /**
   * Start the scheduler with the specified interval in minutes
   * @param intervalMinutes The interval in minutes between runs
   */
  public start(intervalMinutes: number = 60): void {
    
    // start learning cycle immediately upon the server start
    this.runLearningCycle()
      .catch(error => LogError(`Error in initial learning cycle: ${error}`));
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    LogStatus(`Starting learning cycle scheduler with interval of ${intervalMinutes} minutes`);
    
    // Schedule the recurring task
    this.intervalId = setInterval(() => {
      this.runLearningCycle()
        .catch(error => LogError(`Error in scheduled learning cycle: ${error}`));
    }, intervalMs);
  }
  
  /**
   * Stop the scheduler
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      LogStatus('Learning cycle scheduler stopped');
    }
  }
  
  /**
   * Run the learning cycle if it's not already running
   * @returns A promise that resolves when the learning cycle completes
   */
  public async runLearningCycle(): Promise<boolean> {
    const startTime = new Date();
    
    try {
      LogStatus('Starting scheduled learning cycle execution');

      // Make sure we have data sources
      if (!this.dataSources || this.dataSources.length === 0) {
        throw new Error('No data sources available for the learning cycle');
      }

      const dataSource = GetReadWriteDataSource(this.dataSources);
      
      // Get system user for operation
      const systemUser = await getSystemUser(dataSource);
      if (!systemUser) {
        throw new Error('System user not found');
      }
      
      // Create context for the resolver
      const context = {
        dataSource: dataSource,
        dataSources: this.dataSources,
        userPayload: {
          email: systemUser.Email,
          sessionId: `scheduler_${Date.now()}`,
          userRecord: systemUser,
          isSystemUser: true
        }
      };
      
      // Execute the learning cycle
      const skipResolver = new AskSkipResolver();
      const result = await skipResolver.ExecuteAskSkipLearningCycle(
        context,
        false // forceEntityRefresh
      );
      
      const endTime = new Date();
      const elapsedMs = endTime.getTime() - startTime.getTime();
      
      this.lastRunTime = startTime;
      
      if (result.success) {
        LogStatus(`Learning cycle completed successfully in ${elapsedMs}ms`);
        return true;
      } else {
        LogError(`Learning cycle failed after ${elapsedMs}ms: ${result.error}`);
        return false;
      }
    } catch (error) {
      LogError(`Error executing learning cycle: ${error}`);
      return false;
    } 
  }
  
  /**
   * Get the current status of the scheduler
   */
  public getStatus() {
    return {
      isSchedulerRunning: this.intervalId !== null,
      lastRunTime: this.lastRunTime
    };
  }
  
  /**
   * Manually execute a learning cycle run for testing purposes
   * This is intended for debugging/testing only and will force a run
   * even if the scheduler is not started
   * @returns A promise that resolves when the learning cycle completes
   */
  public async manuallyExecuteLearningCycle(): Promise<boolean> {
    console.log('🧪 Manually executing learning cycle for testing...');
    const result = await this.runLearningCycle();
    console.log(`🧪 Manual learning cycle execution completed with result: ${result ? 'Success' : 'Failed'}`);
    return result;
  }
}