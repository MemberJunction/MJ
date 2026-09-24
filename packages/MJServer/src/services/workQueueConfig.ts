/**
 * @fileoverview The `workQueue` configuration section. Kept out of config.ts so it can be tested without
 * config.ts's module-load database validation.
 * @module MJServer/services
 */
import { z } from 'zod';

export const workQueueSubscriptionEntrySchema = z.object({
  /** A subscription name, or '*' for every MJWorker subscription. */
  name: z.string().min(1),
  /** Deliveries this instance processes concurrently for the subscription. */
  concurrency: z.number().int().positive().optional().default(4),
});

/**
 * Durable work-queue host. When enabled, this process runs its share of MJWorker subscriptions. Every claim is atomic
 * against shared state, so any number of instances may enable it against one database.
 */
export const workQueueSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    systemUserEmail: z.string().optional().default('system@memberjunction.org'),
    subscriptions: z.array(workQueueSubscriptionEntrySchema).optional().default([{ name: '*', concurrency: 4 }]),
    idlePollMinMs: z.number().int().positive().optional().default(250),
    idlePollMaxMs: z.number().int().positive().optional().default(5000),
    shutdownDrainMs: z.number().int().nonnegative().optional().default(8000),
    sweeperEnabled: z.boolean().optional().default(true),
    sweeperIntervalMs: z.number().int().positive().optional().default(60000),
    reconcileIntervalMs: z.number().int().nonnegative().optional().default(30000),
  })
  .refine(config => config.idlePollMaxMs >= config.idlePollMinMs, {
    message: 'workQueue.idlePollMaxMs must be >= workQueue.idlePollMinMs',
    path: ['idlePollMaxMs'],
  });

export type WorkQueueConfig = z.infer<typeof workQueueSchema>;

/**
 * The merge base for mj.config.cjs. Like scheduledJobs and integrationSyncWorker, the EFFECTIVE default system user
 * is the placeholder: set workQueue.systemUserEmail explicitly, or StartWorkQueueHost fails fast and says so.
 */
export const DEFAULT_WORK_QUEUE_CONFIG: WorkQueueConfig = {
  enabled: false,
  systemUserEmail: 'not.set@nowhere.com',
  subscriptions: [{ name: '*', concurrency: 4 }],
  idlePollMinMs: 250,
  idlePollMaxMs: 5000,
  shutdownDrainMs: 8000,
  sweeperEnabled: true,
  sweeperIntervalMs: 60000,
  reconcileIntervalMs: 30000,
};
