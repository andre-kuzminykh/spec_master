/**
 * Tests for Stage 3 — Release Planner
 *
 * Stage 3 distributes validated features across release versions.
 * Produces: MVP, v1, v2, future.
 *
 * LLM calls: exactly 1 (planner role)
 */

import { planReleases } from '../src/engines/release_planner';
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
    personas: [],
    domain_model: '',
    assumptions: [],
    open_questions: [],
    success_metrics: [],
    release_plan: [],
    features: [
      {
        feature_id: 'FTR-001',
        title: 'Core Feature',
        description: 'Main feature',
        business_value: 'High',
        user_value: 'High',
        scope: '',
        priority: 'must',
        release_target: '',
        dependencies: [],
        source_refs: [],
        source_type: 'explicit',
        inferred: false,
        confidence_score: 0.9,
        user_stories: [],
      },
      {
        feature_id: 'FTR-002',
        title: 'Secondary Feature',
        description: 'Nice to have',
        business_value: 'Medium',
        user_value: 'Medium',
        scope: '',
        priority: 'should',
        release_target: '',
        dependencies: ['FTR-001'],
        source_refs: [],
        source_type: 'explicit',
        inferred: false,
        confidence_score: 0.8,
        user_stories: [],
      },
    ],
    source_refs: [],
    source_type: 'explicit',
    inferred: false,
    confidence_score: 0.9,
  };
}

describe('Stage 3 — Release Planner', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('creates release plan with versions', async () => {
    const product = makeProductWithFeatures();
    const result = await planReleases(product, mockLLM as any, 'test-run');

    expect(result.release_plan.length).toBeGreaterThan(0);
    expect(result.release_plan.some(r => r.version === 'MVP')).toBe(true);
  });

  test('assigns features to releases', async () => {
    const product = makeProductWithFeatures();
    const result = await planReleases(product, mockLLM as any, 'test-run');

    // At least one feature should have a release_target set
    const assignedFeatures = result.features.filter(f => f.release_target);
    expect(assignedFeatures.length).toBeGreaterThan(0);
  });

  test('makes exactly 1 LLM call with planner role', async () => {
    const product = makeProductWithFeatures();
    await planReleases(product, mockLLM as any, 'test-run');

    const plannerCalls = mockLLM.callsForRole('planner');
    expect(plannerCalls.length).toBe(1);
    expect(plannerCalls[0].purpose).toContain('Distribute features');
  });

  test('each release version has description and rationale', async () => {
    const product = makeProductWithFeatures();
    const result = await planReleases(product, mockLLM as any, 'test-run');

    for (const release of result.release_plan) {
      expect(release.version).toBeTruthy();
      expect(release.description).toBeTruthy();
      expect(release.rationale).toBeTruthy();
      expect(release.feature_ids.length).toBeGreaterThan(0);
    }
  });
});
