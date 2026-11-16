import type { RealtimeVoiceOption } from '@memberjunction/ai';

/**
 * ElevenLabs' premade voices, by voice id — shared by both ElevenLabs realtime drivers (the Agents
 * Platform and Eleven Realtime), which take the same voice ids. Returned fresh per call so no
 * caller can mutate the shared list.
 */
export function ElevenLabsPremadeVoices(): RealtimeVoiceOption[] {
    return [
        { ID: '21m00Tcm4TlvDq8ikWAM', Name: 'Rachel' },
        { ID: 'pNInz6obpgDQGcFmaJgB', Name: 'Adam' },
        { ID: 'AZnzlk1XvdvUeBnXmlld', Name: 'Domi' },
        { ID: 'EXAVITQu4vr4xnSDxMaL', Name: 'Bella' },
        { ID: 'ErXwobaYiN019PkySvjV', Name: 'Antoni' },
        { ID: 'MF3mGyEYCl7XYWbV9V6O', Name: 'Elli' },
        { ID: 'TxGEqnHWrfWFTfGW9XjX', Name: 'Josh' },
        { ID: 'VR6AewLTigWG4xSOukaG', Name: 'Arnold' },
        { ID: 'yoZ06aMxZJJ28mfd3POQ', Name: 'Sam' },
    ];
}
