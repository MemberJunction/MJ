import { LearnWorldsBaseParams } from './common.types';

/**
 * Parameters for the GetQuizResults action
 */
export interface GetQuizResultsParams extends LearnWorldsBaseParams {
  UserID?: string;
  CourseID?: string;
  QuizID?: string;
  IncludeQuestions?: boolean;
  IncludeAnswers?: boolean;
  PassingOnly?: boolean;
  DateFrom?: string;
  DateTo?: string;
  SortBy?: string;
  SortOrder?: 'asc' | 'desc';
  MaxResults?: number;
}

/**
 * Result of the GetQuizResults action
 */
export interface GetQuizResultsResult {
  QuizResults: FormattedQuizResult[];
  TotalCount: number;
  Summary: QuizResultsSummary;
}

export interface FormattedQuizResult {
  id: string;
  userId: string;
  courseId: string;
  quizId: string;
  attemptNumber: number;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  passingScore: number;
  startedAt?: string;
  completedAt?: string;
  duration: number;
  durationText: string;
  user?: {
    id: string;
    email: string;
    name: string;
  };
  quiz?: {
    id: string;
    title: string;
    type: string;
    questionCount?: number;
  };
  questions?: FormattedQuestion[];
  answers?: FormattedAnswer[];
  metrics?: QuizMetrics;
}

export interface FormattedQuestion {
  questionNumber: number;
  questionId: string;
  questionText: string;
  questionType: string;
  points: number;
  difficulty: string;
}

/**
 * Possible answer value types from quiz responses.
 */
export type QuizAnswerValue = string | number | boolean | string[] | undefined;

export interface FormattedAnswer {
  questionNumber: number;
  questionId?: string;
  userAnswer: QuizAnswerValue;
  correctAnswer: QuizAnswerValue;
  isCorrect: boolean;
  pointsEarned: number;
  pointsPossible: number;
  feedback?: string;
  timeSpent?: number;
  answeredAt?: string;
}

export interface QuizMetrics {
  correctAnswers: number;
  incorrectAnswers: number;
  totalQuestions: number;
  accuracyRate: number;
}

export interface QuizResultsSummary {
  totalResults: number;
  passedResults: number;
  failedResults: number;
  passRate: number;
  averageScore: number;
  averageDuration: number;
  averageDurationText: string;
  dateRange: {
    from: string;
    to: string;
  };
  filterType: string;
  quizBreakdown: Record<
    string,
    {
      results: FormattedQuizResult[];
      stats: {
        attempts: number;
        averageScore: number;
        passRate: number;
      };
    }
  > | null;
}
