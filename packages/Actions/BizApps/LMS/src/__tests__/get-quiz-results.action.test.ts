import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies (same pattern as get-bundles.action.test.ts)
vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    protected async InternalRunAction(): Promise<unknown> {
      return {};
    }
  },
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
    CompanyID: string = '';
    APIKey: string | null = null;
    AccessToken: string | null = null;
    ExternalSystemID: string | null = null;
    CustomAttribute1: string | null = null;
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {
    Name: string = '';
    Value: unknown = null;
    Type: string = 'Input';
  },
}));

import { UserInfo } from '@memberjunction/core';
import { GetQuizResultsAction } from '../providers/learnworlds/actions/get-quiz-results.action';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import {
  FormattedQuizResult,
  FormattedAnswer,
  QuizMetrics,
  QuizResultsSummary,
} from '../providers/learnworlds/interfaces';

/**
 * Helper to create a mock UserInfo for test context
 */
function createMockContextUser(): UserInfo {
  return { ID: 'test-user-id', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;
}

/**
 * Helper to build a raw LW API quiz result object
 */
function createRawApiQuizResult(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'result-1',
    user_id: 'user-123',
    course_id: 'course-abc',
    quiz_id: 'quiz-xyz',
    attempt_number: 1,
    score: 8,
    max_score: 10,
    percentage: 80,
    passed: true,
    passing_score: 70,
    started_at: '2024-06-01T09:00:00Z',
    completed_at: '2024-06-01T09:30:00Z',
    duration: 1800,
    user: {
      id: 'user-123',
      email: 'student@example.com',
      name: 'Jane Doe',
    },
    quiz: {
      id: 'quiz-xyz',
      title: 'Module 1 Quiz',
      type: 'quiz',
      question_count: 10,
    },
    ...overrides,
  };
}

/**
 * Helper to build a mock API response wrapping quiz results
 */
function createApiResponse(rawResults: Record<string, unknown>[]): Record<string, unknown> {
  return {
    success: true,
    data: rawResults,
  };
}

/**
 * Helper to build a mock quiz detail response (questions + answers)
 */
function createQuizDetailResponse(
  questions: Record<string, unknown>[],
  answers: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    success: true,
    data: {
      questions,
      answers,
    },
  };
}

