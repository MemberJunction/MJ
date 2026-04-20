import { describe, it, expect } from 'vitest';

import {
  type ScheduledJobResult,
  type ScheduledJobConfiguration,
  type AgentJobConfiguration,
  type ActionJobConfiguration,
  type NotificationContent,
  type ScheduledJobRunStatus,
  type ScheduledJobStatus,
  type NotificationChannel,
} from '../types';

describe('Scheduling base-types exports', () => {
  describe('ScheduledJobResult', () => {
    it('should allow creating a success result', () => {
      const result: ScheduledJobResult = {
        Success: true,
      };
      expect(result.Success).toBe(true);
      expect(result.ErrorMessage).toBeUndefined();
    });

    it('should allow creating a failure result with error message', () => {
      const result: ScheduledJobResult = {
        Success: false,
        ErrorMessage: 'Something went wrong',
        Details: { AgentRunID: 'abc-123' },
      };
      expect(result.Success).toBe(false);
      expect(result.ErrorMessage).toBe('Something went wrong');
      expect(result.Details).toHaveProperty('AgentRunID');
    });
  });

  describe('AgentJobConfiguration', () => {
    it('should allow creating an agent job configuration', () => {
      const config: AgentJobConfiguration = {
        AgentID: 'agent-001',
        ConversationID: 'conv-001',
        InitialMessage: 'Hello',
      };
      expect(config.AgentID).toBe('agent-001');
      expect(config.ConversationID).toBe('conv-001');
    });
  });

  describe('ActionJobConfiguration', () => {
    it('should allow creating an action job configuration', () => {
      const config: ActionJobConfiguration = {
        ActionID: 'action-001',
        Params: [
          { ActionParamID: 'p1', ValueType: 'Static', Value: 'hello' },
          { ActionParamID: 'p2', ValueType: 'SQL Statement', Value: 'SELECT 1' },
        ],
      };
      expect(config.ActionID).toBe('action-001');
      expect(config.Params).toHaveLength(2);
    });
  });

  describe('NotificationContent', () => {
    it('should allow creating notification content', () => {
      const notif: NotificationContent = {
        Subject: 'Job Complete',
        Body: 'Your job finished.',
        Priority: 'High',
      };
      expect(notif.Subject).toBe('Job Complete');
      expect(notif.Priority).toBe('High');
    });
  });

  describe('Type aliases', () => {
    it('should allow ScheduledJobRunStatus values', () => {
      const statuses: ScheduledJobRunStatus[] = ['Running', 'Completed', 'Failed', 'Cancelled', 'Timeout'];
      expect(statuses).toHaveLength(5);
    });

    it('should allow ScheduledJobStatus values', () => {
      const statuses: ScheduledJobStatus[] = ['Pending', 'Active', 'Paused', 'Disabled', 'Expired'];
      expect(statuses).toHaveLength(5);
    });

    it('should allow NotificationChannel values', () => {
      const channels: NotificationChannel[] = ['Email', 'InApp'];
      expect(channels).toHaveLength(2);
    });
  });
});
