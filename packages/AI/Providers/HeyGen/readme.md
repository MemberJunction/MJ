# @memberjunction/ai-heygen

A MemberJunction provider package that wraps HeyGen's video generation API, enabling AI-powered avatar video creation within the MemberJunction AI framework. This package implements the BaseVideoGenerator abstract class to provide standardized video generation capabilities.

## Overview

The HeyGen provider enables you to:
- Generate videos with AI-powered digital avatars
- Retrieve and manage available avatar options
- Customize video output with backgrounds, dimensions, and positioning
- Integrate seamlessly with MemberJunction's AI architecture

## Features

- **Avatar Video Generation**: Create videos with AI-powered digital avatars speaking custom audio
- **Avatar Management**: Retrieve and browse available avatar options with preview assets
- **Custom Backgrounds**: Set custom background images for professional video outputs
- **Audio Integration**: Sync avatar speech with pre-generated audio assets
- **Video Customization**: Control output dimensions, avatar scaling, and positioning
- **Standardized Interface**: Implements MemberJunction's BaseVideoGenerator abstract class for consistent API usage
- **Type-Safe Implementation**: Full TypeScript support with proper typing throughout

## Installation

```bash
npm install @memberjunction/ai-heygen
```

## Requirements

- Node.js 16 or higher
- TypeScript 5.4.5 or higher
- A valid HeyGen API key (obtain from [HeyGen Dashboard](https://app.heygen.com/))
- MemberJunction Core dependencies:
  - `@memberjunction/ai` (same version)
  - `@memberjunction/global` (same version)

## Configuration

Before using the HeyGen provider, ensure you have:

1. A valid HeyGen API key from your [HeyGen account](https://app.heygen.com/)
2. Pre-uploaded audio and image assets in your HeyGen account (these will provide you with asset IDs)
3. Selected an avatar ID from the available options

## Usage

### Basic Setup

```typescript
import { HeyGenVideoGenerator } from '@memberjunction/ai-heygen';

// Initialize with your API key
const heyGen = new HeyGenVideoGenerator('your-heygen-api-key');
```

### Retrieve Available Avatars

Before creating videos, explore the available avatars:

```typescript
const avatars = await heyGen.GetAvatars();

// Display available avatars
avatars.forEach(avatar => {
  console.log(`Avatar: ${avatar.name} (ID: ${avatar.id})`);
  console.log(`Gender: ${avatar.gender}`);
  console.log(`Preview Image: ${avatar.previewImageUrl}`);
  console.log(`Preview Video: ${avatar.previewVideoUrl}`);
  console.log('---');
});

// Find a specific avatar by name
const femaleAvatar = avatars.find(a => a.gender === 'female' && a.name.includes('Professional'));
```

### Create an Avatar Video

Generate a video with an avatar speaking your content:

```typescript
import { AvatarVideoParams, VideoResult } from '@memberjunction/ai';

// Configure video parameters
const videoParams: AvatarVideoParams = {
  avatarId: 'avatar-id-from-getavatars',     // Use an ID from GetAvatars()
  audioAssetId: 'your-audio-asset-id',       // Pre-uploaded audio asset ID from HeyGen
  imageAssetId: 'your-background-image-id',  // Pre-uploaded background image ID
  outputWidth: 1280,                         // Video width in pixels
  outputHeight: 720,                         // Video height in pixels
  scale: 1.0,                               // Avatar scale (1.0 = 100%)
  avatarStyle: 'normal',                    // Avatar presentation style
  offsetX: 0,                               // Horizontal position offset
  offsetY: 0                                // Vertical position offset
};

// Generate the video
const result: VideoResult = await heyGen.CreateAvatarVideo(videoParams);

if (result.success) {
  console.log('Video generation successful!');
  console.log('Video ID:', result.videoId);
  // The video ID can be used to check status or download via HeyGen's API
} else {
  console.error('Error generating video:', result.errorMessage);
}
```

### Complete Example

Here's a complete example that demonstrates the full workflow:

```typescript
import { HeyGenVideoGenerator } from '@memberjunction/ai-heygen';
import { AvatarVideoParams, VideoResult } from '@memberjunction/ai';

async function createProfessionalVideo() {
  try {
    // Initialize the HeyGen client
    const heyGen = new HeyGenVideoGenerator(process.env.HEYGEN_API_KEY);
    
    // Get available avatars
    const avatars = await heyGen.GetAvatars();
    console.log(`Found ${avatars.length} available avatars`);
    
    // Select the first professional avatar
    const professionalAvatar = avatars.find(a => 
      a.name.toLowerCase().includes('professional')
    ) || avatars[0];
    
    console.log(`Using avatar: ${professionalAvatar.name}`);
    
    // Create video with the selected avatar
    const videoParams: AvatarVideoParams = {
      avatarId: professionalAvatar.id,
      audioAssetId: 'audio_asset_123',  // Your pre-uploaded audio
      imageAssetId: 'image_asset_456',  // Your pre-uploaded background
      outputWidth: 1920,
      outputHeight: 1080,
      scale: 1.2,                      // Slightly larger avatar
      avatarStyle: 'normal',
      offsetX: 100,                    // Move avatar 100px to the right
      offsetY: 0
    };
    
    const result: VideoResult = await heyGen.CreateAvatarVideo(videoParams);
    
    if (result.success) {
      console.log(`Video created successfully! ID: ${result.videoId}`);
      // Use the video ID to check status or download the video
    } else {
      console.error(`Failed to create video: ${result.errorMessage}`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the example
createProfessionalVideo();
```

### Check Supported Methods

Check which methods are supported by the current implementation:

```typescript
const supportedMethods = await heyGen.GetSupportedMethods();
console.log('Supported methods:', supportedMethods);
```

## API Reference

### HeyGenVideoGenerator Class

The main class that extends `BaseVideoGenerator` to provide HeyGen-specific video generation functionality. This class is registered with MemberJunction's global class registry using the `@RegisterClass` decorator.

#### Constructor

```typescript
constructor(apiKey: string)
```

**Parameters:**
- `apiKey` - Your HeyGen API key for authentication

#### Methods

##### `CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult>`
Generates a video with an AI avatar speaking the provided audio content.

**Parameters:**
- `params` - Configuration object for the avatar video (see AvatarVideoParams below)

**Returns:**
- `Promise<VideoResult>` - Result object containing success status and video ID or error message

##### `GetAvatars(): Promise<AvatarInfo[]>`
Retrieves a list of all available avatars from HeyGen.

**Returns:**
- `Promise<AvatarInfo[]>` - Array of avatar information objects

##### `GetSupportedMethods(): Promise<string[]>`
Returns a list of method names supported by this implementation.

**Returns:**
- `Promise<string[]>` - Array of supported method names

##### `CreateVideoTranslation(params: any): Promise<VideoResult>`
**Note:** This method is not yet implemented and will throw an error if called.

### Type Definitions

#### AvatarVideoParams

Configuration parameters for creating an avatar video:

```typescript
interface AvatarVideoParams {
  avatarId: string;        // ID of the avatar (from GetAvatars)
  audioAssetId: string;    // ID of pre-uploaded audio asset
  imageAssetId: string;    // ID of pre-uploaded background image
  outputWidth: number;     // Video width in pixels
  outputHeight: number;    // Video height in pixels
  scale: number;          // Avatar scale factor (1.0 = 100%)
  avatarStyle: string;    // Avatar style (e.g., 'normal')
  offsetX: number;        // Horizontal position offset in pixels
  offsetY: number;        // Vertical position offset in pixels
}
```

#### VideoResult

Result object returned from video generation operations:

```typescript
interface VideoResult {
  success: boolean;        // Whether the operation succeeded
  videoId?: string;       // ID of the generated video (if successful)
  errorMessage?: string;  // Error details (if unsuccessful)
}
```

#### AvatarInfo

Information about an available avatar:

```typescript
interface AvatarInfo {
  id: string;              // Unique avatar identifier
  name: string;            // Display name of the avatar
  gender: string;          // Avatar's gender
  previewImageUrl: string; // URL to avatar preview image
  previewVideoUrl: string; // URL to avatar preview video
}
```

## Integration Details

### HeyGen API Endpoints

This package integrates with the following HeyGen API v2 endpoints:

- **Video Generation**: `https://api.heygen.com/v2/video/generate`
  - Used by `CreateAvatarVideo()` method
  - Requires pre-uploaded audio and image assets
  
- **Avatar Management**: `https://api.heygen.com/v2/avatars`
  - Used by `GetAvatars()` method
  - Returns available avatars with preview assets

### Authentication

All API requests use the `X-Api-Key` header for authentication. The API key is passed during class instantiation and stored securely within the instance.

### Error Handling

The package implements comprehensive error handling:
- Network errors are caught and logged
- API errors are returned in the `VideoResult.errorMessage` field
- All methods return predictable result objects rather than throwing exceptions

## Dependencies

### Runtime Dependencies
- `@memberjunction/ai` - Core AI framework interfaces and base classes
- `@memberjunction/global` - Global utilities and class registration
- `axios` - HTTP client for API communication (Note: This needs to be added to package.json)

### Development Dependencies
- `typescript` ^5.4.5 - TypeScript compiler
- `ts-node-dev` ^2.0.0 - Development server with auto-reload

## Build and Development

### Building the Package

```bash
# From the package directory
npm run build

# From the repository root
npm run build -- --filter="@memberjunction/ai-heygen"
```

### Development Mode

```bash
# Run in watch mode with auto-reload
npm run start
```

### Package Structure

```
packages/AI/Providers/HeyGen/
├── src/
│   └── index.ts          # Main implementation file
├── dist/                 # Compiled JavaScript output
├── package.json          # Package configuration
├── tsconfig.json         # TypeScript configuration
├── typedoc.json          # Documentation generation config
└── readme.md            # This file
```

## Integration with MemberJunction

This package follows MemberJunction's architectural patterns:

1. **Class Registration**: Uses `@RegisterClass` decorator for automatic registration with the global class registry
2. **Abstract Implementation**: Extends `BaseVideoGenerator` from `@memberjunction/ai`
3. **Consistent API**: Follows MemberJunction's standardized patterns for AI providers
4. **Type Safety**: Full TypeScript implementation with proper typing

### Using with MemberJunction's AI System

The HeyGen provider can be dynamically loaded through MemberJunction's AI provider system:

```typescript
import { AIEngine } from '@memberjunction/ai';

// The HeyGen provider will be automatically available if installed
const aiEngine = new AIEngine();
const videoGenerator = await aiEngine.GetVideoGenerator('HeyGenVideoGenerator', apiKey);
```

## Contributing

When contributing to this package:

1. Follow the MemberJunction code style guide
2. Ensure all TypeScript compiles without errors
3. Update this README if adding new features
4. Add appropriate error handling for all API calls
5. Maintain backward compatibility

## Known Limitations

1. `CreateVideoTranslation()` is not yet implemented
2. Requires pre-uploaded assets (audio and images) in HeyGen
3. No webhook support for video completion notifications
4. The package.json is missing the `axios` dependency (needs to be added)

## Additional Resources

- [HeyGen API Documentation](https://docs.heygen.com/)
- [HeyGen Dashboard](https://app.heygen.com/)
- [MemberJunction AI Documentation](https://docs.memberjunction.org/ai)

## License

ISC - See LICENSE file in the repository root for details.