import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const generateContentMock = vi.hoisted(() => vi.fn());

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent: generateContentMock };
  },
  Modality: { IMAGE: 'IMAGE', TEXT: 'TEXT' },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: Function) => target };
});

import type { ImageModelInfo } from '@memberjunction/ai';
import { GeminiImageGenerator } from '../geminiImage';

/**
 * GeminiImageGenerator's model surface: the models GetModels() advertises, the model a request
 * runs on when the caller pins none, and the tie between the driver's model IDs and MJ's AI model
 * catalog (metadata/ai-models/.ai-models.json). NO network: the SDK client is mocked.
 */

/** Mirrors DEFAULT_IMAGE_MODEL in geminiImage.ts; a change there should fail here. */
const DEFAULT_IMAGE_MODEL = 'gemini-3-pro-image';

/** The pre-Stable ID GetModels() still lists. It has no catalog row of its own. */
const LEGACY_ALIAS = 'gemini-3-pro-image-preview';

const FULL_SIZES = ['1024x1024', '1536x1024', '1024x1536', '2048x2048', '3840x2160', '2160x3840'];

/** A response carrying one image. */
const IMAGE_RESPONSE = { candidates: [{ content: { parts: [{ inlineData: { data: 'aGk=', mimeType: 'image/png' } }] } }] };

/** The model each generateContent call was sent. */
function modelsSent(): string[] {
  return generateContentMock.mock.calls.map((c) => (c[0] as { model: string }).model);
}

/** The sizes and editing/variation support that differ between the advertised models. */
function capabilities(m: ImageModelInfo) {
  return {
    supportedSizes: m.supportedSizes,
    supportsEditing: m.supportsEditing,
    supportsVariations: m.supportsVariations,
  };
}

/**
 * Walks up from this test file to the directory that holds metadata/ai-models/.ai-models.json,
 * so the check does not depend on how deep the package sits in the repo.
 */
function findCatalogFile(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = join(dir, 'metadata', 'ai-models', '.ai-models.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error('metadata/ai-models/.ai-models.json not found above the Gemini package');
    }
    dir = parent;
  }
}

interface CatalogVendorRow {
  fields: { VendorID?: string; TypeID?: string; APIName?: string; DriverClass?: string };
}
interface CatalogModel {
  fields: { Name: string };
  relatedEntities?: { 'MJ: AI Model Vendors'?: CatalogVendorRow[] };
}

/** APIName of every Google inference-provider row whose driver is GeminiImageGenerator. */
function catalogGeminiImageAPINames(): Set<string> {
  const models = JSON.parse(readFileSync(findCatalogFile(), 'utf8')) as CatalogModel[];
  const names = new Set<string>();
  for (const model of models) {
    for (const row of model.relatedEntities?.['MJ: AI Model Vendors'] ?? []) {
      const f = row.fields;
      if (
        f.VendorID === '@lookup:MJ: AI Vendors.Name=Google' &&
        f.TypeID === '@lookup:MJ: AI Vendor Type Definitions.Name=Inference Provider' &&
        f.DriverClass === 'GeminiImageGenerator' &&
        f.APIName
      ) {
        names.add(f.APIName);
      }
    }
  }
  return names;
}

describe('GeminiImageGenerator', () => {
  let generator: GeminiImageGenerator;

  beforeEach(() => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue(IMAGE_RESPONSE);
    generator = new GeminiImageGenerator('key');
  });

  describe('GetModels', () => {
    it('lists the five Nano Banana IDs, Stable Pro first and the legacy alias last', async () => {
      const ids = (await generator.GetModels()).map((m) => m.id);
      expect(ids).toEqual([
        'gemini-3-pro-image',
        'gemini-nano-banana-2.1',
        'gemini-3.1-flash-image',
        'gemini-3.1-flash-lite-image',
        LEGACY_ALIAS,
      ]);
    });

    it('gives each model its own sizes and editing/variation support', async () => {
      const byId = new Map((await generator.GetModels()).map((m) => [m.id, capabilities(m)]));

      const full = { supportedSizes: FULL_SIZES, supportsEditing: true, supportsVariations: true };
      expect(byId.get('gemini-3-pro-image')).toEqual(full);
      expect(byId.get('gemini-nano-banana-2.1')).toEqual(full);
      expect(byId.get(LEGACY_ALIAS)).toEqual(full);
      // Nano Banana 2 adds 0.5K output.
      expect(byId.get('gemini-3.1-flash-image')).toEqual({ ...full, supportedSizes: ['512x512', ...FULL_SIZES] });
      // Nano Banana 2 Lite is 1K only, and makes no variations.
      expect(byId.get('gemini-3.1-flash-lite-image')).toEqual({
        supportedSizes: ['1024x1024', '1536x1024', '1024x1536'],
        supportsEditing: true,
        supportsVariations: false,
      });
    });

    it('advertises the default model', async () => {
      expect((await generator.GetModels()).map((m) => m.id)).toContain(DEFAULT_IMAGE_MODEL);
    });
  });

  describe('the model a request runs on', () => {
    const image = Buffer.from('png');

    it('is the default when the caller pins none', async () => {
      await generator.GenerateImage({ prompt: 'a cat' });
      await generator.EditImage({ prompt: 'a cat', image });
      await generator.CreateVariation({ image });

      expect(modelsSent()).toEqual([DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODEL]);
    });

    it('is the pinned model when the caller pins one', async () => {
      const pinned = 'gemini-3.1-flash-image';

      await generator.GenerateImage({ prompt: 'a cat', model: pinned });
      await generator.EditImage({ prompt: 'a cat', image, model: pinned });
      await generator.CreateVariation({ image, model: pinned });

      expect(modelsSent()).toEqual([pinned, pinned, pinned]);
    });
  });

  describe('the AI model catalog', () => {
    it('has a Google inference-provider row for every advertised ID except the legacy alias', async () => {
      const catalog = catalogGeminiImageAPINames();
      const advertised = (await generator.GetModels()).map((m) => m.id).filter((id) => id !== LEGACY_ALIAS);

      expect(advertised.filter((id) => !catalog.has(id))).toEqual([]);
    });
  });
});
