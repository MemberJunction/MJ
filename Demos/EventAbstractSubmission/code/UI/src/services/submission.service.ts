import { Injectable } from '@angular/core';
import { Metadata, RunView } from '@memberjunction/core';
import { SubmissionEntity } from 'mj_generatedentities';

@Injectable({
  providedIn: 'root'
})
export class SubmissionService {

  async getAllSubmissions(): Promise<SubmissionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<SubmissionEntity>({
      EntityName: 'Submissions',
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSubmissionsByEvent(eventId: string): Promise<SubmissionEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<SubmissionEntity>({
      EntityName: 'Submissions',
      ExtraFilter: `EventID='${eventId}'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });

    return result.Success ? (result.Results || []) : [];
  }

  async getSubmissionById(id: string): Promise<SubmissionEntity | null> {
    const md = new Metadata();
    const submission = await md.GetEntityObject('Submissions') as unknown as SubmissionEntity;
    const loaded = await submission.Load(id);
    return loaded ? submission : null;
  }

  async createSubmission(): Promise<SubmissionEntity> {
    const md = new Metadata();
    return await md.GetEntityObject('Submissions') as unknown as SubmissionEntity;
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
