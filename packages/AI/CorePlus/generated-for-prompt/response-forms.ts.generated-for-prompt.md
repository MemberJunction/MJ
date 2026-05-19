```ts
interface AgentResponseForm {
    title?: string;  // Optional title shown at top of form
    description?: string;  // Optional description/instructions for the form
    submitLabel?: string;  // Optional custom label for submit button (default: "Submit")
    questions: FormQuestion[];  // Array of questions to ask the user
}

interface FormQuestion {
    id: string;  // Unique identifier for this question within the form.
    label: string;  // Label text displayed to the user.
    type: FormQuestionType;  // Question type configuration.
    required?: boolean;  // Whether this question must be answered.
    defaultValue?: any;  // Default value to pre-populate the input.
    helpText?: string;  // Optional help text shown below the input.
    widthHint?: 'narrow' | 'medium' | 'wide' | 'full' | 'auto';  // Optional width hint for the input field.
}

type FormQuestionType =
    | TextQuestionType
    | NumberQuestionType
    | DateQuestionType
    | ChoiceQuestionType
    | SliderQuestionType
    | DateRangeQuestionType
    | TimeQuestionType;

interface TextQuestionType {
    type: 'text' | 'textarea' | 'email';  // Type of text input:
    placeholder?: string;  // Optional placeholder text shown in empty input
    maxLength?: number;  // Maximum number of characters allowed
}

interface NumberQuestionType {
    type: 'number' | 'currency';  // Type of numeric input:
    min?: number;  // Minimum allowed value
    max?: number;  // Maximum allowed value
    prefix?: string;  // Optional prefix for display (e.g., "$" for currency)
    suffix?: string;  // Optional suffix for display (e.g., "USD", "kg")
}

interface DateQuestionType {
    type: 'date' | 'datetime';  // Type of date input:
}

interface ChoiceQuestionType {
    type: 'buttongroup' | 'radio' | 'dropdown' | 'checkbox';  // Type of choice UI:
    options: FormOption[];  // Array of available options
    multiple?: boolean;  // Whether multiple selections are allowed.
}

interface FormOption {
    value: string | number | boolean;  // Value returned when this option is selected.
    label: string;  // Label text displayed to the user.
    icon?: string;  // Optional icon to display with the option.
}

interface SliderQuestionType {
    type: 'slider';  // Type identifier for slider input.
    min: number;  // Minimum value on the slider scale.
    max: number;  // Maximum value on the slider scale.
    step?: number;  // Step increment for the slider.
    suffix?: string;  // Optional unit suffix displayed with the value (e.g., '%', 'kg', 'miles').
}

interface DateRangeQuestionType {
    type: 'daterange';  // Type identifier for date range input.
}

interface TimeQuestionType {
    type: 'time';  // Type identifier for time input.
}
```
