import { Injectable } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { EventsSubmissionEntity } from 'mj_generatedentities';

@Injectable({
  providedIn: 'root'
})
export class SubmissionService {

  async getAllSubmissions(): Promise<EventsSubmissionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<EventsSubmissionEntity>({
      EntityName: 'Submissions',
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSubmissionsByEvent(eventId: string): Promise<EventsSubmissionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<EventsSubmissionEntity>({
      EntityName: 'Submissions',
      ExtraFilter: `EventID='${eventId}'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSubmissionById(id: string): Promise<EventsSubmissionEntity | null> {
    const md = new Metadata();
    const submission = await md.GetEntityObject('Submissions') as unknown as EventsSubmissionEntity;
    const loaded = await submission.Load(id);
    return loaded ? submission : null;
  }

  async createSubmission(): Promise<EventsSubmissionEntity> {
    const md = new Metadata();
    return await md.GetEntityObject('Submissions') as unknown as EventsSubmissionEntity;
  }

  async getSubmissionStatistics(eventId?: string): Promise<{
    total: number;
    accepted: number;
    underReview: number;
    rejected: number;
  }> {
    const submissions = eventId
      ? await this.getSubmissionsByEvent(eventId)
      : await this.getAllSubmissions();

    return {
      total: submissions.length,
      accepted: submissions.filter(s => s.Status === 'Accepted').length,
      underReview: submissions.filter(s => s.Status === 'Under Review').length,
      rejected: submissions.filter(s => s.Status === 'Rejected').length
    };
  }
}
