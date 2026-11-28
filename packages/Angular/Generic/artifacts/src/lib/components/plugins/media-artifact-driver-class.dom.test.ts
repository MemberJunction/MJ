import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '../base-artifact-viewer.component';
import { VideoArtifactViewerComponent } from './video-artifact-viewer.component';
import { AudioArtifactViewerComponent } from './audio-artifact-viewer.component';

interface ArtifactTypeMetadataRecord {
    fields: {
        Name: string;
        ParentID: string | null;
        DriverClass?: string | null;
    };
}

function readArtifactTypeMetadata(fileName: string): ArtifactTypeMetadataRecord[] {
    const filePath = resolve(__dirname, '../../../../../../../../metadata/artifact-types', fileName);
    return JSON.parse(readFileSync(filePath, 'utf-8')) as ArtifactTypeMetadataRecord[];
}

describe('Video and Audio artifact type DriverClass registrations (VS-ART-4)', () => {
    it('wires Video artifact type DriverClass to VideoArtifactViewerComponent', () => {
        const records = readArtifactTypeMetadata('.video-artifact-type.json');
        expect(records).toHaveLength(1);
        const videoRecord = records[0];
        expect(videoRecord.fields.Name).toBe('Video');
        expect(videoRecord.fields.ParentID).toBeNull();
        expect(videoRecord.fields.DriverClass).toBe('VideoArtifactViewerPlugin');

        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseArtifactViewerPluginComponent,
            videoRecord.fields.DriverClass!,
        );
        expect(registration?.SubClass).toBe(VideoArtifactViewerComponent);
    });

    it('wires Audio artifact type DriverClass to AudioArtifactViewerComponent', () => {
        const records = readArtifactTypeMetadata('.audio-artifact-type.json');
        expect(records).toHaveLength(1);
        const audioRecord = records[0];
        expect(audioRecord.fields.Name).toBe('Audio');
        expect(audioRecord.fields.ParentID).toBeNull();
        expect(audioRecord.fields.DriverClass).toBe('AudioArtifactViewerPlugin');

        const registration = MJGlobal.Instance.ClassFactory.GetRegistration(
            BaseArtifactViewerPluginComponent,
            audioRecord.fields.DriverClass!,
        );
        expect(registration?.SubClass).toBe(AudioArtifactViewerComponent);
    });
});
