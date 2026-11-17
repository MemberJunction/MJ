/**
 * @fileoverview Shared worker protocol and types for lazy browser-local ONNX/WASM
 * bi-encoder (`bge-small-en-v1.5`) and cross-encoder (`ms-marco-MiniLM-L-6-v2`)
 * execution. Used by both Stage 6C.1 (Edge Agent Pre-Discovery) and Stage 6C.2
 * (Client-Only Semantic Omnibox).
 *
 * @module @memberjunction/ng-conversations
 */

export type EdgeWorkerDevice = 'wasm' | 'webgpu';
export type EdgeWorkerDType = 'q8' | 'fp32' | 'fp16';

export interface EdgeWorkerInitOptions {
    BiEncoderModelId?: string;
    CrossEncoderModelId?: string;
    Device?: EdgeWorkerDevice;
    DType?: EdgeWorkerDType;
    LoadCrossEncoder?: boolean;
    LocalModelPath?: string;
    AllowRemoteModels?: boolean;
    WasmPaths?: string;
}

export type EdgeWorkerRequest =
    | {
          Type: 'init';
          RequestId: string;
          BiEncoderModelId?: string;
          CrossEncoderModelId?: string;
          Device?: EdgeWorkerDevice;
          DType?: EdgeWorkerDType;
          LoadCrossEncoder?: boolean;
          LocalModelPath?: string;
          AllowRemoteModels?: boolean;
          WasmPaths?: string;
      }
    | {
          Type: 'embed';
          RequestId: string;
          Texts: string[];
          ModelId?: string;
          Device?: EdgeWorkerDevice;
          DType?: EdgeWorkerDType;
      }
    | {
          Type: 'rerank';
          RequestId: string;
          Query: string;
          Documents: string[];
          ModelId?: string;
          Device?: EdgeWorkerDevice;
          DType?: EdgeWorkerDType;
      }
    | {
          Type: 'dispose';
          RequestId: string;
      };

export type EdgeWorkerReply =
    | {
          Type: 'ready';
          RequestId: string;
          BiEncoderModelId: string;
          CrossEncoderLoaded: boolean;
          LoadMs: number;
      }
    | {
          Type: 'embedded';
          RequestId: string;
          Vectors: ArrayBuffer[];
          Dimensions: number;
          DurationMs: number;
      }
    | {
          Type: 'reranked';
          RequestId: string;
          Logits: number[];
          DurationMs: number;
      }
    | {
          Type: 'disposed';
          RequestId: string;
      }
    | {
          Type: 'error';
          RequestId?: string;
          Message: string;
      };

/**
 * Bidirectional transport channel to the Edge AI worker. Production uses a real
 * browser `Worker`; Vitest suites inject deterministic in-memory ports.
 */
export interface EdgeWorkerPort {
    Post(message: EdgeWorkerRequest, transfer: Transferable[]): void;
    OnReply: ((reply: EdgeWorkerReply) => void) | null;
    Terminate(): void;
}
