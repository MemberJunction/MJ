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
      lastRunTime: this.lastRunTime,
      runningOrganizations: Array.from(this.runningOrganizations.entries()).map(([orgId, info]) => ({
        organizationId: orgId,
        learningCycleId: info.learningCycleId,
        startTime: info.startTime,
        runningForMinutes: (new Date().getTime() - info.startTime.getTime()) / (1000 * 60)
      }))
    };
  }
  
  /**
   * Checks if an organization is currently running a learning cycle
   * @param organizationId The organization ID to check
   * @returns Whether the organization is running a cycle and details if running
   */
  public isOrganizationRunningCycle(
    organizationId: string
  ): { isRunning: boolean, startTime?: Date, learningCycleId?: string, runningForMinutes?: number } {
    const runningInfo = this.runningOrganizations.get(organizationId);
    
    if (runningInfo) {
      // Check if it's been running too long and should be considered stalled
      const now = new Date();
      const elapsedMinutes = (now.getTime() - runningInfo.startTime.getTime()) / (1000 * 60);
      
      return { 
        isRunning: true, 
        startTime: runningInfo.startTime,
        learningCycleId: runningInfo.learningCycleId,
        runningForMinutes: elapsedMinutes
      };
    }
    
    return { isRunning: false };
  }

  /**
   * Registers an organization as running a learning cycle
   * @param organizationId The organization ID to register
   * @param learningCycleId The ID of the learning cycle
   * @returns true if successfully registered, false if already running
   */
  public registerRunningCycle(organizationId: string, learningCycleId: string): boolean {
    // First check if already running
    const { isRunning } = this.isOrganizationRunningCycle(organizationId);
    
    if (isRunning) {
      return false;
    }
    
    // Register the organization as running a cycle
    this.runningOrganizations.set(organizationId, {
      startTime: new Date(),
      learningCycleId
    });
    
    return true;
  }

  /**
   * Unregisters an organization after its learning cycle completes
   * @param organizationId The organization ID to unregister
   * @returns true if successfully unregistered, false if wasn't registered
   */
  public unregisterRunningCycle(organizationId: string): boolean {
    if (this.runningOrganizations.has(organizationId)) {
      this.runningOrganizations.delete(organizationId);
      return true;
    }
    
    return false;
  }
  
  /**
   * Manually execute a learning cycle run for testing purposes
   * This is intended for debugging/testing only and will force a run
   * even if the scheduler is not started
   * @param organizationId Optional organization ID to register for the manual run
   * @returns A promise that resolves when the learning cycle completes
   */
  public async manuallyExecuteLearningCycle(organizationId?: string): Promise<boolean> {
    try {
      LogStatus('🧪 Manually executing learning cycle for testing...');
      
      // If an organization ID is provided, register it as running
      const learningCycleId = `manual_${Date.now()}`;
      let orgRegistered = false;
      
      if (organizationId) {
        // Check if already running
        const runningStatus = this.isOrganizationRunningCycle(organizationId);
        
        if (runningStatus.isRunning) {
          LogError(`Organization ${organizationId} is already running a learning cycle. Cannot start a new one.`);
          return false;
        }
        
        // Register this organization
        orgRegistered = this.registerRunningCycle(organizationId, learningCycleId);
        if (!orgRegistered) {
          LogError(`Failed to register organization ${organizationId} for manual learning cycle execution`);
          return false;
        }
      }
      
      // Run the learning cycle
      const result = await this.runLearningCycle();
      LogStatus(`🧪 Manual learning cycle execution completed with result: ${result ? 'Success' : 'Failed'}`);
      
      // Unregister the organization if it was registered
      if (organizationId && orgRegistered) {
        this.unregisterRunningCycle(organizationId);
      }
      
      return result;
    } catch (error) {
      // Make sure to unregister on error
      if (organizationId && this.runningOrganizations.has(organizationId)) {
        this.unregisterRunningCycle(organizationId);
      }
      
      LogError(`Error in manual learning cycle execution: ${error}`);
      return false;
    }
  }
  
  /**
   * Force stop a running learning cycle for an organization
   * @param organizationId The organization ID to stop the cycle for
   * @returns Information about the stopped cycle
   */
  public stopLearningCycleForOrganization(organizationId: string): { 
    success: boolean, 
    message: string,
    wasRunning: boolean,
    cycleDetails?: { learningCycleId: string, startTime: Date, runningForMinutes: number }
  } {
    // Check if this organization has a running cycle
    const runningStatus = this.isOrganizationRunningCycle(organizationId);
    
    if (!runningStatus.isRunning) {
      return {
        success: false,
        message: `No running learning cycle found for organization ${organizationId}`,
        wasRunning: false
      };
    }
    
    // Capture details before unregistering
    const startTime = runningStatus.startTime!;
    const learningCycleId = runningStatus.learningCycleId!;
    const runningForMinutes = runningStatus.runningForMinutes!;
    
    // Unregister the organization
    const unregistered = this.unregisterRunningCycle(organizationId);
    
    if (unregistered) {
      return {
        success: true,
        message: `Successfully stopped learning cycle for organization ${organizationId}`,
        wasRunning: true,
        cycleDetails: {
          learningCycleId,
          startTime,
          runningForMinutes
        }
      };
    } else {
      return {
        success: false,
        message: `Failed to stop learning cycle for organization ${organizationId}`,
        wasRunning: true
      };
    }
  }
}