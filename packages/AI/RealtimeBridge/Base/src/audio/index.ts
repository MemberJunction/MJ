/**
 * @fileoverview Public surface for the telephony audio transcode primitives — the pure G.711 μ-law
 * codec and the linear PCM16 resampler that native telephony SDKs use so the {@link ITelephonyCallSdk}
 * bridge seam always speaks PCM16 `ArrayBuffer`.
 *
 * @module @memberjunction/ai-bridge-base
 */
export * from './g711';
export * from './resample';
