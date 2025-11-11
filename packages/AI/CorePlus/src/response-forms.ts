/**
 * @fileoverview Type definitions for agent response forms.
 *
 * This module contains type definitions for collecting structured user input
 * through forms in agent-UI interactions. Agents can request information from
 * users using various question types (text, numbers, dates, choices) and the
 * UI will render appropriate input controls.
 *
 * @module @memberjunction/ai-core-plus
 * @author MemberJunction.com
 * @since 2.116.0
 */

/**
 * Form definition for collecting structured user input.
 *
 * Agents can return this in their response to request information from users.
 * The UI will render the form appropriately based on complexity:
 * - Single question with buttongroup/radio and no title → Simple button UI
 * - Everything else → Full form with title, validation, and submit button
 *
 * @example Simple choice (renders as buttons)
 * ```json
 * {
 *   "questions": [
 *     {
 *       "id": "choice",
 *       "label": "Which customer?",
 *       "type": {
 *         "type": "buttongroup",
 *         "options": [
 *           { "value": "cust-123", "label": "Acme Corp" },
 *           { "value": "cust-456", "label": "Acme Industries" }
 *         ]
 *       }
 *     }
 *   ]
 * }
 * ```
 *
 * @example Full form
 * ```json
 * {
 *   "title": "New Customer",
 *   "submitLabel": "Create Customer",
 *   "questions": [
 *     {
 *       "id": "name",
 *       "label": "Company Name",
 *       "type": { "type": "text", "placeholder": "Acme Corp" },
 *       "required": true
 *     },
 *     {
 *       "id": "revenue",
 *       "label": "Annual Revenue",
 *       "type": { "type": "currency", "prefix": "$" },
 *       "helpText": "Estimated annual revenue in USD"
 *     }
 *   ]
 * }
 * ```
 */
export interface AgentResponseForm {
    /** Optional title shown at top of form */
    title?: string;

    /** Optional description/instructions for the form */
    description?: string;

    /** Optional custom label for submit button (default: "Submit") */
    submitLabel?: string;

    /** Array of questions to ask the user */
    questions: FormQuestion[];
}

/**
 * A single question in a response form.
 *
 * Each question has an ID (used as the key in the response object),
 * a label, a type (determines which input control to render), and
 * optional validation/help text.
 */
export interface FormQuestion {
    /**
     * Unique identifier for this question within the form.
     * Used as the key in the response object returned to the agent.
     */
    id: string;

    /**
     * Label text displayed to the user.
     * Should be clear and concise (e.g., "Company Name", "Industry").
     */
    label: string;

    /**
     * Question type configuration.
     * Determines which input control is rendered and validation rules.
     */
    type: FormQuestionType;

    /**
     * Whether this question must be answered.
     * Default: false
     */
    required?: boolean;

    /**
     * Default value to pre-populate the input.
     * Type should match the question type.
     */
    defaultValue?: any;

    /**
     * Optional help text shown below the input.
     * Use for clarification or examples (e.g., "Estimated annual revenue in USD").
     */
    helpText?: string;
}

/**
 * Union type of all supported question types.
 * Each type has specific configuration options.
 */
export type FormQuestionType =
    | TextQuestionType
    | NumberQuestionType
    | DateQuestionType
    | ChoiceQuestionType
    | SliderQuestionType
    | DateRangeQuestionType
    | TimeQuestionType;

/**
 * Text input question types.
 * Supports single-line text, multi-line textarea, and email validation.
 */
export interface TextQuestionType {
    /**
     * Type of text input:
     * - 'text': Single-line text input
     * - 'textarea': Multi-line text input
     * - 'email': Email validation applied
     */
    type: 'text' | 'textarea' | 'email';

    /** Optional placeholder text shown in empty input */
    placeholder?: string;

    /** Maximum number of characters allowed */
    maxLength?: number;
}

/**
 * Numeric input question types.
 * Supports plain numbers and formatted currency.
 */
export interface NumberQuestionType {
    /**
     * Type of numeric input:
     * - 'number': Plain numeric input
     * - 'currency': Formatted as currency with optional prefix/suffix
     */
    type: 'number' | 'currency';

    /** Minimum allowed value */
    min?: number;

    /** Maximum allowed value */
    max?: number;

    /** Optional prefix for display (e.g., "$" for currency) */
    prefix?: string;

    /** Optional suffix for display (e.g., "USD", "kg") */
    suffix?: string;
}

/**
 * Date/time input question types.
 * Supports date-only and date-time pickers.
 */
export interface DateQuestionType {
    /**
     * Type of date input:
     * - 'date': Date-only picker
     * - 'datetime': Date and time picker
     */
    type: 'date' | 'datetime';
}

/**
 * Choice selection question types.
 * Supports various UI presentations of a list of options.
 */
export interface ChoiceQuestionType {
    /**
     * Type of choice UI:
     * - 'buttongroup': Horizontal button group (for 2-4 options)
     * - 'radio': Vertical radio button list (for 2-6 options)
     * - 'dropdown': Dropdown list (for 5+ options)
     * - 'checkbox': Multiple checkboxes (for multiple selections)
     */
    type: 'buttongroup' | 'radio' | 'dropdown' | 'checkbox';

    /** Array of available options */
    options: FormOption[];

    /**
     * Whether multiple selections are allowed.
     * Only applies to 'checkbox' type.
     * Default: false
     */
    multiple?: boolean;
}

/**
 * A single option in a choice question.
 */
export interface FormOption {
    /**
     * Value returned when this option is selected.
     * Can be string, number, or boolean.
     */
    value: string | number | boolean;

    /**
     * Label text displayed to the user.
     */
    label: string;

    /**
     * Optional icon to display with the option.
     * Should be a Font Awesome class (e.g., "fa-user", "fa-building").
     */
    icon?: string;
}

/**
 * Slider input for numeric ranges.
 * Provides visual control for selecting values within a range.
 * Useful for ratings, percentages, volumes, or any bounded numeric input.
 */
export interface SliderQuestionType {
    /**
     * Type identifier for slider input.
     */
    type: 'slider';

    /**
     * Minimum value on the slider scale.
     */
    min: number;

    /**
     * Maximum value on the slider scale.
     */
    max: number;

    /**
     * Step increment for the slider.
     * Default: 1
     */
    step?: number;

    /**
     * Optional unit suffix displayed with the value (e.g., '%', 'kg', 'miles').
     */
    suffix?: string;
}

/**
 * Date range input for selecting start and end dates.
 * Returns an object with 'start' and 'end' date properties.
 * Useful for project durations, availability periods, reporting ranges.
 */
export interface DateRangeQuestionType {
    /**
     * Type identifier for date range input.
     */
    type: 'daterange';
}

/**
 * Time-only input (no date component).
 * For scheduling, business hours, appointment times, etc.
 * Returns time in 'HH:mm' format.
 */
export interface TimeQuestionType {
    /**
     * Type identifier for time input.
     */
    type: 'time';
}
