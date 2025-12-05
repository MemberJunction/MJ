import { Injectable } from '@angular/core';
import { RunView, Metadata } from '@memberjunction/core';
import { BaseEntity } from '@memberjunction/core-entities';

/**
 * Service for managing recruiting pipeline data
 */
@Injectable({
  providedIn: 'root'
})
export class RecruitingService {

  /**
   * Get all job requisitions
   */
  async getJobRequisitions(): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Job Requisitions',
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get job requisitions by status
   */
  async getJobRequisitionsByStatus(status: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Job Requisitions',
      ExtraFilter: `Status = '${status}'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get all candidates
   */
  async getCandidates(): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Candidates',
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get applications for a specific job requisition
   */
  async getApplicationsByJob(jobRequisitionID: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Applications',
      ExtraFilter: `JobRequisitionID = '${jobRequisitionID}'`,
      OrderBy: 'SubmittedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get all applications
   */
  async getApplications(): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Applications',
      OrderBy: 'SubmittedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get applications by status
   */
  async getApplicationsByStatus(status: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Applications',
      ExtraFilter: `Status = '${status}'`,
      OrderBy: 'SubmittedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get interviews for an application
   */
  async getInterviewsByApplication(applicationID: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Interviews',
      ExtraFilter: `ApplicationID = '${applicationID}'`,
      OrderBy: 'ScheduledDateTime ASC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Get application notes
   */
  async getApplicationNotes(applicationID: string): Promise<BaseEntity[]> {
    const rv = new RunView();
    const result = await rv.RunView<BaseEntity>({
      EntityName: 'Application Notes',
      ExtraFilter: `ApplicationID = '${applicationID}'`,
      OrderBy: '__mj_CreatedAt DESC',
      ResultType: 'entity_object'
    });
    return result.Success ? (result.Results || []) : [];
  }

  /**
   * Batch load data for dashboards
   */
  async loadDashboardData(): Promise<{
    jobRequisitions: BaseEntity[];
    applications: BaseEntity[];
    candidates: BaseEntity[];
    interviews: BaseEntity[];
  }> {
    const rv = new RunView();
    const results = await rv.RunViews([
      {
        EntityName: 'Job Requisitions',
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Applications',
        OrderBy: 'SubmittedAt DESC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Candidates',
        OrderBy: '__mj_CreatedAt DESC',
        ResultType: 'entity_object'
      },
      {
        EntityName: 'Interviews',
        OrderBy: 'ScheduledDateTime DESC',
        ResultType: 'entity_object'
      }
    ]);

    return {
      jobRequisitions: results[0]?.Success ? (results[0].Results || []) : [],
      applications: results[1]?.Success ? (results[1].Results || []) : [],
      candidates: results[2]?.Success ? (results[2].Results || []) : [],
      interviews: results[3]?.Success ? (results[3].Results || []) : []
    };
  }

  /**
   * Get application statistics by stage
   */
  getApplicationStatsByStage(applications: BaseEntity[]): Map<string, number> {
    const stats = new Map<string, number>();
    applications.forEach(app => {
      const stage = app.Get('CurrentStage') as string;
      stats.set(stage, (stats.get(stage) || 0) + 1);
    });
    return stats;
  }

  /**
   * Get application statistics by status
   */
  getApplicationStatsByStatus(applications: BaseEntity[]): Map<string, number> {
    const stats = new Map<string, number>();
    applications.forEach(app => {
      const status = app.Get('Status') as string;
      stats.set(status, (stats.get(status) || 0) + 1);
    });
    return stats;
  }

  /**
   * Calculate average resume evaluation score
   */
  getAverageResumeScore(applications: BaseEntity[]): number {
    const scoresWithValues = applications
      .map(app => app.Get('ResumeEvaluationScore'))
      .filter(score => score != null) as number[];

    if (scoresWithValues.length === 0) return 0;

    const sum = scoresWithValues.reduce((acc, score) => acc + score, 0);
    return sum / scoresWithValues.length;
  }

  /**
   * Calculate average audio evaluation score
   */
  getAverageAudioScore(applications: BaseEntity[]): number {
    const scoresWithValues = applications
      .map(app => app.Get('AudioEvaluationScore'))
      .filter(score => score != null) as number[];

    if (scoresWithValues.length === 0) return 0;

    const sum = scoresWithValues.reduce((acc, score) => acc + score, 0);
    return sum / scoresWithValues.length;
  }
}
