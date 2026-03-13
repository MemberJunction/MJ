import { describe, it, expect } from 'vitest';
import type {
    AgentResponseForm,
    FormQuestion,
    FormQuestionType,
    TextQuestionType,
    NumberQuestionType,
    DateQuestionType,
    ChoiceQuestionType,
    SliderQuestionType,
    DateRangeQuestionType,
    TimeQuestionType,
    FormOption
} from '../response-forms';

describe('AgentResponseForm', () => {
    it('should create a form with questions', () => {
        const form: AgentResponseForm = {
            title: 'New Customer',
            description: 'Enter customer details',
            submitLabel: 'Create Customer',
            questions: [
                {
                    id: 'name',
                    label: 'Company Name',
                    type: { type: 'text', placeholder: 'Acme Corp' },
                    required: true
                }
            ]
        };

        expect(form.title).toBe('New Customer');
        expect(form.description).toBe('Enter customer details');
        expect(form.submitLabel).toBe('Create Customer');
        expect(form.questions).toHaveLength(1);
        expect(form.questions[0].id).toBe('name');
        expect(form.questions[0].required).toBe(true);
    });

    it('should work with only required fields', () => {
        const form: AgentResponseForm = {
            questions: [
                {
                    id: 'choice',
                    label: 'Pick one',
                    type: { type: 'buttongroup', options: [{ value: 'a', label: 'A' }] }
                }
            ]
        };

        expect(form.title).toBeUndefined();
        expect(form.description).toBeUndefined();
        expect(form.submitLabel).toBeUndefined();
        expect(form.questions).toHaveLength(1);
    });

    it('should serialize to JSON and back', () => {
        const form: AgentResponseForm = {
            title: 'Test Form',
            questions: [
                {
                    id: 'q1',
                    label: 'Question 1',
                    type: { type: 'text' },
                    required: true,
                    defaultValue: 'default',
                    helpText: 'Enter a value'
                }
            ]
        };

        const json = JSON.stringify(form);
        const restored: AgentResponseForm = JSON.parse(json);

        expect(restored.title).toBe('Test Form');
        expect(restored.questions).toHaveLength(1);
        expect(restored.questions[0].id).toBe('q1');
        expect(restored.questions[0].required).toBe(true);
        expect(restored.questions[0].defaultValue).toBe('default');
        expect(restored.questions[0].helpText).toBe('Enter a value');
    });
});

describe('TextQuestionType', () => {
    it('should support text, textarea, and email variants', () => {
        const textTypes: Array<TextQuestionType['type']> = ['text', 'textarea', 'email'];

        textTypes.forEach(textType => {
            const question: FormQuestion = {
                id: `field-${textType}`,
                label: `${textType} field`,
                type: { type: textType, placeholder: 'Enter value', maxLength: 100 }
            };
            expect(question.type.type).toBe(textType);
        });
    });
});

describe('NumberQuestionType', () => {
    it('should create a number question with constraints', () => {
        const question: FormQuestion = {
            id: 'revenue',
            label: 'Annual Revenue',
            type: { type: 'currency', min: 0, max: 1000000, prefix: '$', suffix: 'USD' }
        };

        const numType = question.type as NumberQuestionType;
        expect(numType.type).toBe('currency');
        expect(numType.min).toBe(0);
        expect(numType.max).toBe(1000000);
        expect(numType.prefix).toBe('$');
        expect(numType.suffix).toBe('USD');
    });
});

describe('DateQuestionType', () => {
    it('should support date and datetime variants', () => {
        const dateOnly: FormQuestion = {
            id: 'birthdate',
            label: 'Birth Date',
            type: { type: 'date' }
        };
        const dateTime: FormQuestion = {
            id: 'appointment',
            label: 'Appointment',
            type: { type: 'datetime' }
        };

        expect((dateOnly.type as DateQuestionType).type).toBe('date');
        expect((dateTime.type as DateQuestionType).type).toBe('datetime');
    });
});

describe('ChoiceQuestionType', () => {
    it('should create a choice question with options', () => {
        const options: FormOption[] = [
            { value: 'a', label: 'Option A', icon: 'fa-star' },
            { value: 'b', label: 'Option B' },
            { value: 3, label: 'Option C' },
            { value: true, label: 'Yes' }
        ];

        const question: FormQuestion = {
            id: 'selection',
            label: 'Choose one',
            type: { type: 'buttongroup', options }
        };

        const choiceType = question.type as ChoiceQuestionType;
        expect(choiceType.options).toHaveLength(4);
        expect(choiceType.options[0].icon).toBe('fa-star');
        expect(choiceType.options[1].icon).toBeUndefined();
        expect(choiceType.options[2].value).toBe(3);
        expect(choiceType.options[3].value).toBe(true);
    });

    it('should support all choice UI variants', () => {
        const variants: Array<ChoiceQuestionType['type']> = ['buttongroup', 'radio', 'dropdown', 'checkbox'];

        variants.forEach(variant => {
            const question: FormQuestion = {
                id: `choice-${variant}`,
                label: `${variant} choice`,
                type: { type: variant, options: [{ value: '1', label: 'One' }] }
            };
            expect(question.type.type).toBe(variant);
        });
    });
});

