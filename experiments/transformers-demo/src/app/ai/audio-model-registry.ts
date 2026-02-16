export interface AudioModelDefinition {
  Id: string;
  Name: string;
  HuggingFaceId: string;
  DType?: string;
  RequiresWebGPU: boolean;
  ApproxSizeMB: number;
  Category: 'stt' | 'llm' | 'tts';
  // STT-specific
  SampleRate?: number;
  ChunkDuration?: number;  // For Whisper, typically 30s
  // TTS-specific
  SpeakerEmbeddingUrl?: string;  // For SpeechT5
}

export interface AudioModelConfig {
  STT: AudioModelDefinition;
  LLM: AudioModelDefinition;
  TTS: AudioModelDefinition;
}

export const AUDIO_MODEL_REGISTRY = {
  STT: [
    {
      Id: 'whisper-tiny',
      Name: 'Whisper Tiny',
      HuggingFaceId: 'onnx-community/whisper-tiny',
      RequiresWebGPU: false,
      ApproxSizeMB: 75,
      Category: 'stt' as const,
      SampleRate: 16000,
      ChunkDuration: 30,
    },
    {
      Id: 'whisper-base',
      Name: 'Whisper Base',
      HuggingFaceId: 'onnx-community/whisper-base',
      RequiresWebGPU: false,
      ApproxSizeMB: 140,
      Category: 'stt' as const,
      SampleRate: 16000,
      ChunkDuration: 30,
    },
    {
      Id: 'whisper-small',
      Name: 'Whisper Small',
      HuggingFaceId: 'onnx-community/whisper-small',
      RequiresWebGPU: true,
      ApproxSizeMB: 500,
      Category: 'stt' as const,
      SampleRate: 16000,
      ChunkDuration: 30,
    },
  ],
  LLM: [
    {
      Id: 'smollm2-360m',
      Name: 'SmolLM2 360M',
      HuggingFaceId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
      DType: 'q4',
      RequiresWebGPU: false,
      ApproxSizeMB: 200,
      Category: 'llm' as const,
    },
    {
      Id: 'smollm2-1.7b',
      Name: 'SmolLM2 1.7B',
      HuggingFaceId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
      DType: 'q4',
      RequiresWebGPU: false,
      ApproxSizeMB: 900,
      Category: 'llm' as const,
    },
    {
      Id: 'phi-3.5-mini',
      Name: 'Phi-3.5 Mini',
      HuggingFaceId: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
      DType: 'q4f16',
      RequiresWebGPU: true,
      ApproxSizeMB: 2100,
      Category: 'llm' as const,
    },
    {
      Id: 'phi-4-mini',
      Name: 'Phi-4 Mini',
      HuggingFaceId: 'onnx-community/Phi-4-mini-instruct-web-q4f16',
      DType: 'q4f16',
      RequiresWebGPU: true,
      ApproxSizeMB: 2200,
      Category: 'llm' as const,
    },
  ],
  TTS: [
    {
      Id: 'speecht5',
      Name: 'SpeechT5',
      HuggingFaceId: 'microsoft/speecht5_tts',
      RequiresWebGPU: false,
      ApproxSizeMB: 120,
      Category: 'tts' as const,
      SpeakerEmbeddingUrl: 'https://huggingface.co/datasets/Matthijs/cmu-arctic-xvectors/resolve/main/cmu_us_bdl_arctic-wav-arctic_a0009.bin',
    },
  ],
};
