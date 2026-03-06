// Model registry for pluggable model selection

export interface BrowserModelDefinition {
  Id: string;
  Name: string;
  HuggingFaceId: string;
  DType: string;
  RequiresWebGPU: boolean;
  ApproxSizeMB: number;
  MaxNewTokens: number;
  DefaultTemperature: number;
  Category: 'chat' | 'speech' | 'embeddings';
}

export const BROWSER_CHAT_MODELS: BrowserModelDefinition[] = [
  {
    Id: 'phi-4-mini',
    Name: 'Phi-4 Mini Instruct',
    HuggingFaceId: 'onnx-community/Phi-4-mini-instruct-web-q4f16',
    DType: 'q4f16',
    RequiresWebGPU: true,
    ApproxSizeMB: 2200,
    MaxNewTokens: 2048,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'phi-3.5-mini',
    Name: 'Phi-3.5 Mini Instruct',
    HuggingFaceId: 'onnx-community/Phi-3.5-mini-instruct-onnx-web',
    DType: 'q4f16',
    RequiresWebGPU: true,
    ApproxSizeMB: 2100,
    MaxNewTokens: 2048,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'smollm2-1.7b',
    Name: 'SmolLM2 1.7B Instruct',
    HuggingFaceId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct',
    DType: 'q4',
    RequiresWebGPU: false,
    ApproxSizeMB: 900,
    MaxNewTokens: 1024,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
  {
    Id: 'smollm2-360m',
    Name: 'SmolLM2 360M Instruct',
    HuggingFaceId: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    DType: 'q4',
    RequiresWebGPU: false,
    ApproxSizeMB: 200,
    MaxNewTokens: 512,
    DefaultTemperature: 0.7,
    Category: 'chat',
  },
];

/** Select the best available chat model based on device capabilities. */
export async function SelectBestChatModel(): Promise<BrowserModelDefinition> {
  const hasWebGPU = await DetectWebGPU();
  if (hasWebGPU) {
    return BROWSER_CHAT_MODELS[0]; // Phi-4 Mini
  }
  // Fall back to first model that doesn't require WebGPU
  return (
    BROWSER_CHAT_MODELS.find((m) => !m.RequiresWebGPU) ??
    BROWSER_CHAT_MODELS[BROWSER_CHAT_MODELS.length - 1]
  );
}

export async function DetectWebGPU(): Promise<boolean> {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await (navigator as Navigator & { gpu: GPU }).gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}
