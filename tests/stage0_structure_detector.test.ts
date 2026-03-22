/**
 * Tests for Stage 0 — Structure Detection
 *
 * Stage 0 reads the input markdown and determines:
 *   - Input mode: "raw" | "structured" | "mixed"
 *   - Which sections exist (features, stories, use cases, etc.)
 *   - How headings map to canonical fields
 *
 * LLM calls: 0-1 (only for ambiguous documents)
 */

import { detectStructure } from '../src/engines/structure_detector';
import { MockLLMGateway, SAMPLE_STRUCTURED_MD, SAMPLE_RAW_IDEA_MD } from './mock_llm';

describe('Stage 0 — Structure Detection', () => {
  let mockLLM: MockLLMGateway;

  beforeEach(() => {
    mockLLM = new MockLLMGateway();
    mockLLM.onPurpose('determine', { mode: 'structured' });
  });

  test('detects structured PRD correctly', async () => {
    const result = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');

    expect(result.input_mode).toBe('mixed'); // has features + release plan = mixed (not 3 structured sections)
    expect(result.has_features).toBe(true);
    expect(result.has_release_plan).toBe(true);
    expect(result.has_goals).toBe(true);
    expect(result.has_personas).toBe(true);
    expect(result.sections.length).toBeGreaterThan(5);

    // Check section mapping
    const featureSection = result.sections.find(s => s.mapped_to === 'features');
    expect(featureSection).toBeDefined();
    expect(featureSection!.heading).toContain('Features');
  });

  test('detects raw idea correctly', async () => {
    const result = await detectStructure(SAMPLE_RAW_IDEA_MD, mockLLM as any, 'test-run');

    expect(result.input_mode).toBe('raw');
    expect(result.has_features).toBe(false);
    expect(result.has_user_stories).toBe(false);
    expect(result.has_use_cases).toBe(false);
    expect(result.has_functional_requirements).toBe(false);
  });

  test('maps standard headings to canonical fields', async () => {
    const md = `# Product
## Vision
Build something great
## Goals
- Goal 1
## Non-Goals
- Not this
## Features
### Feature 1
Description
## User Stories
### Story 1
As a user...
## Use Cases
### UC1
Given/When/Then
## Functional Requirements
- FR1
## Non-Functional Requirements
- NFR1
`;
    const result = await detectStructure(md, mockLLM as any, 'test-run');

    expect(result.has_features).toBe(true);
    expect(result.has_user_stories).toBe(true);
    expect(result.has_use_cases).toBe(true);
    expect(result.has_functional_requirements).toBe(true);
    expect(result.has_non_functional_requirements).toBe(true);
    expect(result.input_mode).toBe('structured');
  });

  test('handles numbered headings (e.g. "1. Vision")', async () => {
    const md = `# Product
## 1. Vision
Great product
## 2. Goals
- Goal 1
## 3. Features
### 3.1 Feature A
Description
`;
    const result = await detectStructure(md, mockLLM as any, 'test-run');

    const visionSection = result.sections.find(s => s.mapped_to === 'vision');
    expect(visionSection).toBeDefined();

    const featuresSection = result.sections.find(s => s.mapped_to === 'features');
    expect(featuresSection).toBeDefined();
  });

  test('makes 0 LLM calls for clearly structured documents', async () => {
    const md = `# Product
## Features
### F1
## User Stories
### S1
## Use Cases
### UC1
## Functional Requirements
### FR1
`;
    await detectStructure(md, mockLLM as any, 'test-run');

    // Should not need LLM since structure is clearly >= 3 spec levels
    expect(mockLLM.calls.length).toBe(0);
  });

  test('preserves section line numbers', async () => {
    const result = await detectStructure(SAMPLE_STRUCTURED_MD, mockLLM as any, 'test-run');

    for (const section of result.sections) {
      expect(section.start_line).toBeGreaterThan(0);
      expect(section.end_line).toBeGreaterThanOrEqual(section.start_line);
    }
  });
});
