/**
 * @fileoverview Service module for managing scheduled job lifecycle
 * @module MJServer/services
 */

import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { SchedulingEngine } from '@memberjunction/scheduling-engine';
import { ScheduledJobsConfig } from '../config.js';

/**
 * Service for managing scheduled jobs lifecycle
 * Handles initialization, starting/stopping polling, and graceful shutdown
 */
export class ScheduledJobsService {
    private engine: SchedulingEngine;
    private systemUser: UserInfo | null = null;
    private isRunning: boolean = false;
    private config: ScheduledJobsConfig;

    constructor(config: ScheduledJobsConfig) {
        this.config = config;
        this.engine = SchedulingEngine.Instance;
    }

    /**
     * Initialize the scheduled jobs service
     * Loads metadata and prepares the engine
     */
    public async Initialize(): Promise<void> {
        if (!this.config.enabled) {
            LogStatus('[ScheduledJobsService] Scheduled jobs are disabled in configuration');
            return;
        }

        try {
            // Get system user for job execution
            this.systemUser = await this.getSystemUser();

            if (!this.systemUser) {
                throw new Error(`System user not found with email: ${this.config.systemUserEmail}`);
            }

            // Pre-load metadata cache
            await this.engine.Config(false, this.systemUser);
        } catch (error) {
            LogError('[ScheduledJobsService] Failed to initialize', undefined, error);
            throw error;
        }
    }

    /**
     * Start the scheduled jobs polling
     */
    public async Start(): Promise<void> {
        if (!this.config.enabled) {
            return;
        }

        if (this.isRunning) {
            LogStatus('[ScheduledJobsService] Already running');
            return;
        }

        if (!this.systemUser) {
            throw new Error('Service not initialized - call Initialize() first');
        }

        try {
            this.engine.StartPolling(this.systemUser);
            this.isRunning = true;

            // Single consolidated console message
            const interval = this.engine.ActivePollingInterval;
            const intervalDisplay = interval >= 60000
                ? `${Math.round(interval / 60000)} minute(s)`
                : `${Math.round(interval / 1000)} second(s)`;
            console.log(`📅 Scheduled Jobs: ${this.engine.ScheduledJobs.length} active job(s), polling every ${intervalDisplay}`);
        } catch (error) {
            LogError('[ScheduledJobsService] Failed to start polling', undefined, error);
            throw error;
        }
    }

    /**
     * Stop the scheduled jobs polling gracefully
     */
    public async Stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        try {
            LogStatus('[ScheduledJobsService] Stopping scheduled job polling');
            this.engine.StopPolling();
            this.isRunning = false;
            LogStatus('[ScheduledJobsService] Polling stopped successfully');
        } catch (error) {
            LogError('[ScheduledJobsService] Error stopping polling', undefined, error);
            throw error;
        }
    }

    /**
     * Get the system user for job execution
     * Uses the email configured in scheduledJobs.systemUserEmail
     */
    private async getSystemUser(): Promise<UserInfo | null> {
        const systemUserEmail = this.config.systemUserEmail;

        // Search UserCache for system user
        const user = UserCache.Users.find(u =>
            u.Email?.toLowerCase() === systemUserEmail.toLowerCase()
        );

        if (user) {
            return user;
        }

        LogError(`[ScheduledJobsService] System user not found with email: ${systemUserEmail}`);
        return null;
    }

    /**
     * Get current service status
     */
    public GetStatus(): {
        enabled: boolean;
        running: boolean;
        activeJobs: number;
        pollingInterval: number;
    } {
        return {
            enabled: this.config.enabled,
            running: this.isRunning,
            activeJobs: this.engine?.ScheduledJobs?.length || 0,
            pollingInterval: this.engine?.ActivePollingInterval || 0
        };
    }

    /**
     * Check if service is enabled in configuration
     */
    public get IsEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * Check if service is currently running
     */
    public get IsRunning(): boolean {
        return this.isRunning;
    }
}
