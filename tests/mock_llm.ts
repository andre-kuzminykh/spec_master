/**
 * Mock LLM Gateway for testing.
 *
 * Records all calls and returns pre-configured responses.
 * Allows tests to verify:
 *   - Which LLM calls were made
 *   - What purpose/role was specified
 *   - What prompts were sent
 *   - That responses are correctly parsed
 */

import { LLMGateway, LLMGatewayConfig, LLMRequest, LLMResponse } from '../src/utils/llm_gateway';
import { Logger, createLogger } from '../src/utils/logger';

export interface MockCall {
  purpose: string;
  role: string;
  system: string;
  prompt: string;
  response: any;
}

/**
 * Creates a mock LLM gateway that returns predefined JSON responses.
 * Responses are matched by checking if the purpose string contains a keyword.
 */
export class MockLLMGateway extends LLMGateway {
  public calls: MockCall[] = [];
  private responses: Map<string, any> = new Map();
  private defaultResponse: any = {};

  constructor() {
    // Use a dummy config — we override all methods
    const config: LLMGatewayConfig = {
      provider: 'mock',
      model: 'mock-model',
      mode: 'balanced',
    };
    const logger = createLogger('info');
    super(config, logger);
  }

  /** Register a response for a purpose keyword match */
  onPurpose(keyword: string, response: any): MockLLMGateway {
    this.responses.set(keyword.toLowerCase(), response);
    return this;
  }

  /** Set default response when no keyword matches */
  setDefault(response: any): MockLLMGateway {
    this.defaultResponse = response;
    return this;
  }

  override setStage(stage: string): void {
    this._currentStage = stage;
  }

  override async call(request: LLMRequest, purpose: string = '', role: string = 'generator'): Promise<LLMResponse> {
    const response = this.findResponse(purpose);
    this.calls.push({
      purpose,
      role,
      system: request.system,
      prompt: request.prompt,
      response,
    });
    return {
      content: JSON.stringify(response),
      usage: { input_tokens: 100, output_tokens: 50 },
    };
  }

  override async callJSON<T>(request: LLMRequest, purpose: string = '', role: string = 'generator'): Promise<T> {
    const response = this.findResponse(purpose);
    this.calls.push({
      purpose,
      role,
      system: request.system,
      prompt: request.prompt,
      response,
    });
    return response as T;
  }

  private findResponse(purpose: string): any {
    const purposeLower = purpose.toLowerCase();
    for (const [keyword, response] of this.responses) {
      if (purposeLower.includes(keyword)) {
        return response;
      }
    }
    return this.defaultResponse;
  }

  /** Get all calls for a specific role */
  callsForRole(role: string): MockCall[] {
    return this.calls.filter(c => c.role === role);
  }

  /** Get all calls for a specific stage */
  callsForStage(stage: string): MockCall[] {
    // We can't filter by stage since we just store purpose,
    // but we can check purpose patterns
    return this.calls;
  }

  /** Get all purposes that were called */
  get purposes(): string[] {
    return this.calls.map(c => c.purpose);
  }

  /** Reset all recorded calls */
  reset(): void {
    this.calls = [];
  }
}

/**
 * Sample test data: a minimal structured PRD
 */
export const SAMPLE_STRUCTURED_MD = `# Product Requirements Document

## Product Name
TaskFlow

## Product Summary
TaskFlow is a task management app for small teams.

## Vision
Simple, fast task management that gets out of your way.

## Goals
- Help teams organize work
- Reduce time spent on status updates
- Integrate with existing tools

## Non-Goals
- Enterprise-grade permissions
- Gantt charts
- Time tracking

## Personas
### Team Lead
Manages a team of 5-10 developers. Wants quick visibility into progress.

### Developer
Writes code daily. Wants minimal overhead for task updates.

## Features
### Task Board
Kanban-style board with columns for Todo, In Progress, Done.

### Notifications
Real-time notifications when tasks are assigned or completed.

### Integrations
Connect with Slack and GitHub for automatic updates.

## Release Plan
### MVP
- Task Board
- Basic notifications

### v2
- Integrations
- Advanced filters
`;

