import { vi } from 'vitest';
import type { JSONObject, RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient, type RealtimeChannelContext } from '../channels/base-realtime-channel-client';
import type { RealtimeChannelVerbResult } from '../channels/channel-contract-types';

/** A recording host context for a channel under test. */
export interface FakeChannelContext extends RealtimeChannelContext {
    Notes: string[];
}

/** Builds a minimal host context; every member the base class reads is present and recorded. */
export function makeChannelContext(overrides: Partial<RealtimeChannelContext> = {}): FakeChannelContext {
    const notes: string[] = [];
    const ctx = {
        AgentName: 'Sage',
        Provider: null,
        SendContextNote: (text: string) => {
            notes.push(text);
        },
        RequestSave: vi.fn(),
        SetFocusMode: vi.fn(),
        SaveAsArtifact: vi.fn(async () => null),
        AgentSessionID: 'session-1',
        ExecuteServerAction: vi.fn(async () => null),
        Notes: notes,
        ...overrides,
    } as FakeChannelContext;
    return ctx;
}

/** A v1-style channel: only the legacy members, so the v2 members must be synthesized. */
export class LegacyEchoChannel extends BaseRealtimeChannelClient {
    public Applied: Array<{ ToolName: string; ArgsJson: string }> = [];
    public get ChannelName(): string {
        return 'Echo';
    }
    public override get ToolNamePrefix(): string {
        return 'Echo_';
    }
    public override get TabTitle(): string {
        return 'Echo';
    }
    public override GetToolDefinitions(): RealtimeToolDefinition[] {
        return [
            { Name: 'Echo_Say', Description: 'Say a phrase', ParametersSchema: { type: 'object', properties: { phrase: { type: 'string' } }, required: ['phrase'] } },
        ];
    }
    public override ApplyAgentTool(toolName: string, argsJson: string): string {
        this.Applied.push({ ToolName: toolName, ArgsJson: argsJson });
        return JSON.stringify({ success: true, said: argsJson });
    }
}

/** A v2-style channel: authored descriptor, `ApplyVerb`, state, and the change/open/complete members. */
export class FormChannel extends BaseRealtimeChannelClient {
    public State: JSONObject = { fields: { name: '' } };
    public Opened: JSONObject | null = null;
    public get ChannelName(): string {
        return 'Form';
    }
    public override get TabTitle(): string {
        return 'Form';
    }
    public override GetDescriptor() {
        return {
            Key: 'Form',
            Version: '2.0.0',
            DisplayName: 'Form',
            Instructions: 'A form the user fills in.',
            Nouns: [{ Name: 'fields', Description: 'The form fields', Schema: { type: 'object', properties: { name: { type: 'string' } } } }],
            Verbs: [
                {
                    Name: 'SetField',
                    Description: 'Set a field',
                    ParametersSchema: { type: 'object', properties: { name: { type: 'string' }, value: { type: 'string' } }, required: ['name', 'value'], additionalProperties: false },
                    InvokableBy: 'any' as const,
                },
                { Name: 'Confirm', Description: 'Submit the form', ParametersSchema: { type: 'object' }, InvokableBy: 'user' as const },
            ],
            Inputs: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
            Output: { type: 'object', properties: { submitted: { type: 'boolean' } }, required: ['submitted'] },
            DisplayPolicy: 'on-demand' as const,
            DefaultAvailability: 'opt-in' as const,
            MaxExposure: 'state' as const,
        };
    }
    public override GetState(): JSONObject {
        return this.State;
    }
    public override ApplyVerb(verb: string, args: JSONObject): RealtimeChannelVerbResult {
        if (verb === 'SetField') {
            this.State = { fields: { ...(this.State['fields'] as JSONObject), [String(args['name'])]: args['value'] as string } };
            this.RecordChange({ Author: 'agent' });
            return { Success: true, Result: { set: true } };
        }
        return { Success: false, ErrorCode: 'verb_failed', Error: `no ${verb}` };
    }
    protected override OnOpen(inputs: JSONObject): void {
        this.Opened = inputs;
    }
    public Submit(): void {
        this.Complete({ submitted: true });
    }
    public Change(): number {
        return this.RecordChange({ Author: 'user' });
    }
}
