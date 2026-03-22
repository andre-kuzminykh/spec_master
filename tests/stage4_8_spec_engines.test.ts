/**
 * Tests for Stages 4-8 — Stories, Flows, Use Cases, Requirements
 *
 * Stage 4 — User Stories:
 *   Per feature: generates "As a/I want/So that" stories, then validates.
 *   LLM: 2 calls per feature (generator + validator)
 *
 * Stage 5 — User Flows:
 *   Per story: generates step-by-step flows with Mermaid, then validates.
 *   LLM: 2 calls per story (generator + validator)
 *
 * Stage 6 — Use Cases:
 *   Per flow: generates atomic Given/When/Then use cases, then validates.
 *   LLM: 2 calls per flow (generator + validator)
 *
 * Stage 7 — Functional Requirements:
 *   Per use case: generates "The system shall..." statements, then validates.
 *   LLM: 2 calls per use case (generator + validator)
 *
 * Stage 8 — Non-Functional Requirements:
 *   Per use case: generates measurable quality attributes, then validates.
 *   LLM: 2 calls per use case (generator + validator)
 */

import { processStories } from '../src/engines/story_engine';
import { processFlows } from '../src/engines/flow_engine';
import { processUseCases } from '../src/engines/use_case_engine';
import { processRequirements } from '../src/engines/requirements_engine';
import { CanonicalProduct } from '../src/schemas/canonical';
import { MockLLMGateway, setupFullPipelineMock } from './mock_llm';

function makeProductWithFeatures(): CanonicalProduct {
  return {
    product_id: 'PROD-test',
    title: 'TestApp',
    summary: 'Test',
    vision: 'Test',
    goals: ['Goal 1'],
    non_goals: [],
    personas: [{ name: 'User', description: 'End user', goals: ['Use app'], pain_points: [] }],
    domain_model: '',
    assumptions: [],
    open_questions: [],
    success_metrics: [],
    release_plan: [],
    features: [
      {
        feature_id: 'FTR-001',
        title: 'Task Board',
        description: 'Kanban-style board',
        business_value: 'Core value',
        user_value: 'Visual management',
        scope: 'Board',
        priority: 'must' as const,
        release_target: 'MVP',
        dependencies: [],
        source_refs: [],
        source_type: 'explicit' as const,
        inferred: false,
        confidence_score: 0.9,
        user_stories: [],
      },
    ],
    source_refs: [],
    source_type: 'explicit' as const,
    inferred: false,
    confidence_score: 0.9,
  };
}

describe('Stage 4 — User Stories', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('generates stories for features without stories', async () => {
    const product = makeProductWithFeatures();
    const result = await processStories(product, '', mockLLM as any, 'test-run');

    expect(result.features[0].user_stories.length).toBeGreaterThan(0);
  });

  test('stories have As a/I want/So that format', async () => {
    const product = makeProductWithFeatures();
    const result = await processStories(product, '', mockLLM as any, 'test-run');

    for (const story of result.features[0].user_stories) {
      expect(story.as_a).toBeTruthy();
      expect(story.i_want).toBeTruthy();
      expect(story.so_that).toBeTruthy();
      expect(story.story_id).toMatch(/^USR-/);
      expect(story.feature_id).toBe('FTR-001');
    }
  });

  test('uses generator + validator pattern (2 LLM calls per feature)', async () => {
    const product = makeProductWithFeatures();
    await processStories(product, '', mockLLM as any, 'test-run');

    const purposes = mockLLM.purposes;
    expect(purposes.some(p => p.includes('Generate user stories'))).toBe(true);
    expect(purposes.some(p => p.includes('Validate stories'))).toBe(true);
  });
});

describe('Stage 5 — User Flows', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('generates flows for stories without flows', async () => {
    const product = makeProductWithFeatures();
    // First generate stories
    const withStories = await processStories(product, '', mockLLM as any, 'test-run');
    mockLLM.reset();

    const result = await processFlows(withStories, mockLLM as any, 'test-run');

    const flows = result.features[0].user_stories[0].user_flows;
    expect(flows.length).toBeGreaterThan(0);
  });

  test('flows have main path and Mermaid diagram', async () => {
    const product = makeProductWithFeatures();
    const withStories = await processStories(product, '', mockLLM as any, 'test-run');
    const result = await processFlows(withStories, mockLLM as any, 'test-run');

    const flow = result.features[0].user_stories[0].user_flows[0];
    expect(flow.flow_id).toMatch(/^FLW-/);
    expect(flow.main_path.length).toBeGreaterThan(0);
    expect(flow.mermaid).toBeTruthy();
    expect(flow.entry_points.length).toBeGreaterThan(0);
    expect(flow.exit_points.length).toBeGreaterThan(0);
  });
});

describe('Stage 6 — Use Cases', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('generates use cases with Given/When/Then', async () => {
    const product = makeProductWithFeatures();
    let result = await processStories(product, '', mockLLM as any, 'test-run');
    result = await processFlows(result, mockLLM as any, 'test-run');
    result = await processUseCases(result, mockLLM as any, 'test-run');

    const uc = result.features[0].user_stories[0].user_flows[0].use_cases[0];
    expect(uc.use_case_id).toMatch(/^UC-/);
    expect(uc.given).toBeTruthy();
    expect(uc.when).toBeTruthy();
    expect(uc.then).toBeTruthy();
    expect(uc.actors.length).toBeGreaterThan(0);
  });
});

describe('Stages 7-8 — Requirements', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('generates FR and NFR for use cases', async () => {
    const product = makeProductWithFeatures();
    let result = await processStories(product, '', mockLLM as any, 'test-run');
    result = await processFlows(result, mockLLM as any, 'test-run');
    result = await processUseCases(result, mockLLM as any, 'test-run');
    result = await processRequirements(result, mockLLM as any, 'test-run');

    const uc = result.features[0].user_stories[0].user_flows[0].use_cases[0];

    // Functional requirements
    expect(uc.functional_requirements.length).toBeGreaterThan(0);
    for (const fr of uc.functional_requirements) {
      expect(fr.requirement_id).toMatch(/^FR-/);
      expect(fr.type).toBe('functional');
      expect(fr.statement).toBeTruthy();
      expect(fr.verification_method).toBeTruthy();
    }

    // Non-functional requirements
    expect(uc.non_functional_requirements.length).toBeGreaterThan(0);
    for (const nfr of uc.non_functional_requirements) {
      expect(nfr.requirement_id).toMatch(/^NFR-/);
      expect(nfr.type).toBe('non_functional');
      expect(nfr.category).toBeTruthy();
      expect(nfr.measurable_criteria).toBeTruthy();
    }
  });

  test('FR generator + validator pattern', async () => {
    const product = makeProductWithFeatures();
    let result = await processStories(product, '', mockLLM as any, 'test-run');
    result = await processFlows(result, mockLLM as any, 'test-run');
    result = await processUseCases(result, mockLLM as any, 'test-run');
    mockLLM.reset();

    await processRequirements(result, mockLLM as any, 'test-run');

    const purposes = mockLLM.purposes;
    expect(purposes.some(p => p.includes('Generate functional requirements'))).toBe(true);
    expect(purposes.some(p => p.includes('Validate functional requirements'))).toBe(true);
    expect(purposes.some(p => p.includes('Generate non-functional requirements'))).toBe(true);
    expect(purposes.some(p => p.includes('Validate non-functional requirements'))).toBe(true);
  });
});