/**
 * Sample test data: a raw idea (no structure)
 */
export const SAMPLE_RAW_IDEA_MD = `# My App Idea

I want to build an app that helps people track their reading habits.
Users should be able to log books they're reading, set reading goals,
and see their progress over time. Maybe social features later so
people can share recommendations.

The app should be mobile-first but also work on desktop.
It should be fast and simple — no clutter.
`;

/**
 * Pre-built mock responses for a full pipeline run
 */
export function setupFullPipelineMock(): MockLLMGateway {
  const mock = new MockLLMGateway();

  // Stage 0 — detect structure
  mock.onPurpose('determine', { mode: 'mixed' });

  // Stage 1 — normalize
  mock.onPurpose('extract all', {
    title: 'TaskFlow',
    summary: 'Task management app for small teams',
    vision: 'Simple, fast task management',
    goals: ['Help teams organize work', 'Reduce status update overhead'],
    non_goals: ['Enterprise permissions', 'Gantt charts'],
    personas: [
      { name: 'Team Lead', description: 'Manages 5-10 devs', goals: ['Track progress'], pain_points: ['Too many tools'] },
      { name: 'Developer', description: 'Writes code daily', goals: ['Minimal overhead'], pain_points: ['Context switching'] },
    ],
    domain_model: 'Tasks, Boards, Users, Notifications',
    assumptions: ['Teams are small (under 15 people)'],
    open_questions: ['Should we support custom columns?'],
    success_metrics: ['DAU > 100 in first month'],
    features: [
      {
        title: 'Task Board',
        description: 'Kanban-style board with columns',
        business_value: 'Core product value',
        user_value: 'Visual task management',
        scope: 'Board CRUD, drag-and-drop, column management',
        priority: 'must',
        release_target: 'MVP',
        dependencies: [],
        source_type: 'explicit',
        confidence_score: 1.0,
        user_stories: [],
      },
      {
        title: 'Notifications',
        description: 'Real-time notifications for task events',
        business_value: 'Keeps team in sync',
        user_value: 'Never miss updates',
        scope: 'Push + in-app notifications',
        priority: 'should',
        release_target: 'MVP',
        dependencies: ['Task Board'],
        source_type: 'explicit',
        confidence_score: 0.9,
        user_stories: [],
      },
    ],
    existing_use_cases: [],
    existing_fr: [],
    existing_nfr: [],
  });

  // Stage 2 — features
  mock.onPurpose('generate features', [
    {
      title: 'Task Board',
      description: 'Kanban board',
      business_value: 'Core value',
      user_value: 'Visual management',
      scope: 'Board',
      priority: 'must',
      dependencies: [],
    },
  ]);

  mock.onPurpose('validate feature', {
    valid_features: ['FTR-001', 'FTR-002'],
    issues: [],
    suggested_splits: [],
    suggested_merges: [],
  });

  // Stage 3 — releases
  mock.onPurpose('distribute features', {
    versions: [
      { version: 'MVP', description: 'Core task management', feature_ids: ['FTR-001'], rationale: 'Must-have for launch' },
      { version: 'v1', description: 'Communication features', feature_ids: ['FTR-002'], rationale: 'Improves team sync' },
    ],
  });

  // Stage 4 — stories
  mock.onPurpose('generate user stories', [
    {
      title: 'View task board',
      as_a: 'Team Lead',
      i_want: 'to see all tasks on a kanban board',
      so_that: 'I can track team progress at a glance',
      acceptance_intent: 'Board shows all tasks in correct columns',
      actors: ['Team Lead'],
      preconditions: ['User is logged in'],
      postconditions: ['Board is displayed'],
    },
    {
      title: 'Move task between columns',
      as_a: 'Developer',
      i_want: 'to drag a task from one column to another',
      so_that: 'I can update task status quickly',
      acceptance_intent: 'Task moves to new column, status updates',
      actors: ['Developer'],
      preconditions: ['Board is visible', 'Task exists'],
      postconditions: ['Task status is updated'],
    },
  ]);

  mock.onPurpose('validate stories', {
    valid_story_ids: ['USR-001-001', 'USR-001-002'],
    issues: [],
    duplicates: [],
  });

  // Stage 5 — flows
  mock.onPurpose('generate user flows', [
    {
      title: 'View board flow',
      description: 'User navigates to board and sees tasks',
      main_path: ['Open app', 'Navigate to board', 'View tasks by column'],
      alternate_paths: [['Filter by assignee', 'View filtered tasks']],
      error_paths: [['Board fails to load', 'Show error message', 'Retry']],
      entry_points: ['Dashboard', 'Direct URL'],
      exit_points: ['Board displayed'],
      mermaid: 'flowchart TD\n    A[Open App] --> B[Navigate to Board]\n    B --> C[View Tasks]',
    },
  ]);

  mock.onPurpose('validate flows', {
    valid_flow_ids: ['FLW-001-001-001'],
    issues: [],
  });

  // Stage 6 — use cases
  mock.onPurpose('generate atomic use cases', [
    {
      title: 'Display task board',
      description: 'System displays the kanban board with all tasks',
      actors: ['Team Lead'],
      trigger: 'User navigates to board page',
      preconditions: ['User is authenticated', 'Board exists'],
      given: 'the user is logged in and has access to the board',
      when: 'the user navigates to the board page',
      then: 'the system displays all tasks organized by column status',
      alternate_cases: ['Board is empty — show onboarding message'],
      error_cases: ['API failure — show cached data with warning'],
    },
  ]);

  mock.onPurpose('validate use case', {
    valid_ids: ['UC-001-001-001-001'],
    issues: [],
  });

  // Stage 7 — FR
  mock.onPurpose('generate functional requirements', [
    {
      title: 'Load task board data',
      statement: 'The system shall load and display all tasks for the current board within 2 seconds',
      rationale: 'Users expect fast board loading',
      priority: 'must',
      verification_method: 'test',
    },
    {
      title: 'Group tasks by status',
      statement: 'The system shall group tasks into columns matching their current status',
      rationale: 'Kanban visualization requires status-based columns',
      priority: 'must',
      verification_method: 'test',
    },
  ]);

  mock.onPurpose('validate functional requirements', {
    valid_ids: ['FR-001-001-001-001-001', 'FR-001-001-001-001-002'],
    issues: [],
  });

  // Stage 8 — NFR
  mock.onPurpose('generate non-functional requirements', [
    {
      category: 'performance',
      title: 'Board load time',
      statement: 'The board shall load within 2 seconds for boards with up to 500 tasks',
      measurable_criteria: 'p95 latency < 2000ms',
      rationale: 'Responsive UI is critical for daily use',
      priority: 'must',
      verification_method: 'test',
    },
    {
      category: 'usability',
      title: 'Drag and drop responsiveness',
      statement: 'Drag and drop interactions shall have < 100ms visual feedback',
      measurable_criteria: 'Frame rate > 30fps during drag operations',
      rationale: 'Smooth interactions prevent user frustration',
      priority: 'should',
      verification_method: 'test',
    },
  ]);

  mock.onPurpose('validate non-functional requirements', {
    valid_ids: ['NFR-001-001-001-001-001', 'NFR-001-001-001-001-002'],
    issues: [],
  });

  // Stage 9 — cross-validation
  mock.onPurpose('semantic consistency', {
    semantic_issues: [],
    additional_assumptions: ['Small teams assumed (< 15 members)'],
    additional_questions: ['What happens when a team grows beyond 15?'],
  });

  return mock;
}
