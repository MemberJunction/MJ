import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';
import {
  GetQuizResultsParams,
  GetQuizResultsResult,
  FormattedQuizResult,
  FormattedQuestion,
  FormattedAnswer,
  QuizMetrics,
  QuizResultsSummary,
} from '../interfaces';

// ----------------------------------------------------------------
// File-local interfaces for raw LearnWorlds API shapes
// ----------------------------------------------------------------

/** Query parameters sent to quiz results endpoints */
interface LWQuizResultQueryParams {
  limit: number;
  sort: string;
  order: string;
  passed?: boolean;
  completed_after?: string;
  completed_before?: string;
  user_id?: string;
  [key: string]: string | number | boolean | undefined;
}

/** Raw quiz result from the API */
interface LWRawQuizResult {
  id?: string;
  result_id?: string;
  user_id?: string;
  course_id?: string;
  quiz_id?: string;
  attempt_number?: number;
  attempt?: number;
  score?: number;
  max_score?: number;
  total_points?: number;
  percentage?: number;
  passed?: boolean;
  is_passing?: boolean;
  passing_score?: number;
  passing_percentage?: number;
  started_at?: string;
  completed_at?: string;
  submitted_at?: string;
  duration?: number;
  time_spent?: number;
  user?: {
    id?: string;
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
  };
  quiz?: {
    id?: string;
    title?: string;
    name?: string;
    type?: string;
    question_count?: number;
    total_questions?: number;
  };
}

/** Raw quiz detail response */
interface LWQuizDetailResponse {
  success?: boolean;
  data?: {
    questions?: LWRawQuestion[];
    answers?: LWRawAnswer[];
  };
}

/** Raw question from the API */
interface LWRawQuestion {
  question_number?: number;
  question_id?: string;
  id?: string;
  question_text?: string;
  question?: string;
  text?: string;
  question_type?: string;
  type?: string;
  points?: number;
  score?: number;
  difficulty?: string;
}

/** Raw answer from the API */
interface LWRawAnswer {
  question_number?: number;
  question_id?: string;
  user_answer?: unknown;
  answer?: unknown;
  selected_answer?: unknown;
  correct_answer?: unknown;
  is_correct?: boolean;
  correct?: boolean;
  points_earned?: number;
  points_possible?: number;
  points?: number;
  feedback?: string;
  time_spent?: number;
  answered_at?: string;
}

/** Results API response wrapper */
interface LWQuizResultsApiResponse {
  success?: boolean;
  message?: string;
  data?: LWRawQuizResult[] | { data?: LWRawQuizResult[] };
}

/** Quiz info lookup response */
interface LWQuizLookup {
  success?: boolean;
  data?: {
    id?: string;
    title?: string;
    name?: string;
    type?: string;
    question_count?: number;
    total_questions?: number;
  };
}

/** Stats tracked per quiz when building the breakdown */
interface QuizBreakdownEntry {
  results: FormattedQuizResult[];
  stats: {
    attempts: number;
    averageScore: string;
    passRate: string;
  };
}

/**
 * Action to retrieve quiz/assessment results from LearnWorlds
 */
@RegisterClass(BaseAction, 'GetQuizResultsAction')
export class GetQuizResultsAction extends LearnWorldsBaseAction {
  // ----------------------------------------------------------------
  // Typed public method – can be called directly from code
  // ----------------------------------------------------------------

