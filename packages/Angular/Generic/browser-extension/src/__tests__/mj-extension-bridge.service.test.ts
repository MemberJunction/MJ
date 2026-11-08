import { describe, it, expect } from 'vitest';
import {
    ExtensionExternalMessageRequest,
    ExtensionPingResponse,
    IMJExtensionExternalTransport,
    MJExtensionBridgeService,
} from '../lib/services/mj-extension-bridge.service';
import { ExtensionSessionHandoffAck } from '@memberjunction/browser-extension-core';

describe('MJExtensionBridgeService', () => {
    it('pings the extension via externally_connectable and updates IsExtensionConnected$', async () => {
        const service = new MJExtensionBridgeService();
        const mockTransport: IMJExtensionExternalTransport = {
            SendExternalMessage: async <TResponse>(
                _extId: string,
                msg: ExtensionExternalMessageRequest
            ): Promise<TResponse> => {
                if (msg.Type === 'MJ_EXT_PING') {
                    const res: ExtensionPingResponse = {
                        Installed: true,
                        Version: '6.2.0',
                        BrandSlug: 'mj-copilot',
                        ActiveTopology: 'topology-a-shared-daemon',
                    };
                    return res as unknown as TResponse;
                }
                throw new Error('Unexpected message type');
            },
        };
        service.SetTransport(mockTransport);

        const ping = await service.PingExtension('ext-id-123');
        expect(ping.Installed).toBe(true);
        expect(ping.BrandSlug).toBe('mj-copilot');
        expect(service.IsExtensionConnected).toBe(true);
    });

    it('launches a Guided Cross-Site Playbook with Topology A 0ms shared daemon handoff', async () => {
        const service = new MJExtensionBridgeService();
        const sentMessages: ExtensionExternalMessageRequest[] = [];
        const mockTransport: IMJExtensionExternalTransport = {
            SendExternalMessage: async <TResponse>(
                _extId: string,
                msg: ExtensionExternalMessageRequest
            ): Promise<TResponse> => {
                sentMessages.push(msg);
                const ack: ExtensionSessionHandoffAck = {
                    Accepted: true,
                    ActiveTopology: msg.Payload?.Topology ?? 'topology-a-shared-daemon',
                    ZeroBlipGuaranteed: true,
                    ExtensionVersion: '6.2.0',
                    BrandSlug: 'mj-copilot',
                };
                return ack as unknown as TResponse;
            },
        };
        service.SetTransport(mockTransport);

        const ack = await service.LaunchGuidedPlaybook('ext-id-123', {
            PlaybookID: 'hubspot-oauth-setup',
            TargetUrl: 'https://app.hubspot.com/developer',
            SessionID: 'sess-live-01',
            ConversationID: 'conv-live-01',
            AgentID: 'agent-sage',
            HostOrigin: 'https://central.company.com',
        });

        expect(ack.Accepted).toBe(true);
        expect(ack.ZeroBlipGuaranteed).toBe(true);
        expect(sentMessages.length).toBe(1);
        expect(sentMessages[0].Payload?.ActivePlaybook?.PlaybookID).toBe('hubspot-oauth-setup');
    });
});