describe('SliderQuestionType', () => {
    it('should create a slider question with range and step', () => {
        const question: FormQuestion = {
            id: 'rating',
            label: 'Rating',
            type: { type: 'slider', min: 0, max: 100, step: 5, suffix: '%' }
        };

        const sliderType = question.type as SliderQuestionType;
        expect(sliderType.type).toBe('slider');
        expect(sliderType.min).toBe(0);
        expect(sliderType.max).toBe(100);
        expect(sliderType.step).toBe(5);
        expect(sliderType.suffix).toBe('%');
    });
});

describe('DateRangeQuestionType', () => {
    it('should create a daterange question', () => {
        const question: FormQuestion = {
            id: 'period',
            label: 'Reporting Period',
            type: { type: 'daterange' }
        };

        expect((question.type as DateRangeQuestionType).type).toBe('daterange');
    });
});

describe('TimeQuestionType', () => {
    it('should create a time question', () => {
        const question: FormQuestion = {
            id: 'meeting_time',
            label: 'Meeting Time',
            type: { type: 'time' }
        };

        expect((question.type as TimeQuestionType).type).toBe('time');
    });
});

describe('FormQuestion optional properties', () => {
    it('should support required, defaultValue, helpText, and widthHint', () => {
        const question: FormQuestion = {
            id: 'email',
            label: 'Email Address',
            type: { type: 'email', placeholder: 'user@example.com' },
            required: true,
            defaultValue: 'admin@example.com',
            helpText: 'Your primary email address',
            widthHint: 'wide'
        };

        expect(question.required).toBe(true);
        expect(question.defaultValue).toBe('admin@example.com');
        expect(question.helpText).toBe('Your primary email address');
        expect(question.widthHint).toBe('wide');
    });
});

describe('AgentResponseForm with all question types', () => {
    it('should handle a form with every question type', () => {
        const form: AgentResponseForm = {
            title: 'Complete Form',
            submitLabel: 'Submit All',
            questions: [
                { id: 'q_text', label: 'Text', type: { type: 'text' } },
                { id: 'q_textarea', label: 'Textarea', type: { type: 'textarea' } },
                { id: 'q_email', label: 'Email', type: { type: 'email' } },
                { id: 'q_number', label: 'Number', type: { type: 'number', min: 0, max: 999 } },
                { id: 'q_currency', label: 'Currency', type: { type: 'currency', prefix: '$' } },
                { id: 'q_date', label: 'Date', type: { type: 'date' } },
                { id: 'q_datetime', label: 'DateTime', type: { type: 'datetime' } },
                { id: 'q_buttongroup', label: 'Buttons', type: { type: 'buttongroup', options: [{ value: 'a', label: 'A' }] } },
                { id: 'q_radio', label: 'Radio', type: { type: 'radio', options: [{ value: 'x', label: 'X' }] } },
                { id: 'q_dropdown', label: 'Dropdown', type: { type: 'dropdown', options: [{ value: '1', label: 'One' }] } },
                { id: 'q_checkbox', label: 'Checkbox', type: { type: 'checkbox', options: [{ value: 'y', label: 'Y' }], multiple: true } },
                { id: 'q_slider', label: 'Slider', type: { type: 'slider', min: 1, max: 10 } },
                { id: 'q_daterange', label: 'DateRange', type: { type: 'daterange' } },
                { id: 'q_time', label: 'Time', type: { type: 'time' } }
            ]
        };

        expect(form.questions).toHaveLength(14);

        const json = JSON.stringify(form);
        const restored: AgentResponseForm = JSON.parse(json);
        expect(restored.questions).toHaveLength(14);
        expect(restored.title).toBe('Complete Form');

        const typeNames = restored.questions.map(q => q.type.type);
        expect(typeNames).toEqual([
            'text', 'textarea', 'email', 'number', 'currency',
            'date', 'datetime', 'buttongroup', 'radio', 'dropdown',
            'checkbox', 'slider', 'daterange', 'time'
        ]);
    });
});
