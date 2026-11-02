/**
 * @module @memberjunction/telephony-adapters
 * @description LiveKit SIP Telephony Server Extension: phone calls carried by a SIP trunk, landed in LiveKit rooms.
 */

import { RegisterClass } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import cors from 'cors';
import {
    BaseServerExtension,
    ServerExtensionPhase,
    ServerExtensionInitContext,
    ExtensionInitResult,
    ExtensionHealthResult,
} from '@memberjunction/server-extensions-core';
import { LiveKitAgentRoomCoordinator, LiveKitSipService, LiveKitWebhookParser, RoomAudioPlayer, RoomAuthorizationService } from '@memberjunction/livekit-room-server';
import { CreateBridgeRealtimeSession } from '@memberjunction/ai-agents';
import type { LiveKitSipSettings } from '../types.js';
import {
    CreateLiveKitSipRouter,
    DEFAULT_LIVEKIT_SIP_ROOM_PREFIX,
    LIVEKIT_SIP_MOUNT_PATH,
    LiveKitSipTelephonyService,
    ReadSharedTelephonySettings,
    ResolveInboundContext,
    SetLiveKitSipTelephonyService,
} from '../telephony/index.js';

@RegisterClass(BaseServerExtension, 'LiveKitSipExtension')
export class LiveKitSipExtension extends BaseServerExtension {
    public override get DefaultPhase(): ServerExtensionPhase {
        return 'pre-auth';
    }

    private service: LiveKitSipTelephonyService | null = null;
    private config: LiveKitSipSettings | null = null;
    private roomWatchTimer: ReturnType<typeof setInterval> | null = null;
    private seenSipRooms = new Set<string>();
    private isPollingRooms = false;

    public async Initialize(context: ServerExtensionInitContext): Promise<ExtensionInitResult> {
        const rawSettings = context.config.Settings as unknown as Partial<LiveKitSipSettings>;
        const sip = new LiveKitSipService({ ServerUrl: rawSettings?.serverUrl, ApiKey: rawSettings?.apiKey, ApiSecret: rawSettings?.apiSecret });
        if (!sip.IsConfigured) {
            return {
                Success: false,
                Skipped: true,
                Message: 'LiveKit SIP is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET, or telephony.livekitSip.serverUrl / apiKey / apiSecret)',
            };
        }

        const rootPath = context.config.RootPath || LIVEKIT_SIP_MOUNT_PATH;
        const config: LiveKitSipSettings = {
            serverUrl: rawSettings.serverUrl,
            apiKey: rawSettings.apiKey,
            apiSecret: rawSettings.apiSecret,
            roomPrefix: rawSettings.roomPrefix,
            numbers: rawSettings.numbers,
            inboundTrunkId: rawSettings.inboundTrunkId,
            outboundTrunkId: rawSettings.outboundTrunkId,
            outboundFromNumber: rawSettings.outboundFromNumber,
            autoProvision: rawSettings.autoProvision,
            allowedAddresses: rawSettings.allowedAddresses,
            carrier: rawSettings.carrier,
            ...ReadSharedTelephonySettings(rawSettings),
        };
        this.config = config;

        // The room coordinator opens the agent's model session through this factory. MJServer binds the same function;
        // binding it here too means a host that loads this extension does not depend on that import order.
        LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(CreateBridgeRealtimeSession);
        RoomAuthorizationService.Instance.SetSipRoomPrefix(config.roomPrefix);

        const service = new LiveKitSipTelephonyService(config, { sip });
        this.service = service;
        const parser = new LiveKitWebhookParser({ ServerUrl: config.serverUrl, ApiKey: config.apiKey, ApiSecret: config.apiSecret });
        context.app.use(rootPath, cors<cors.CorsRequest>(), CreateLiveKitSipRouter(service, parser, config));
        SetLiveKitSipTelephonyService(service);
        LiveKitAgentRoomCoordinator.Instance.SetRoomTeardownHook(async (roomName, contextUser, provider) => {
            void RoomAudioPlayer.Instance.StopAllInRoom(roomName);
            await service.HangUpRoom(roomName);
            this.seenSipRooms.delete(roomName);
            const ctx =
                contextUser && provider
                    ? { Ok: true as const, User: contextUser, Provider: provider }
                    : ResolveInboundContext(config.inboundRunAsUserEmail);
            if (ctx.Ok) {
                await service.HandleWebhookEvent(
                    {
                        Event: 'room_finished',
                        RoomName: roomName,
                        ParticipantIdentity: '',
                        IsSipParticipant: false,
                    },
                    ctx.User,
                    ctx.Provider
                );
            }
        });
        void service.Initialize();
        this.startRoomWatcher(service, sip, config);

        LogStatus(`[Telephony] LiveKit SIP webhook registered at ${rootPath}/webhook`);
        return {
            Success: true,
            Message: `LiveKit SIP webhook registered at ${rootPath}/webhook`,
            RegisteredRoutes: [`POST ${rootPath}/webhook`],
            Service: { key: 'LiveKitSipTelephonyService', instance: service },
        };
    }