  /**
   * Get quiz results for a user, course, or specific quiz.
   * Throws on any error.
   */
  public async GetQuizResults(params: GetQuizResultsParams, contextUser: UserInfo): Promise<GetQuizResultsResult> {
    this.SetCompanyContext(params.CompanyID);

    const {
      UserID: userId,
      CourseID: courseId,
      QuizID: quizId,
      IncludeQuestions: includeQuestionsRaw,
      IncludeAnswers: includeAnswersRaw,
      PassingOnly: passingOnly = false,
      DateFrom: dateFrom,
      DateTo: dateTo,
      SortBy: sortBy = 'completed_at',
      SortOrder: sortOrder = 'desc',
      MaxResults: maxResults = 100,
    } = params;

    const includeQuestions = includeQuestionsRaw !== false;
    const includeAnswers = includeAnswersRaw !== false;

    // Require at least one identifier
    if (!userId && !courseId && !quizId) {
      throw new Error('At least one of UserID, CourseID, or QuizID is required');
    }

    // Build query parameters
    const queryParams = this.buildQuizQueryParams(userId, quizId, passingOnly, dateFrom, dateTo, sortBy, sortOrder, maxResults);

    // Determine endpoint
    const endpoint = this.buildQuizEndpoint(userId, courseId, quizId);

    // Build query string
    const queryString = this.buildQueryString(queryParams);

    // Fetch quiz results
    const resultsResponse = await this.makeLearnWorldsRequest<LWQuizResultsApiResponse>(endpoint + queryString, 'GET', null, contextUser);

    if (resultsResponse.success === false) {
      throw new Error(resultsResponse.message || 'Failed to retrieve quiz results');
    }

    // Normalize results
    const rawResults = this.extractQuizResultsArray(resultsResponse);

    // Process each quiz result
    const formattedResults = await this.processQuizResults(rawResults, userId, courseId, quizId, includeQuestions, includeAnswers, contextUser);

    // Calculate summary
    const summary = this.buildQuizResultsSummary(formattedResults, userId, courseId, quizId, dateFrom, dateTo);

    return {
      QuizResults: formattedResults,
      TotalCount: formattedResults.length,
      Summary: summary,
    };
  }

  // ----------------------------------------------------------------
  // Framework wrapper – thin delegation to the public method
  // ----------------------------------------------------------------

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    const { Params, ContextUser } = params;
    this.params = Params;

