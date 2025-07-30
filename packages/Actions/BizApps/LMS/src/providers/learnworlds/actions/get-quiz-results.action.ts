import { RegisterClass } from '@memberjunction/global';
import { LearnWorldsBaseAction } from '../learnworlds-base.action';
import { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { BaseAction } from '@memberjunction/actions';

/**
 * Action to retrieve quiz/assessment results from LearnWorlds
 */
@RegisterClass(BaseAction, 'GetQuizResultsAction')
export class GetQuizResultsAction extends LearnWorldsBaseAction {
    /**
     * Get quiz results for a user, course, or specific quiz
     */
    public async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const { Params, ContextUser } = params;
        this.params = Params;
        
        try {
            // Extract and validate parameters
            const userId = this.getParamValue(Params, 'UserID');
            const courseId = this.getParamValue(Params, 'CourseID');
            const quizId = this.getParamValue(Params, 'QuizID');
            const includeQuestions = this.getParamValue(Params, 'IncludeQuestions') !== false;
            const includeAnswers = this.getParamValue(Params, 'IncludeAnswers') !== false;
            const passingOnly = this.getParamValue(Params, 'PassingOnly') === true;
            const dateFrom = this.getParamValue(Params, 'DateFrom');
            const dateTo = this.getParamValue(Params, 'DateTo');
            const sortBy = this.getParamValue(Params, 'SortBy') || 'completed_at';
            const sortOrder = this.getParamValue(Params, 'SortOrder') || 'desc';
            const maxResults = this.getParamValue(Params, 'MaxResults') || 100;
            
            // Require at least one identifier
            if (!userId && !courseId && !quizId) {
                return {
                    Success: false,
                    ResultCode: 'VALIDATION_ERROR',
                    Message: 'At least one of UserID, CourseID, or QuizID is required',
                    Params
                };
            }


            // Build query parameters
            const queryParams: any = {
                limit: Math.min(maxResults, 100),
                sort: sortBy,
                order: sortOrder
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

            // Determine endpoint based on parameters
            let endpoint = '/quiz-results';
            if (quizId) {
                endpoint = `/quizzes/${quizId}/results`;
                if (userId) {
                    queryParams.user_id = userId;
                }
            } else if (userId && courseId) {
                endpoint = `/users/${userId}/courses/${courseId}/quiz-results`;
            } else if (userId) {
                endpoint = `/users/${userId}/quiz-results`;
            } else if (courseId) {
                endpoint = `/courses/${courseId}/quiz-results`;
            }

            // Build query string
            const queryString = Object.keys(queryParams).length > 0 
                ? '?' + new URLSearchParams(queryParams).toString()
                : '';

            // Get quiz results
            const resultsResponse = await this.makeLearnWorldsRequest(
                endpoint + queryString,
                'GET',
                null,
                ContextUser
            );

            if (!resultsResponse.success) {
                return {
                    Success: false,
                    ResultCode: 'API_ERROR',
                    Message: resultsResponse.message || 'Failed to retrieve quiz results',
                    Params
                };
            }

            const results = resultsResponse.data?.data || resultsResponse.data || [];
            const formattedResults: any[] = [];

            // Process each quiz result
            for (const result of results) {
                const formattedResult: any = {
                    id: result.id || result.result_id,
                    userId: result.user_id || userId,
                    courseId: result.course_id || courseId,
                    quizId: result.quiz_id || quizId,
                    attemptNumber: result.attempt_number || result.attempt || 1,
                    score: result.score || 0,
                    maxScore: result.max_score || result.total_points || 100,
                    percentage: result.percentage || ((result.score / (result.max_score || 100)) * 100),
                    passed: result.passed || result.is_passing || false,
                    passingScore: result.passing_score || result.passing_percentage || 70,
                    startedAt: result.started_at,
                    completedAt: result.completed_at || result.submitted_at,
                    duration: result.duration || result.time_spent,
                    durationText: this.formatDuration(result.duration || result.time_spent || 0)
                };

                // Add user info if available
                if (result.user && !formattedResult.user) {
                    formattedResult.user = {
                        id: result.user.id,
                        email: result.user.email,
                        name: result.user.name || `${result.user.first_name || ''} ${result.user.last_name || ''}`.trim()
                    };
                }

                // Add quiz info if available
                if (result.quiz) {
                    formattedResult.quiz = {
                        id: result.quiz.id,
                        title: result.quiz.title || result.quiz.name,
                        type: result.quiz.type || 'quiz',
                        questionCount: result.quiz.question_count || result.quiz.total_questions
                    };
                } else if (!quizId && result.quiz_id) {
                    // Try to get quiz info
                    const quizResponse = await this.makeLearnWorldsRequest(
                        `/quizzes/${result.quiz_id}`,
                        'GET',
                        null,
                        ContextUser
                    );
                    
                    if (quizResponse.success && quizResponse.data) {
                        const quiz = quizResponse.data;
                        formattedResult.quiz = {
                            id: quiz.id,
                            title: quiz.title || quiz.name,
                            type: quiz.type || 'quiz',
                            questionCount: quiz.question_count || quiz.total_questions
                        };
                    }
                }

                // Add questions and answers if requested
                if (includeQuestions || includeAnswers) {
                    const detailsResponse = await this.makeLearnWorldsRequest(
                        `/quiz-results/${formattedResult.id}/details`,
                        'GET',
                        null,
                        ContextUser
                    );

                    if (detailsResponse.success && detailsResponse.data) {
                        const details = detailsResponse.data;
                        
                        if (includeQuestions) {
                            formattedResult.questions = this.formatQuestions(details.questions || details.answers || []);
                        }

                        if (includeAnswers) {
                            formattedResult.answers = this.formatAnswers(details.answers || details.questions || []);
                            
                            // Calculate additional metrics
                            const answers = formattedResult.answers || [];
                            formattedResult.metrics = {
                                correctAnswers: answers.filter((a: any) => a.isCorrect).length,
                                incorrectAnswers: answers.filter((a: any) => !a.isCorrect).length,
                                totalQuestions: answers.length,
                                accuracyRate: answers.length > 0 
                                    ? (answers.filter((a: any) => a.isCorrect).length / answers.length * 100).toFixed(1)
                                    : 0
                            };
                        }
                    }
                }

                formattedResults.push(formattedResult);
            }

            // Calculate summary statistics
            const totalResults = formattedResults.length;
            const passedResults = formattedResults.filter(r => r.passed).length;
            const averageScore = totalResults > 0 
                ? formattedResults.reduce((sum, r) => sum + r.percentage, 0) / totalResults 
                : 0;
            const averageDuration = totalResults > 0
                ? formattedResults.reduce((sum, r) => sum + (r.duration || 0), 0) / totalResults
                : 0;

            // Group results by quiz if multiple quizzes
            const resultsByQuiz: any = {};
            if (!quizId) {
                formattedResults.forEach(result => {
                    const quizTitle = result.quiz?.title || 'Unknown Quiz';
                    if (!resultsByQuiz[quizTitle]) {
                        resultsByQuiz[quizTitle] = {
                            results: [],
                            stats: {
                                attempts: 0,
                                averageScore: 0,
                                passRate: 0
                            }
                        };
                    }
                    resultsByQuiz[quizTitle].results.push(result);
                });

                // Calculate stats for each quiz
                Object.keys(resultsByQuiz).forEach(quizTitle => {
                    const quizResults = resultsByQuiz[quizTitle].results;
                    resultsByQuiz[quizTitle].stats = {
                        attempts: quizResults.length,
                        averageScore: (quizResults.reduce((sum: number, r: any) => sum + r.percentage, 0) / quizResults.length).toFixed(1),
                        passRate: ((quizResults.filter((r: any) => r.passed).length / quizResults.length) * 100).toFixed(1)
                    };
                });
            }

            // Create summary
            const summary = {
                totalResults: totalResults,
                passedResults: passedResults,
                failedResults: totalResults - passedResults,
                passRate: totalResults > 0 ? ((passedResults / totalResults) * 100).toFixed(1) : 0,
                averageScore: averageScore.toFixed(1),
                averageDuration: averageDuration,
                averageDurationText: this.formatDuration(Math.round(averageDuration)),
                dateRange: {
                    from: dateFrom || 'all-time',
                    to: dateTo || 'current'
                },
                filterType: userId ? (courseId ? 'user-course' : 'user') : (courseId ? 'course' : 'all'),
                quizBreakdown: !quizId ? resultsByQuiz : null
            };

            // Update output parameters
            const outputParams = [...Params];
            const quizResultsParam = outputParams.find(p => p.Name === 'QuizResults');
            if (quizResultsParam) {
                quizResultsParam.Value = formattedResults;
            }
            const totalCountParam = outputParams.find(p => p.Name === 'TotalCount');
            if (totalCountParam) {
                totalCountParam.Value = totalResults;
            }
            const summaryParam = outputParams.find(p => p.Name === 'Summary');
            if (summaryParam) {
                summaryParam.Value = summary;
            }

            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Retrieved ${totalResults} quiz result(s)`,
                Params: outputParams
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            return {
                Success: false,
                ResultCode: 'EXECUTION_ERROR',
                Message: `Error retrieving quiz results: ${errorMessage}`,
                Params
            };
        }
    }

    /**
     * Format quiz questions
     */
    private formatQuestions(questions: any[]): any[] {
        return questions.map((q, index) => ({
            questionNumber: q.question_number || index + 1,
            questionId: q.question_id || q.id,
            questionText: q.question_text || q.question || q.text,
            questionType: q.question_type || q.type || 'multiple-choice',
            points: q.points || q.score || 1,
            difficulty: q.difficulty || 'medium'
        }));
    }

    /**
     * Format user answers
     */
    private formatAnswers(answers: any[]): any[] {
        return answers.map((a, index) => ({
            questionNumber: a.question_number || index + 1,
            questionId: a.question_id,
            userAnswer: a.user_answer || a.answer || a.selected_answer,
            correctAnswer: a.correct_answer,
            isCorrect: a.is_correct || a.correct || false,
            pointsEarned: a.points_earned || (a.is_correct ? (a.points || 1) : 0),
            pointsPossible: a.points_possible || a.points || 1,
            feedback: a.feedback,
            timeSpent: a.time_spent,
            answeredAt: a.answered_at
        }));
    }

    /**
     * Define the parameters this action expects
     */
    public get Params(): ActionParam[] {
        const baseParams = this.getCommonLMSParams();
        const specificParams: ActionParam[] = [
            {
                Name: 'UserID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'CourseID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'QuizID',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'IncludeQuestions',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'IncludeAnswers',
                Type: 'Input',
                Value: true
            },
            {
                Name: 'PassingOnly',
                Type: 'Input',
                Value: false
            },
            {
                Name: 'DateFrom',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'DateTo',
                Type: 'Input',
                Value: null
            },
            {
                Name: 'SortBy',
                Type: 'Input',
                Value: 'completed_at'
            },
            {
                Name: 'SortOrder',
                Type: 'Input',
                Value: 'desc'
            },
            {
                Name: 'MaxResults',
                Type: 'Input',
                Value: 100
            },
            {
                Name: 'QuizResults',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'TotalCount',
                Type: 'Output',
                Value: null
            },
            {
                Name: 'Summary',
                Type: 'Output',
                Value: null
            }
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