    private startRoomWatcher(service: LiveKitSipTelephonyService, sip: LiveKitSipService, config: LiveKitSipSettings): void {
        const prefix = (config.roomPrefix ?? DEFAULT_LIVEKIT_SIP_ROOM_PREFIX).trim() || DEFAULT_LIVEKIT_SIP_ROOM_PREFIX;
        this.roomWatchTimer = setInterval(async () => {
            if (this.isPollingRooms || !this.service) return;
            this.isPollingRooms = true;
            try {
                const roomClient = (sip as unknown as { roomClient: () => { listRooms: () => Promise<Array<{ name: string }>> } }).roomClient();
                const rooms = await roomClient.listRooms();
                const currentCallRooms = new Set<string>();
                for (const r of rooms) {
                    if (!r.name || !r.name.startsWith(prefix)) continue;

                    const participants = await sip.ListParticipants(r.name);
                    const sipParticipant = participants.find((p) => p.IsSip);
                    if (!sipParticipant) {
                        if (participants.some((p) => p.Identity.startsWith('hold-'))) {
                            void RoomAudioPlayer.Instance.StopAllInRoom(r.name);
                            for (const p of participants.filter((pt) => pt.Identity.startsWith('hold-'))) {
                                void sip.RemoveParticipant(r.name, p.Identity).catch(() => undefined);
                            }
                        }
                        continue;
                    }

                    currentCallRooms.add(r.name);
                    if (this.seenSipRooms.has(r.name)) continue;

                    this.seenSipRooms.add(r.name);
                    const ctx = ResolveInboundContext(config.inboundRunAsUserEmail);
                    if (!ctx.Ok) continue;

                    const attrs = sipParticipant.Attributes ?? {};
                    await service.HandleWebhookEvent(
                        {
                            Event: 'participant_joined',
                            RoomName: r.name,
                            ParticipantIdentity: sipParticipant.Identity,
                            IsSipParticipant: true,
                            CallerNumber: attrs['sip.phoneNumber'] ?? attrs['sipPhoneNumber'],
                            DialedNumber: attrs['sip.trunkPhoneNumber'] ?? attrs['sipTrunkPhoneNumber'],
                            SipCallID: attrs['sip.callID'] ?? attrs['sipCallId'],
                        },
                        ctx.User,
                        ctx.Provider
                    );
                }

                for (const prevRoom of [...this.seenSipRooms]) {
                    if (!currentCallRooms.has(prevRoom)) {
                        this.seenSipRooms.delete(prevRoom);
                        void RoomAudioPlayer.Instance.StopAllInRoom(prevRoom);
                        const ctx = ResolveInboundContext(config.inboundRunAsUserEmail);
                        if (ctx.Ok) {
                            await service.HandleWebhookEvent(
                                {
                                    Event: 'room_finished',
                                    RoomName: prevRoom,
                                    ParticipantIdentity: '',
                                    IsSipParticipant: false,
                                },
                                ctx.User,
                                ctx.Provider
                            );
                        }
                    }
                }
            } catch {
                // Ignore transient room polling errors
            } finally {
                this.isPollingRooms = false;
            }
        }, 1500);
        this.roomWatchTimer.unref?.();
    }

    public async Shutdown(): Promise<void> {
        if (this.roomWatchTimer) {
            clearInterval(this.roomWatchTimer);
            this.roomWatchTimer = null;
        }
        this.seenSipRooms.clear();
        this.service?.Dispose();
        LiveKitAgentRoomCoordinator.Instance.SetRoomTeardownHook(undefined);
        SetLiveKitSipTelephonyService(undefined);
        this.service = null;
    }

    public async HealthCheck(): Promise<ExtensionHealthResult> {
        return {
            Name: 'LiveKitSipExtension',
            Healthy: !!this.service,
            Details: {
                configured: !!this.config,
                numbers: this.config?.numbers?.length ?? 0,
                outboundTrunk: Boolean(this.config?.outboundTrunkId),
            },
        };
    }
}
