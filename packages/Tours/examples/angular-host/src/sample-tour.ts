import type { TourDefinition } from '@memberjunction/tours-runtime';

/**
 * Sample multi-step tour JSON portable across Explorer, this Angular host, and plain HTML pages.
 */
export const SAMPLE_ANGULAR_HOST_TOUR: TourDefinition = {
  TourKey: 'demo.angular-host.quickstart',
  Name: 'Workspace Quickstart',
  Description: 'Introduces key workspace controls in a standalone Angular application.',
  Status: 'Active',
  VersionNumber: 1,
  Priority: 100,
  DefaultGuideMode: 'Visual',
  PresenterClass: 'Overlay',
  Steps: [
    {
      StepKey: 'welcome',
      Sequence: 10,
      StepType: 'Modal',
      Title: 'Welcome to the Workspace',
      Body: 'This tour runs inside a standalone Angular app with **zero** Explorer dependencies.',
      Configuration: {
        Variant: 'welcome',
        PrimaryButtonText: 'Start Tour',
      },
    },
    {
      StepKey: 'create-project',
      Sequence: 20,
      StepType: 'Spotlight',
      Title: 'Create a Project',
      Body: 'Use this primary action button to create a new workspace project.',
      Anchor: {
        Strategy: 'Registered',
        Key: 'demo.workspace.create-btn',
      },
      Placement: 'bottom',
    },
    {
      StepKey: 'enter-name',
      Sequence: 30,
      StepType: 'Action',
      Title: 'Name Your Workspace',
      Body: 'Focus or type into the workspace name field to advance automatically.',
      Anchor: {
        Strategy: 'Registered',
        Key: 'demo.workspace.name-input',
      },
      Completion: {
        Checks: [{ Type: 'AnchorInteraction', Interaction: 'input' }],
        Match: 'All',
      },
      Placement: 'right',
    },
    {
      StepKey: 'next-step-choice',
      Sequence: 40,
      StepType: 'Choice',
      Title: 'What would you like to explore next?',
      Body: 'Choose a path to finish your quickstart.',
      Configuration: {
        Options: [
          { Key: 'templates', Label: 'Browse Templates', Description: 'Start from a curated template' },
          { Key: 'invite', Label: 'Invite Teammates', Description: 'Collaborate in real time' },
        ],
      },
    },
  ],
};