describe('GetQuizResultsAction', () => {
  let action: GetQuizResultsAction;
  let contextUser: UserInfo;

  beforeEach(() => {
    action = new GetQuizResultsAction();
    contextUser = createMockContextUser();
  });

  describe('GetQuizResults() typed method', () => {
    it('should get quiz results successfully (happy path)', async () => {
      const rawResult = createRawApiQuizResult();
      const apiResponse = createApiResponse([rawResult]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never) // main results call
        .mockResolvedValueOnce(createQuizDetailResponse(
          [{ question_number: 1, question_text: 'Q1?', question_type: 'multiple-choice', points: 1 }],
          [{ question_number: 1, is_correct: true, points_earned: 1, points_possible: 1 }],
        ) as never); // details call

      const result = await action.GetQuizResults({ CompanyID: 'comp-1', UserID: 'user-123' }, contextUser);

      expect(result.TotalCount).toBe(1);
      expect(result.QuizResults).toHaveLength(1);

      const qr: FormattedQuizResult = result.QuizResults[0];
      expect(qr.id).toBe('result-1');
      expect(qr.userId).toBe('user-123');
      expect(qr.courseId).toBe('course-abc');
      expect(qr.quizId).toBe('quiz-xyz');
      expect(qr.attemptNumber).toBe(1);
      expect(qr.score).toBe(8);
      expect(qr.maxScore).toBe(10);
      expect(qr.percentage).toBe(80);
      expect(qr.passed).toBe(true);
      expect(qr.passingScore).toBe(70);
      expect(qr.startedAt).toBe('2024-06-01T09:00:00Z');
      expect(qr.completedAt).toBe('2024-06-01T09:30:00Z');
      expect(qr.duration).toBe(1800);
    });

    it('should map result fields with fallback values', async () => {
      const rawResult = createRawApiQuizResult({
        id: undefined,
        result_id: 'fallback-result-id',
        attempt_number: undefined,
        attempt: 3,
        max_score: undefined,
        total_points: 50,
        percentage: undefined,
        score: 25,
        passed: undefined,
        is_passing: true,
        passing_score: undefined,
        passing_percentage: 60,
        completed_at: undefined,
        submitted_at: '2024-07-01T10:00:00Z',
        duration: undefined,
        time_spent: 900,
        user: undefined,
        quiz: undefined,
      });
      const apiResponse = createApiResponse([rawResult]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)       // main results
        .mockResolvedValueOnce({ success: false } as never); // quiz lookup (quiz_id present, quiz undefined)

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      const qr = result.QuizResults[0];
      expect(qr.id).toBe('fallback-result-id');
      expect(qr.attemptNumber).toBe(3);
      expect(qr.maxScore).toBe(50);
      expect(qr.percentage).toBe(50); // 25/50 * 100
      expect(qr.passed).toBe(true);
      expect(qr.passingScore).toBe(60);
      expect(qr.completedAt).toBe('2024-07-01T10:00:00Z');
      expect(qr.duration).toBe(900);
    });

    it('should attach user info when present in raw result', async () => {
      const rawResult = createRawApiQuizResult({
        user: {
          id: 'u-42',
          email: 'alice@test.com',
          first_name: 'Alice',
          last_name: 'Smith',
        },
      });
      const apiResponse = createApiResponse([rawResult]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)
        .mockResolvedValueOnce({ success: false } as never);

      const result = await action.GetQuizResults({ CompanyID: 'comp-1', UserID: 'u-42' }, contextUser);

      expect(result.QuizResults[0].user).toBeDefined();
      expect(result.QuizResults[0].user!.id).toBe('u-42');
      expect(result.QuizResults[0].user!.email).toBe('alice@test.com');
      expect(result.QuizResults[0].user!.name).toBe('Alice Smith');
    });

    it('should include questions when IncludeQuestions is true (default)', async () => {
      const rawResult = createRawApiQuizResult();
      const apiResponse = createApiResponse([rawResult]);

      const detailResponse = createQuizDetailResponse(
        [
          { question_number: 1, question_id: 'q1', question_text: 'What is 2+2?', question_type: 'multiple-choice', points: 2, difficulty: 'easy' },
          { question_number: 2, question_id: 'q2', question_text: 'Explain gravity.', question_type: 'essay', points: 5, difficulty: 'hard' },
        ],
        [
          { question_number: 1, is_correct: true, points_earned: 2, points_possible: 2 },
          { question_number: 2, is_correct: false, points_earned: 3, points_possible: 5 },
        ],
      );

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)
        .mockResolvedValueOnce(detailResponse as never);

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: true, IncludeAnswers: false },
        contextUser,
      );

      const qr = result.QuizResults[0];
      expect(qr.questions).toBeDefined();
      expect(qr.questions).toHaveLength(2);
      expect(qr.questions![0].questionNumber).toBe(1);
      expect(qr.questions![0].questionId).toBe('q1');
      expect(qr.questions![0].questionText).toBe('What is 2+2?');
      expect(qr.questions![0].questionType).toBe('multiple-choice');
      expect(qr.questions![0].points).toBe(2);
      expect(qr.questions![0].difficulty).toBe('easy');
      expect(qr.questions![1].questionNumber).toBe(2);
      expect(qr.questions![1].questionType).toBe('essay');
      // IncludeAnswers was false, so answers and metrics should not be set
      expect(qr.answers).toBeUndefined();
      expect(qr.metrics).toBeUndefined();
    });

    it('should include answers and calculate metrics when IncludeAnswers is true', async () => {
      const rawResult = createRawApiQuizResult();
      const apiResponse = createApiResponse([rawResult]);

      const detailResponse = createQuizDetailResponse(
        [
          { question_number: 1, question_text: 'Q1' },
          { question_number: 2, question_text: 'Q2' },
          { question_number: 3, question_text: 'Q3' },
        ],
        [
          { question_number: 1, user_answer: 'A', correct_answer: 'A', is_correct: true, points_earned: 1, points_possible: 1 },
          { question_number: 2, user_answer: 'B', correct_answer: 'C', is_correct: false, points_earned: 0, points_possible: 1 },
          { question_number: 3, user_answer: 'D', correct_answer: 'D', is_correct: true, points_earned: 1, points_possible: 1 },
        ],
      );

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)
        .mockResolvedValueOnce(detailResponse as never);

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: true },
        contextUser,
      );

      const qr = result.QuizResults[0];
      expect(qr.answers).toBeDefined();
      expect(qr.answers).toHaveLength(3);

      const answers: FormattedAnswer[] = qr.answers!;
      expect(answers[0].isCorrect).toBe(true);
      expect(answers[0].userAnswer).toBe('A');
      expect(answers[0].correctAnswer).toBe('A');
      expect(answers[0].pointsEarned).toBe(1);
      expect(answers[1].isCorrect).toBe(false);
      expect(answers[1].userAnswer).toBe('B');

      // Metrics should be calculated from answers
      const metrics: QuizMetrics = qr.metrics!;
      expect(metrics).toBeDefined();
      expect(metrics.correctAnswers).toBe(2);
      expect(metrics.incorrectAnswers).toBe(1);
      expect(metrics.totalQuestions).toBe(3);
      expect(metrics.accuracyRate).toBe(66.7);
    });

    it('should skip detailed results when both IncludeQuestions and IncludeAnswers are false', async () => {
      const rawResult = createRawApiQuizResult();
      const apiResponse = createApiResponse([rawResult]);

      const requestSpy = vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never);

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      // Should only make one API call (no details call)
      expect(requestSpy).toHaveBeenCalledTimes(1);
      expect(result.QuizResults[0].questions).toBeUndefined();
      expect(result.QuizResults[0].answers).toBeUndefined();
      expect(result.QuizResults[0].metrics).toBeUndefined();
    });

    it('should build summary with pass/fail rates', async () => {
      const rawResults = [
        createRawApiQuizResult({ id: 'r1', score: 9, max_score: 10, percentage: 90, passed: true, duration: 1200, quiz: { id: 'q1', title: 'Quiz A', type: 'quiz' } }),
        createRawApiQuizResult({ id: 'r2', score: 5, max_score: 10, percentage: 50, passed: false, duration: 600, quiz: { id: 'q1', title: 'Quiz A', type: 'quiz' } }),
        createRawApiQuizResult({ id: 'r3', score: 8, max_score: 10, percentage: 80, passed: true, duration: 900, quiz: { id: 'q2', title: 'Quiz B', type: 'quiz' } }),
      ];
      const apiResponse = createApiResponse(rawResults);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)
        .mockResolvedValue({ success: false } as never); // detail calls fail gracefully

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      const summary: QuizResultsSummary = result.Summary;
      expect(summary.totalResults).toBe(3);
      expect(summary.passedResults).toBe(2);
      expect(summary.failedResults).toBe(1);
      // passRate = (2/3)*100 = 66.7
      expect(summary.passRate).toBeCloseTo(66.7, 0);
      // averageScore = (90 + 50 + 80) / 3 = 73.3
      expect(summary.averageScore).toBeCloseTo(73.3, 0);
      // averageDuration = (1200 + 600 + 900) / 3 = 900
      expect(summary.averageDuration).toBe(900);
      expect(summary.filterType).toBe('user');
    });

    it('should build summary with quiz breakdown when no specific QuizID is given', async () => {
      const rawResults = [
        createRawApiQuizResult({ id: 'r1', percentage: 90, passed: true, quiz: { id: 'q1', title: 'Quiz Alpha', type: 'quiz' } }),
        createRawApiQuizResult({ id: 'r2', percentage: 60, passed: false, quiz: { id: 'q1', title: 'Quiz Alpha', type: 'quiz' } }),
        createRawApiQuizResult({ id: 'r3', percentage: 100, passed: true, quiz: { id: 'q2', title: 'Quiz Beta', type: 'quiz' } }),
      ];
      const apiResponse = createApiResponse(rawResults);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)
        .mockResolvedValue({ success: false } as never);

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      const breakdown = result.Summary.quizBreakdown;
      expect(breakdown).not.toBeNull();
      expect(breakdown!['Quiz Alpha']).toBeDefined();
      expect(breakdown!['Quiz Alpha'].stats.attempts).toBe(2);
      expect(breakdown!['Quiz Alpha'].stats.passRate).toBe(50);
      expect(breakdown!['Quiz Beta']).toBeDefined();
      expect(breakdown!['Quiz Beta'].stats.attempts).toBe(1);
      expect(breakdown!['Quiz Beta'].stats.passRate).toBe(100);
    });

    it('should handle empty results', async () => {
      const apiResponse = createApiResponse([]);

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never);

      const result = await action.GetQuizResults({ CompanyID: 'comp-1', CourseID: 'course-1' }, contextUser);

      expect(result.TotalCount).toBe(0);
      expect(result.QuizResults).toEqual([]);
      expect(result.Summary.totalResults).toBe(0);
      expect(result.Summary.passRate).toBe(0);
      expect(result.Summary.averageScore).toBe(0);
      expect(result.Summary.averageDuration).toBe(0);
    });

    it('should handle nested data.data response format', async () => {
      const rawResult = createRawApiQuizResult();
      const nestedResponse = {
        success: true,
        data: { data: [rawResult] },
      };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(nestedResponse as never)
        .mockResolvedValueOnce({ success: false } as never);

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', QuizID: 'quiz-xyz', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      expect(result.TotalCount).toBe(1);
      expect(result.QuizResults[0].id).toBe('result-1');
    });

    it('should throw when API response indicates failure', async () => {
      const failResponse = { success: false, message: 'Quiz not found' };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(failResponse as never);

      await expect(
        action.GetQuizResults({ CompanyID: 'comp-1', QuizID: 'bad-quiz' }, contextUser),
      ).rejects.toThrow('Quiz not found');
    });

    it('should throw when no identifier is provided', async () => {
      await expect(
        action.GetQuizResults({ CompanyID: 'comp-1' }, contextUser),
      ).rejects.toThrow('At least one of UserID, CourseID, or QuizID is required');
    });

    it('should propagate errors from the API layer', async () => {
      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockRejectedValueOnce(new Error('Network timeout'));

      await expect(
        action.GetQuizResults({ CompanyID: 'comp-1', UserID: 'user-1' }, contextUser),
      ).rejects.toThrow('Network timeout');
    });

    it('should resolve quiz info via lookup when result has no inline quiz data', async () => {
      const rawResult = createRawApiQuizResult({
        quiz: undefined,
        quiz_id: 'quiz-remote',
      });
      const apiResponse = createApiResponse([rawResult]);

      const quizLookupResponse = {
        success: true,
        data: {
          id: 'quiz-remote',
          title: 'Remote Quiz',
          type: 'assessment',
          question_count: 5,
        },
      };

      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValueOnce(apiResponse as never)     // main results
        .mockResolvedValueOnce(quizLookupResponse as never) // quiz lookup
        .mockResolvedValueOnce({ success: false } as never); // details (fail gracefully)

      const result = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'user-123', IncludeQuestions: false, IncludeAnswers: false },
        contextUser,
      );

      expect(result.QuizResults[0].quiz).toBeDefined();
      expect(result.QuizResults[0].quiz!.id).toBe('quiz-remote');
      expect(result.QuizResults[0].quiz!.title).toBe('Remote Quiz');
      expect(result.QuizResults[0].quiz!.type).toBe('assessment');
      expect(result.QuizResults[0].quiz!.questionCount).toBe(5);
    });

    it('should set filterType based on provided identifiers', async () => {
      const apiResponse = createApiResponse([]);
      vi.spyOn(action as never, 'makeLearnWorldsRequest')
        .mockResolvedValue(apiResponse as never);

      // user-course combination
      const ucResult = await action.GetQuizResults(
        { CompanyID: 'comp-1', UserID: 'u1', CourseID: 'c1' },
        contextUser,
      );
      expect(ucResult.Summary.filterType).toBe('user-course');

      // course only
      const cResult = await action.GetQuizResults(
        { CompanyID: 'comp-1', CourseID: 'c1' },
        contextUser,
      );
      expect(cResult.Summary.filterType).toBe('course');
    });
  });

  describe('InternalRunAction()', () => {
    it('should return success when GetQuizResults succeeds', async () => {
      const mockResults: FormattedQuizResult[] = [
        {
          id: 'r1',
          userId: 'u1',
          courseId: 'c1',
          quizId: 'q1',
          attemptNumber: 1,
          score: 9,
          maxScore: 10,
          percentage: 90,
          passed: true,
          passingScore: 70,
          duration: 600,
          durationText: '10m 0s',
        },
      ];

      const mockSummary: QuizResultsSummary = {
        totalResults: 1,
        passedResults: 1,
        failedResults: 0,
        passRate: 100,
        averageScore: 90,
        averageDuration: 600,
        averageDurationText: '10m 0s',
        dateRange: { from: 'all-time', to: 'current' },
        filterType: 'user',
        quizBreakdown: null,
      };

      vi.spyOn(action, 'GetQuizResults').mockResolvedValue({
        QuizResults: mockResults,
        TotalCount: 1,
        Summary: mockSummary,
      });

      const runParams: RunActionParams = {
        Params: [
          { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
          { Name: 'UserID', Type: 'Input', Value: 'u1' },
        ],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(true);
      expect(result.ResultCode).toBe('SUCCESS');
      expect(result.Message).toContain('Retrieved 1 quiz result(s)');
    });

    it('should return error result when GetQuizResults throws', async () => {
      vi.spyOn(action, 'GetQuizResults').mockRejectedValue(new Error('LearnWorlds API error: 403 Forbidden'));

      const runParams: RunActionParams = {
        Params: [{ Name: 'CompanyID', Type: 'Input', Value: 'comp-1' }],
        ContextUser: contextUser,
      } as unknown as RunActionParams;

      const result = (await action['InternalRunAction'](runParams)) as ActionResultSimple;

      expect(result.Success).toBe(false);
      expect(result.ResultCode).toBe('ERROR');
      expect(result.Message).toContain('Error retrieving quiz results');
      expect(result.Message).toContain('LearnWorlds API error: 403 Forbidden');
    });
  });
});
