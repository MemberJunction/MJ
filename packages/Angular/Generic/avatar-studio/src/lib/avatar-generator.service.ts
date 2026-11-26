import { Injectable } from '@angular/core';
import { IMetadataProvider, LogError, RunView } from '@memberjunction/core';
import { MediaOutput } from '@memberjunction/ai-core-plus';
import { EscapeSQLString } from '@memberjunction/global';
import { GraphQLActionClient, GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import {
  AVATAR_CANVAS_SIZE,
  AVATAR_GENERATE_IMAGE_ACTION_NAME,
  AVATAR_GENERATE_IMAGE_FALLBACK_ID,
  AVATAR_REFINE_PNG_SIZE,
  AVATAR_WEBP_QUALITY,
  AvatarGenerationResult,
  CachedAvatarPngSource,
} from './avatar-studio.types';

type RunActionParamsList = NonNullable<Parameters<GraphQLActionClient['RunAction']>[1]>;

interface ActionOutputParamLike {
  Name?: string;
  Type?: string;
  Value?: MediaOutput[] | string | number | boolean | object | null;
}

interface ActionResultPayloadWithParams {
  Params?: ActionOutputParamLike[];
}

type ActionResultPayload =
  | ActionOutputParamLike[]
  | ActionResultPayloadWithParams
  | Record<string, ActionOutputParamLike>
  | null
  | undefined;

/**
 * Reusable service powering AI avatar generation, iterative image-to-image refinement,
 * local file upload processing, and 128×128 WebP downscaling via MemberJunction's
 * `Generate Image` action (`048FF309-C2CD-44D8-8A8E-8C771ADA8284`).
 */
@Injectable({ providedIn: 'root' })
export class AvatarGeneratorService {
  private readonly actionIdCache = new WeakMap<IMetadataProvider, string>();

  /**
   * Generates a fresh AI avatar image for the supplied prompt and downscales it to a
   * compact `128×128` WebP data URI (`0.85` quality).
   */
  public async GenerateAvatar(
    prompt: string,
    provider: IMetadataProvider
  ): Promise<AvatarGenerationResult> {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      return { Success: false, ErrorMessage: 'Enter a description to generate an avatar.' };
    }
    return this.runImageAction(trimmedPrompt, null, provider);
  }

  /**
   * Refines an existing avatar image using image-to-image editing via MJ's `Generate Image`
   * action (`SourceImage` input parameter).
   */
  public async RefineAvatar(
    instruction: string,
    currentImageUrl: string,
    provider: IMetadataProvider,
    cachedPngSource?: CachedAvatarPngSource | null
  ): Promise<AvatarGenerationResult> {
    const trimmedInstruction = instruction.trim();
    if (!trimmedInstruction) {
      return { Success: false, ErrorMessage: 'Enter a refinement instruction first.' };
    }
    const sourceImage = await this.BuildSourceImageForEdit(currentImageUrl, cachedPngSource);
    if (!sourceImage) {
      return {
        Success: false,
        ErrorMessage: 'Could not prepare the current avatar image for refinement.',
      };
    }
    return this.runImageAction(trimmedInstruction, sourceImage, provider);
  }

  /**
   * Reads an uploaded browser `File` (must be `image/*`), center-crops it to a square,
   * and compresses it to a `128×128` WebP data URI (`0.85` quality).
   */
  public async ProcessUploadedFile(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please select an image file (PNG, JPG, WebP, or GIF).');
    }
    const rawDataUrl = await this.readFileAsDataUrl(file);
    return this.DownscaleToWebPDataUrl(rawDataUrl);
  }

  /**
   * Center-crops an image data URI or CORS-accessible URL to a square and exports a
   * `128×128` WebP data URI at `0.85` quality (falling back to PNG when WebP export is
   * unavailable in the runtime).
   */
  public async DownscaleToWebPDataUrl(
    sourceUrl: string,
    size: number = AVATAR_CANVAS_SIZE,
    quality: number = AVATAR_WEBP_QUALITY
  ): Promise<string> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return sourceUrl;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return sourceUrl;
    }

    const img = await this.loadHtmlImage(sourceUrl);
    const width = img.naturalWidth || img.width || size;
    const height = img.naturalHeight || img.height || size;
    const side = Math.min(width, height);
    const sx = Math.max(0, Math.floor((width - side) / 2));
    const sy = Math.max(0, Math.floor((height - side) / 2));

    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

    const webp = canvas.toDataURL('image/webp', quality);
    if (webp && webp.startsWith('data:image/webp')) {
      return webp;
    }
    const png = canvas.toDataURL('image/png');
    return png && png.startsWith('data:image/') ? png : sourceUrl;
  }

  /**
   * Resolves the `Generate Image` action ID on the active provider, falling back to the
   * canonical shipped ID (`048FF309-C2CD-44D8-8A8E-8C771ADA8284`).
   */
  public async ResolveGenerateImageActionId(provider: IMetadataProvider): Promise<string> {
    const cached = this.actionIdCache.get(provider);
    if (cached) {
      return cached;
    }
    try {
      const rv = RunView.FromMetadataProvider(provider);
      const res = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Actions',
        ExtraFilter: `Name = '${EscapeSQLString(AVATAR_GENERATE_IMAGE_ACTION_NAME)}'`,
        Fields: ['ID'],
        MaxRows: 1,
        SkipTotalRowCount: true,
        ResultType: 'simple',
      });
      if (res.Success && res.Results && res.Results.length > 0 && res.Results[0]?.ID) {
        const resolvedId = res.Results[0].ID;
        this.actionIdCache.set(provider, resolvedId);
        return resolvedId;
      }
    } catch {
      // Fall back to canonical shipped Generate Image action ID
    }
    this.actionIdCache.set(provider, AVATAR_GENERATE_IMAGE_FALLBACK_ID);
    return AVATAR_GENERATE_IMAGE_FALLBACK_ID;
  }

  /**
   * Builds a provider-ready `SourceImage` value (raw base64 PNG or HTTPS URL) for
   * image-to-image refinement.
   */
  public async BuildSourceImageForEdit(
    currentUrl: string,
    cachedPngSource?: CachedAvatarPngSource | null
  ): Promise<string | null> {
    const current = currentUrl.trim();
    if (!current) {
      return null;
    }
    if (cachedPngSource && cachedPngSource.DataUri === current) {
      return cachedPngSource.PngBase64;
    }
    if (current.startsWith('http://') || current.startsWith('https://')) {
      return current;
    }
    if (current.startsWith('data:image/')) {
      const pngBase64 = await this.convertDataUrlToPngBase64(current);
      if (pngBase64) {
        return pngBase64;
      }
      return this.stripDataUrlPrefix(current);
    }
    return current;
  }

  private async runImageAction(
    prompt: string,
    sourceImage: string | null,
    provider: IMetadataProvider
  ): Promise<AvatarGenerationResult> {
    try {
      const actionId = await this.ResolveGenerateImageActionId(provider);
      const params: RunActionParamsList = [
        { Name: 'Prompt', Value: prompt, Type: 'Input' },
        { Name: 'NumberOfImages', Value: '1', Type: 'Input' },
        { Name: 'Size', Value: '1024x1024', Type: 'Input' },
        { Name: 'OutputFormat', Value: 'base64', Type: 'Input' },
      ];
      if (sourceImage) {
        params.push({ Name: 'SourceImage', Value: sourceImage, Type: 'Input' });
      }

      const client = new GraphQLActionClient(provider as GraphQLDataProvider);
      const result = await client.RunAction(actionId, params);

      if (!result.Success) {
        const reason =
          result.Message?.trim() || 'Image generation model is unavailable or not configured.';
        return { Success: false, ErrorMessage: reason };
      }

      const media = this.extractFirstMediaOutput(result.Result as ActionResultPayload);
      if (!media) {
        return {
          Success: false,
          ErrorMessage:
            'Image generation completed but returned no image data. Check your image model configuration.',
        };
      }

      const sourceDataUrl = media.data
        ? `data:${media.mimeType || 'image/png'};base64,${media.data}`
        : (media.url ?? '');
      if (!sourceDataUrl) {
        return {
          Success: false,
          ErrorMessage: 'Returned image payload contained neither base64 data nor a URL.',
        };
      }

      const avatarDataUrl = await this.DownscaleToWebPDataUrl(sourceDataUrl);
      const rawPngBase64 =
        media.data && (!media.mimeType || media.mimeType.toLowerCase().includes('png'))
          ? media.data
          : null;

      return {
        Success: true,
        DataUrl: avatarDataUrl,
        RawPngBase64: rawPngBase64,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      LogError(`AvatarGeneratorService.runImageAction: ${msg}`);
      return { Success: false, ErrorMessage: `Could not generate avatar: ${msg}` };
    }
  }

  private extractFirstMediaOutput(payload: ActionResultPayload): MediaOutput | null {
    if (!payload) {
      return null;
    }
    const outputParams: ActionOutputParamLike[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as ActionResultPayloadWithParams).Params)
        ? ((payload as ActionResultPayloadWithParams).Params ?? [])
        : Object.values(payload).filter(
            (v): v is ActionOutputParamLike => Boolean(v && typeof v === 'object' && 'Name' in v)
          );
    const imagesParam = outputParams.find(
      (p) => typeof p?.Name === 'string' && p.Name.trim().toLowerCase() === 'images'
    );
    if (!imagesParam || imagesParam.Value == null) {
      return null;
    }
    let rawImages: MediaOutput[] = [];
    if (Array.isArray(imagesParam.Value)) {
      rawImages = imagesParam.Value;
    } else if (typeof imagesParam.Value === 'string') {
      try {
        const parsed = JSON.parse(imagesParam.Value) as MediaOutput[];
        if (Array.isArray(parsed)) {
          rawImages = parsed;
        }
      } catch {
        return null;
      }
    }
    const first = rawImages.find((item) =>
      Boolean(item && (item.data?.trim() || item.url?.trim()))
    );
    return first ?? null;
  }

  private stripDataUrlPrefix(dataUrl: string): string {
    const commaIdx = dataUrl.indexOf(',');
    return commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  }

  private async convertDataUrlToPngBase64(dataUrl: string): Promise<string | null> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_REFINE_PNG_SIZE;
    canvas.height = AVATAR_REFINE_PNG_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    try {
      const img = await this.loadHtmlImage(dataUrl);
      ctx.drawImage(img, 0, 0, AVATAR_REFINE_PNG_SIZE, AVATAR_REFINE_PNG_SIZE);
      const pngUri = canvas.toDataURL('image/png');
      return pngUri.startsWith('data:image/png;base64,')
        ? this.stripDataUrlPrefix(pngUri)
        : null;
    } catch {
      return null;
    }
  }

  private loadHtmlImage(src: string): Promise<HTMLImageElement> {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to decode avatar image.'));
      img.src = src;
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Unsupported file reader output.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read uploaded image file.'));
      reader.readAsDataURL(file);
    });
  }
}
