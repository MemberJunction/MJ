import { RegisterClass } from '@memberjunction/global';
import { BufferBaseAction, BufferChannel } from '../buffer-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

interface FormattedChannel {
  id: string;
  service: string;
  displayName: string;
  name: string;
  type: string;
  avatar: string;
  timezone: string;
  isDisconnected: boolean;
  isQueuePaused: boolean;
  createdAt: string;
  serviceId: string;
}

function formatChannel(channel: BufferChannel): FormattedChannel {
  return {
    id: channel.id,
    service: channel.service,
    displayName: channel.displayName,
    name: channel.name,
    type: channel.type,
    avatar: channel.avatar,
    timezone: channel.timezone,
    isDisconnected: channel.isDisconnected,
    isQueuePaused: channel.isQueuePaused,
    createdAt: channel.createdAt,
    serviceId: channel.serviceId,
  };
}

function groupByService(channels: FormattedChannel[]): Record<string, number> {
  return channels.reduce(
    (acc, ch) => {
      const svc = ch.service || 'unknown';
      acc[svc] = (acc[svc] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

/**
 * Retrieves all connected channels (formerly "profiles") for a Buffer organization.
 */
@RegisterClass(BaseAction, 'BufferGetChannelsAction')
export class BufferGetChannelsAction extends BufferBaseAction {
  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params } = params;

    try {
      const authError = await this.ensureAuthenticated(params);
      if (authError) return authError;

      const organizationId = await this.resolveOrganizationId(Params);
      const channels = await this.fetchChannels(organizationId);
      const formatted = channels.map(formatChannel);

      const summary = {
        totalChannels: formatted.length,
        channelsByService: groupByService(formatted),
        disconnected: formatted.filter((c) => c.isDisconnected).length,
      };

      this.setOutputParam(Params, 'Channels', formatted);
      this.setOutputParam(Params, 'Summary', summary);

      return { Success: true, ResultCode: 'SUCCESS', Message: `Retrieved ${formatted.length} Buffer channels`, Params };
    } catch (error) {
      return this.buildErrorResult(error, 'get Buffer channels', Params);
    }
  }

  public get Params(): ActionParam[] {
    return [...this.bufferCommonParams, { Name: 'Channels', Type: 'Output', Value: null }, { Name: 'Summary', Type: 'Output', Value: null }];
  }

  public get Description(): string {
    return 'Retrieves all Buffer channels (connected social media accounts) for the organization';
  }
}
