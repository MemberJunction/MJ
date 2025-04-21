# @memberjunction/ai-heygen

A wrapper for HeyGen's video generation API, enabling AI-based avatar videos within the MemberJunction framework.

## Features

- **Avatar Video Generation**: Create videos with AI-powered digital avatars
- **Avatar Management**: Retrieve and manage available avatar options
- **Custom Backgrounds**: Set custom background images for videos
- **Audio Integration**: Add voice-overs to avatar videos
- **Video Customization**: Control output dimensions, avatar scaling, and positioning
- **Standardized Interface**: Follows MemberJunction's BaseVideoGenerator abstract class pattern

## Installation

```bash
npm install @memberjunction/ai-heygen
```

## Requirements

- Node.js 16+
- A HeyGen API key
- MemberJunction Core libraries

## Usage

### Initialize the HeyGen Client

```typescript
import { HeyGenVideoGenerator } from '@memberjunction/ai-heygen';

// Initialize with your API key
const heyGen = new HeyGenVideoGenerator('your-heygen-api-key');
```

### Get Available Avatars

Retrieve a list of available avatars to use in your videos:

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
```

### Create an Avatar Video

Generate a video with an avatar speaking:

```typescript
import { AvatarVideoParams } from '@memberjunction/ai';

// Configure video parameters
const videoParams: AvatarVideoParams = {
  avatarId: 'avatar-id-from-getavatars',
  audioAssetId: 'your-audio-asset-id',
  imageAssetId: 'your-background-image-id',
  outputWidth: 1280,
  outputHeight: 720,
  scale: 1.0,
  avatarStyle: 'normal',
  offsetX: 0,
  offsetY: 0
};

// Generate the video
const result = await heyGen.CreateAvatarVideo(videoParams);

if (result.success) {
  console.log('Video generation successful!');
  console.log('Video ID:', result.videoId);
} else {
  console.error('Error generating video:', result.errorMessage);
}
```

### Check Supported Methods

Check which methods are supported by the current implementation:

```typescript
const supportedMethods = await heyGen.GetSupportedMethods();
console.log('Supported methods:', supportedMethods);
```

## API Reference

### HeyGenVideoGenerator Class

A class that extends BaseVideoGenerator to provide HeyGen-specific video generation functionality.

#### Constructor

```typescript
new HeyGenVideoGenerator(apiKey: string)
```

#### Methods

- `CreateAvatarVideo(params: AvatarVideoParams): Promise<VideoResult>` - Generate a video with an avatar
- `CreateVideoTranslation(params: any): Promise<VideoResult>` - (Not yet implemented)
- `GetAvatars(): Promise<AvatarInfo[]>` - Get a list of available avatars
- `GetSupportedMethods(): Promise<string[]>` - Get a list of supported methods

### AvatarVideoParams Interface

Parameters for creating an avatar video:

- `avatarId`: ID of the avatar to use (from GetAvatars)
- `audioAssetId`: ID of the audio asset for the avatar to speak
- `imageAssetId`: ID of the background image
- `outputWidth`: Width of the output video in pixels
- `outputHeight`: Height of the output video in pixels
- `scale`: Scale factor for the avatar (1.0 = 100%)
- `avatarStyle`: Style of the avatar ('normal' or other available styles)
- `offsetX`: Horizontal position offset of the avatar
- `offsetY`: Vertical position offset of the avatar

### VideoResult Object

Result of video generation operations:

- `success`: Boolean indicating if the operation was successful
- `videoId`: ID of the generated video (if successful)
- `errorMessage`: Error message (if unsuccessful)

### AvatarInfo Object

Information about an available avatar:

- `id`: Unique identifier for the avatar
- `name`: Display name of the avatar
- `gender`: Gender of the avatar
- `previewImageUrl`: URL to a preview image of the avatar
- `previewVideoUrl`: URL to a preview video of the avatar

## HeyGen API Integration

This package integrates with the following HeyGen API endpoints:

- `https://api.heygen.com/v2/video/generate` - For video generation
- `https://api.heygen.com/v2/avatars` - For retrieving available avatars

Refer to [HeyGen's API documentation](https://docs.heygen.com/) for more details on the underlying API.

## Dependencies

- `@memberjunction/ai`: MemberJunction AI core framework
- `@memberjunction/global`: MemberJunction global utilities
- `axios`: HTTP client for API requests

## License

ISC