    try {
      const typedParams = this.extractQuizResultsParams(Params);
      const result = await this.GetQuizResults(typedParams, ContextUser);

      this.setOutputParam(Params, 'QuizResults', result.QuizResults);
      this.setOutputParam(Params, 'TotalCount', result.TotalCount);
      this.setOutputParam(Params, 'Summary', result.Summary);

      return this.buildSuccessResult(`Retrieved ${result.TotalCount} quiz result(s)`, Params);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      return this.buildErrorResult('ERROR', `Error retrieving quiz results: ${msg}`, Params);
    }
  }

  // ----------------------------------------------------------------
  // Private helpers – parameter extraction
  // ----------------------------------------------------------------

  private extractQuizResultsParams(params: ActionParam[]): GetQuizResultsParams {
    return {
      CompanyID: this.getParamValue(params, 'CompanyID') as string,
      UserID: this.getParamValue(params, 'UserID') as string | undefined,
      CourseID: this.getParamValue(params, 'CourseID') as string | undefined,
      QuizID: this.getParamValue(params, 'QuizID') as string | undefined,
      IncludeQuestions: this.getParamValue(params, 'IncludeQuestions') as boolean | undefined,
      IncludeAnswers: this.getParamValue(params, 'IncludeAnswers') as boolean | undefined,
      PassingOnly: this.getParamValue(params, 'PassingOnly') as boolean | undefined,
      DateFrom: this.getParamValue(params, 'DateFrom') as string | undefined,
      DateTo: this.getParamValue(params, 'DateTo') as string | undefined,
      SortBy: this.getParamValue(params, 'SortBy') as string | undefined,
      SortOrder: this.getParamValue(params, 'SortOrder') as 'asc' | 'desc' | undefined,
      MaxResults: this.getParamValue(params, 'MaxResults') as number | undefined,
    };
  }

  // ----------------------------------------------------------------
  // Private helpers – query building
  // ----------------------------------------------------------------

  private buildQuizQueryParams(
    userId: string | undefined,
    quizId: string | undefined,
    passingOnly: boolean,
    dateFrom: string | undefined,
    dateTo: string | undefined,
    sortBy: string,
    sortOrder: string,
    maxResults: number,
  ): LWQuizResultQueryParams {
    const queryParams: LWQuizResultQueryParams = {
      limit: Math.min(maxResults, 100),
      sort: sortBy,
      order: sortOrder,
    };

    if (passingOnly) {
      queryParams.passed = true;
    }
    if (dateFrom) {
      queryParams.completed_after = new Date(dateFrom).toISOString();
    }
    if (dateTo) {
      queryParams.completed_before = new Date(dateTo).toISOString();
    }
    if (quizId && userId) {
      queryParams.user_id = userId;
    }

    return queryParams;
  }

  private buildQuizEndpoint(userId: string | undefined, courseId: string | undefined, quizId: string | undefined): string {
    if (quizId) {
      return `/quizzes/${quizId}/results`;
    } else if (userId && courseId) {
      return `/users/${userId}/courses/${courseId}/quiz-results`;
    } else if (userId) {
      return `/users/${userId}/quiz-results`;
    } else if (courseId) {
      return `/courses/${courseId}/quiz-results`;
    }
    return '/quiz-results';
  }

  private buildQueryString(queryParams: Record<string, string | number | boolean | undefined>): string {
    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined) {
        filtered[key] = String(value);
      }
    }
    const keys = Object.keys(filtered);
    if (keys.length === 0) return '';
    return '?' + new URLSearchParams(filtered).toString();
  }

  private extractQuizResultsArray(response: LWQuizResultsApiResponse): LWRawQuizResult[] {
    const data = response.data;
    if (Array.isArray(data)) {
      return data;
    }
    if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  }

  // ----------------------------------------------------------------
  // Private helpers – processing
  // ----------------------------------------------------------------

  private async processQuizResults(
    rawResults: LWRawQuizResult[],
    userId: string | undefined,
    courseId: string | undefined,
    quizId: string | undefined,
    includeQuestions: boolean,
    includeAnswers: boolean,
    contextUser: UserInfo,
  ): Promise<FormattedQuizResult[]> {
    const formatted: FormattedQuizResult[] = [];

    for (const result of rawResults) {
      const formattedResult = this.buildBaseQuizResult(result, userId, courseId, quizId);

      // Attach user info if available
      if (result.user) {
        formattedResult.user = {
          id: result.user.id || '',
          email: result.user.email || '',
          name: result.user.name || `${result.user.first_name || ''} ${result.user.last_name || ''}`.trim(),
        };
      }

      // Attach quiz info
      formattedResult.quiz = await this.resolveQuizInfo(result, quizId, contextUser);

      // Attach questions & answers if requested
      if (includeQuestions || includeAnswers) {
        await this.attachDetailedResults(formattedResult, includeQuestions, includeAnswers, contextUser);
      }

      formatted.push(formattedResult);
    }

    return formatted;
  }

  private buildBaseQuizResult(
    result: LWRawQuizResult,
    userId: string | undefined,
    courseId: string | undefined,
    quizId: string | undefined,
  ): FormattedQuizResult {
    const score = result.score || 0;
    const maxScore = result.max_score || result.total_points || 100;

    return {
      id: result.id || result.result_id || '',
      userId: result.user_id || userId || '',
      courseId: result.course_id || courseId || '',
      quizId: result.quiz_id || quizId || '',
      attemptNumber: result.attempt_number || result.attempt || 1,
      score,
      maxScore,
      percentage: result.percentage || (score / (maxScore || 100)) * 100,
      passed: result.passed || result.is_passing || false,
      passingScore: result.passing_score || result.passing_percentage || 70,
      startedAt: result.started_at,
      completedAt: result.completed_at || result.submitted_at,
      duration: result.duration || result.time_spent || 0,
      durationText: this.formatDuration(result.duration || result.time_spent || 0),
    };
  }

  private async resolveQuizInfo(
    result: LWRawQuizResult,
    filterQuizId: string | undefined,
    contextUser: UserInfo,
  ): Promise<{ id: string; title: string; type: string; questionCount?: number } | undefined> {
    if (result.quiz) {
      return {
        id: result.quiz.id || '',
        title: result.quiz.title || result.quiz.name || '',
        type: result.quiz.type || 'quiz',
        questionCount: result.quiz.question_count || result.quiz.total_questions,
      };
    }

    if (!filterQuizId && result.quiz_id) {
      const quizResponse = await this.makeLearnWorldsRequest<LWQuizLookup>(`/quizzes/${result.quiz_id}`, 'GET', null, contextUser);

      if (quizResponse.success !== false && quizResponse.data) {
        const quiz = quizResponse.data;
        return {
          id: quiz.id || '',
          title: quiz.title || quiz.name || '',
          type: quiz.type || 'quiz',
          questionCount: quiz.question_count || quiz.total_questions,
        };
      }
    }

    return undefined;
  }

  private async attachDetailedResults(
    formattedResult: FormattedQuizResult,
    includeQuestions: boolean,
    includeAnswers: boolean,
    contextUser: UserInfo,
  ): Promise<void> {
    const detailsResponse = await this.makeLearnWorldsRequest<LWQuizDetailResponse>(`/quiz-results/${formattedResult.id}/details`, 'GET', null, contextUser);

    if (detailsResponse.success === false || !detailsResponse.data) {
      return;
    }

    const details = detailsResponse.data;

    if (includeQuestions) {
      formattedResult.questions = this.formatQuestions(details.questions || details.answers || []);
    }

    if (includeAnswers) {
      formattedResult.answers = this.formatAnswers(details.answers || details.questions || []);

      // Calculate additional metrics
      const answers = formattedResult.answers;
      formattedResult.metrics = this.calculateQuizMetrics(answers);
    }
  }

  // ----------------------------------------------------------------
  // Private helpers – formatting
  // ----------------------------------------------------------------

  /**
   * Format quiz questions
   */
  private formatQuestions(questions: LWRawQuestion[]): FormattedQuestion[] {
    return questions.map((q, index) => ({
      questionNumber: q.question_number || index + 1,
      questionId: q.question_id || q.id || '',
      questionText: q.question_text || q.question || q.text || '',
      questionType: q.question_type || q.type || 'multiple-choice',
      points: q.points || q.score || 1,
      difficulty: q.difficulty || 'medium',
    }));
  }

  /**
   * Format user answers
   */
  private formatAnswers(answers: LWRawAnswer[]): FormattedAnswer[] {
    return answers.map((a, index) => ({
      questionNumber: a.question_number || index + 1,
      questionId: a.question_id,
      userAnswer: a.user_answer || a.answer || a.selected_answer,
      correctAnswer: a.correct_answer,
      isCorrect: a.is_correct || a.correct || false,
      pointsEarned: a.points_earned || (a.is_correct ? a.points || 1 : 0),
      pointsPossible: a.points_possible || a.points || 1,
      feedback: a.feedback,
      timeSpent: a.time_spent,
      answeredAt: a.answered_at,
    }));
  }

  private calculateQuizMetrics(answers: FormattedAnswer[]): QuizMetrics {
    const correctCount = answers.filter((a) => a.isCorrect).length;
    return {
      correctAnswers: correctCount,
      incorrectAnswers: answers.filter((a) => !a.isCorrect).length,
      totalQuestions: answers.length,
      accuracyRate: answers.length > 0 ? ((correctCount / answers.length) * 100).toFixed(1) : 0,
    };
  }

  // ----------------------------------------------------------------
  // Private helpers – summary
  // ----------------------------------------------------------------

  private buildQuizResultsSummary(
    formattedResults: FormattedQuizResult[],
    userId: string | undefined,
    courseId: string | undefined,
    quizId: string | undefined,
    dateFrom: string | undefined,
    dateTo: string | undefined,
  ): QuizResultsSummary {
    const totalResults = formattedResults.length;
    const passedResults = formattedResults.filter((r) => r.passed).length;

    const averageScore = totalResults > 0 ? formattedResults.reduce((sum, r) => sum + r.percentage, 0) / totalResults : 0;

    const averageDuration = totalResults > 0 ? formattedResults.reduce((sum, r) => sum + (r.duration || 0), 0) / totalResults : 0;

    // Group results by quiz if multiple quizzes
    const quizBreakdown = !quizId ? this.buildQuizBreakdown(formattedResults) : null;

    const filterType = userId ? (courseId ? 'user-course' : 'user') : courseId ? 'course' : 'all';

    return {
      totalResults,
      passedResults,
      failedResults: totalResults - passedResults,
      passRate: totalResults > 0 ? ((passedResults / totalResults) * 100).toFixed(1) : 0,
      averageScore: averageScore.toFixed(1),
      averageDuration,
      averageDurationText: this.formatDuration(Math.round(averageDuration)),
      dateRange: {
        from: dateFrom || 'all-time',
        to: dateTo || 'current',
      },
      filterType,
      quizBreakdown,
    };
  }

  private buildQuizBreakdown(formattedResults: FormattedQuizResult[]): Record<string, QuizBreakdownEntry> {
    const resultsByQuiz: Record<string, QuizBreakdownEntry> = {};

    for (const result of formattedResults) {
      const quizTitle = result.quiz?.title || 'Unknown Quiz';
      if (!resultsByQuiz[quizTitle]) {
        resultsByQuiz[quizTitle] = {
          results: [],
          stats: { attempts: 0, averageScore: '0', passRate: '0' },
        };
      }
      resultsByQuiz[quizTitle].results.push(result);
    }

    // Calculate stats for each quiz
    for (const quizTitle of Object.keys(resultsByQuiz)) {
      const quizResults = resultsByQuiz[quizTitle].results;
      const qTotal = quizResults.length;
      const qPassed = quizResults.filter((r) => r.passed).length;
      const qAvgScore = quizResults.reduce((sum, r) => sum + r.percentage, 0) / qTotal;

      resultsByQuiz[quizTitle].stats = {
        attempts: qTotal,
        averageScore: qAvgScore.toFixed(1),
        passRate: ((qPassed / qTotal) * 100).toFixed(1),
      };
    }

    return resultsByQuiz;
  }

  // ----------------------------------------------------------------
  // Params & Description metadata
  // ----------------------------------------------------------------

  /**
   * Define the parameters this action expects
   */
  public get Params(): ActionParam[] {
    const baseParams = this.getCommonLMSParams();
    const specificParams: ActionParam[] = [
      { Name: 'UserID', Type: 'Input', Value: null },
      { Name: 'CourseID', Type: 'Input', Value: null },
      { Name: 'QuizID', Type: 'Input', Value: null },
      { Name: 'IncludeQuestions', Type: 'Input', Value: true },
      { Name: 'IncludeAnswers', Type: 'Input', Value: true },
      { Name: 'PassingOnly', Type: 'Input', Value: false },
      { Name: 'DateFrom', Type: 'Input', Value: null },
      { Name: 'DateTo', Type: 'Input', Value: null },
      { Name: 'SortBy', Type: 'Input', Value: 'completed_at' },
      { Name: 'SortOrder', Type: 'Input', Value: 'desc' },
      { Name: 'MaxResults', Type: 'Input', Value: 100 },
      { Name: 'QuizResults', Type: 'Output', Value: null },
      { Name: 'TotalCount', Type: 'Output', Value: null },
      { Name: 'Summary', Type: 'Output', Value: null },
    ];
    return [...baseParams, ...specificParams];
  }

  /**
   * Metadata about this action
   */
  public get Description(): string {
    return 'Retrieves quiz and assessment results from LearnWorlds with detailed question/answer information';
  }
}
