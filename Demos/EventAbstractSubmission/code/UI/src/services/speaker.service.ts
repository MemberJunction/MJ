import { Injectable } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { EventsSpeakerEntity, EventsSubmissionSpeakerEntity } from 'mj_generatedentities';

@Injectable({
  providedIn: 'root'
})
export class SpeakerService {

  async getAllSpeakers(): Promise<EventsSpeakerEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<EventsSpeakerEntity>({
      EntityName: 'Speakers',
      OrderBy: 'LastName, FirstName',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSpeakerById(id: string): Promise<EventsSpeakerEntity | null> {
    const md = new Metadata();
    const speaker = await md.GetEntityObject('Speakers') as unknown as EventsSpeakerEntity;
    const loaded = await speaker.Load(id);
    return loaded ? speaker : null;
  }

  async createSpeaker(): Promise<EventsSpeakerEntity> {
    const md = new Metadata();
    return await md.GetEntityObject('Speakers') as unknown as EventsSpeakerEntity;
  }

  async getSpeakersForSubmission(submissionId: string): Promise<EventsSpeakerEntity[]> {
    // First get the SubmissionSpeaker junction records
    const rv = new RunView();
    const junctionResult = await rv.RunView<EventsSubmissionSpeakerEntity>({
      EntityName: 'Submission Speakers',
      ExtraFilter: `SubmissionID='${submissionId}'`,
      ResultType: 'entity_object'
    });

    if (!junctionResult.Success || !junctionResult.Results) {
      return [];
    }

    // Get all speaker IDs
    const speakerIds = junctionResult.Results.map(ss => ss.SpeakerID);
    if (speakerIds.length === 0) {
      return [];
    }

    // Load the speakers
    const speakersResult = await rv.RunView<EventsSpeakerEntity>({
      EntityName: 'Speakers',
      ExtraFilter: `ID IN ('${speakerIds.join("','")}')`,
      ResultType: 'entity_object'
    });

    return speakersResult.Success ? (speakersResult.Results || []) : [];
  }
}
