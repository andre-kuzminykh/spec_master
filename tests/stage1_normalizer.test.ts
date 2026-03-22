/**
 * Tests for Stage 1 — Canonical Normalization
 *
 * Stage 1 takes raw markdown + detected structure and extracts ALL entities
 * into the canonical JSON schema. This is the critical step — everything downstream
 * depends on this output.
 *
 * LLM calls: exactly 1 (generator — "Extract all entities into canonical JSON")
 */

import { detectStructure } from '../src/engines/structure_detector';
import { normalizeToCanonical } from '../src/engines/canonical_normalizer';
import { MockLLMGateway, SAMPLE_STRUCTURED_MD, setupFullPipelineMock } from './mock_llm';

describe('Stage 1 — Canonical Normalization', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = setupFullPipelineMock();
  });

  test('produces valid canonical product from structured input', async () => {
    const structure = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');
    const product = await normalizeToCanonical(SAMPLE_STRUCTURED_MD, structure, mockLLM as any, 'test-run');

    expect(product.product_id).toMatch(/^PROD-/);
    expect(product.title).toBe('TaskFlow');
    expect(product.summary).toBeTruthy();
    expect(product.vision).toBeTruthy();
    expect(product.goals.length).toBeGreaterThan(0);
    expect(product.personas.length).toBeGreaterThan(0);
    expect(product.features.length).toBeGreaterThan(0);
  });

  test('assigns unique IDs to features and stories', async () => {
    const structure = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');
    const product = await normalizeToCanonical(SAMPLE_STRUCTURED_MD, structure, mockLLM as any, 'test-run');

    const featureIds = product.features.map(f => f.feature_id);
    expect(new Set(featureIds).size).toBe(featureIds.length); // all unique

    for (const f of product.features) {
      expect(f.feature_id).toMatch(/^FTR-\d{3}$/);
    }
  });

  test('preserves source_type and confidence_score from extraction', async () => {
    const structure = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');
    const product = await normalizeToCanonical(SAMPLE_STRUCTURED_MD, structure, mockLLM as any, 'test-run');

    const explicitFeature = product.features.find(f => f.source_type === 'explicit');
    expect(explicitFeature).toBeDefined();
    expect(explicitFeature!.inferred).toBe(false);
    expect(explicitFeature!.confidence_score).toBeGreaterThanOrEqual(0.8);
  });

  test('makes exactly 1 LLM call for extraction', async () => {
    const structure = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');
    mockLLM.reset(); // Reset to count only normalization calls

    await normalizeToCanonical(SAMPLE_STRUCTURED_MD, structure, mockLLM as any, 'test-run');

    expect(mockLLM.calls.length).toBe(1);
    expect(mockLLM.calls[0].purpose).toContain('Extract all');
    expect(mockLLM.calls[0].role).toBe('generator');
  });

  test('includes source_refs on all entities', async () => {
    const structure = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');
    const product = await normalizeToCanonical(SAMPLE_STRUCTURED_MD, structure, mockLLM as any, 'test-run');

    expect(product.source_refs.length).toBeGreaterThan(0);
    expect(product.source_refs[0].stage).toBe('normalize');
    expect(product.source_refs[0].run_id).toBe('test-run');

    for (const f of product.features) {
      expect(f.source_refs.length).toBeGreaterThan(0);
    }
  });
});
