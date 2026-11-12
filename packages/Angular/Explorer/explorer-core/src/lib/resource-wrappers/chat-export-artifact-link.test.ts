import { describe, it, expect } from 'vitest';
import { BuildExportArtifactLink } from './chat-export-artifact-link.js';

describe('BuildExportArtifactLink', () => {
  const target = { ConversationID: 'c-1', ArtifactID: 'a-1', VersionID: 'v-1', VersionNumber: 3 };

  it('keeps the page path and replaces the query with the artifact deep-link parameters', () => {
    const link = BuildExportArtifactLink('https://mj.example.com/base/app/chat/Conversations?conversationId=old&tab=x#frag', target);
    expect(link).toBe('https://mj.example.com/base/app/chat/Conversations?conversationId=c-1&artifactId=a-1&versionNumber=3');
  });

  it('returns null for an address that is not http(s)', () => {
    expect(BuildExportArtifactLink('file:///tmp/index.html', target)).toBeNull();
    expect(BuildExportArtifactLink('not a url', target)).toBeNull();
  });
});
