/**
 * Silero VAD — ONNX-based, higher-quality alternative to `EnergyVAD`.
 *
 * `onnxruntime-node` is loaded via a memoized dynamic import. This falls under
 * CLAUDE.md category 2 — "optional peer dependency" — declared in this
 * package's `optionalDependencies` so consumers that don't need Silero don't
 * pay the native-binding install cost.
 *
 * NOTE: This class currently exists to satisfy `ClassFactory` resolution for
 * `VoiceCascadedConfig.vad.driverClass = 'SileroVAD'`. The actual ONNX model
 * loading + inference loop lands in a follow-on sub-phase. Until then,
 * `EnergyVAD` is the working default for Phase 1(c).
 *
 * See `plans/audio-agent-architecture.md` section 4.5.
 */
import { RegisterClass } from '@memberjunction/global';
import { AudioFrame } from '@memberjunction/ai';
import { BaseVAD, VADConfig, VADEvent } from './BaseVAD';

let onnxModulePromise: Promise<typeof import('onnxruntime-node')> | null = null;

/**
 * Memoized loader for the optional `onnxruntime-node` dependency.
 * Surfaces a helpful error if the package isn't installed.
 */
async function loadOnnx(): Promise<typeof import('onnxruntime-node')> {
    if (!onnxModulePromise) {
        onnxModulePromise = import('onnxruntime-node').catch((err: unknown) => {
            const underlying = err instanceof Error ? err.message : String(err);
            throw new Error(
                `SileroVAD requires 'onnxruntime-node' (optionalDependency). ` +
                    `Install via 'npm install --save-optional onnxruntime-node'. Underlying: ${underlying}`
            );
        });
    }
    return onnxModulePromise;
}

@RegisterClass(BaseVAD, 'SileroVAD')
export class SileroVAD extends BaseVAD {
    constructor(config?: VADConfig) {
        super(config);
    }

    public async *DetectSpeech(_frames: AsyncIterable<AudioFrame>): AsyncIterable<VADEvent> {
        // Probe the optional dep so we fail loudly with a useful message if missing.
        await loadOnnx();
        throw new Error(
            'SileroVAD inference not yet implemented — Silero ONNX model loading lands in a ' +
                'follow-on sub-phase. Use EnergyVAD as the default VAD for Phase 1(c).'
        );
    }
}
