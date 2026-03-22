/**
 * Tests for Stage 2 — Feature Engine
 *
 * Stage 2 validates existing features or generates new ones.
 * Uses Generator + Validator pattern (two LLM passes).
 *
 * LLM calls:
 *   - With existing features:  1 call (validator only)
 *   - Without features:        2 calls (generator + validator)
 */

import { processFeatures } from '../src/engines/feature_engine';
import { CanonicalProduct } from '../src/schemas/canonical';
import { MockLLMGateway, setupFullPipelineMock } from './mock_llm';

function makeProduct(features: any[] = []): CanonicalProduct {
  return {
    product_id: 'PROD-test',
    title: 'TestApp',
    summary: 'A test application',
    vision: 'Test vision',
    goals: ['Goal 1', 'Goal 2'],
    non_goals: [],
    personas: [],
    domain_model: '',
    assumptions: [],
    open_questions: [],
    success_metrics: [],
    release_plan: [],
    features,
    source_refs: [],
    source_type: 'explicit',
    inferred: false,
    confidence_score: 0.9,
  };
}

describe('Stage 2 — Feature Engine', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('generates features when none exist (generator + validator = 2 LLM calls)', async () => {
    const product = makeProduct([]);

    const result = await processFeatures(product, '# TestApp\nA test app', mockLLM as any, 'test-run');

    expect(result.features.length).toBeGreaterThan(0);

    // Should have called generator then validator
    const purposes = mockLLM.purposes;
    expect(purposes.some(p => p.toLowerCase().includes('generate features'))).toBe(true);
    expect(purposes.some(p => p.toLowerCase().includes('validate feature'))).toBe(true);
  });

  test('validates existing features without regenerating (1 LLM call)', async () => {
    const product = makeProduct([
      {
        feature_id: 'FTR-001',
        title: 'Existing Feature',
        description: 'Already exists',
        business_value: 'High',
        user_value: 'High',
        scope: 'Full',
        priority: 'must',
        release_target: 'MVP',
        dependencies: [],
        source_refs: [],
        source_type: 'explicit',
        inferred: false,
        confidence_score: 0.9,
        user_stories: [],
      },
    ]);

    const result = await processFeatures(product, '', mockLLM as any, 'test-run');

    // Should only call validator, not generator
    expect(result.features.length).toBeGreaterThanOrEqual(1);

    const purposes = mockLLM.purposes;
    expect(purposes.some(p => p.toLowerCase().includes('generate features'))).toBe(false);
    expect(purposes.some(p => p.toLowerCase().includes('validate feature'))).toBe(true);
  });

  test('generated features have proper IDs and metadata', async () => {
    const product = makeProduct([]);
    const result = await processFeatures(product, '# App', mockLLM as any, 'test-run');

    for (const f of result.features) {
      expect(f.feature_id).toMatch(/^FTR-\d{3}$/);
      expect(f.source_type).toBe('derived');
      expect(f.inferred).toBe(true);
      expect(f.confidence_score).toBeLessThanOrEqual(1.0);
      expect(f.confidence_score).toBeGreaterThan(0);
    }
  });

  test('validator role is used for validation calls', async () => {
    const product = makeProduct([
      {
        feature_id: 'FTR-001',
        title: 'Feature',
        description: 'Desc',
        business_value: '',
        user_value: '',
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
    ]);

    await processFeatures(product, '', mockLLM as any, 'test-run');

    const validatorCalls = mockLLM.callsForRole('validator');
    expect(validatorCalls.length).toBeGreaterThan(0);
  });
});
