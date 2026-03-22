/**
 * Stage 1 — Canonical extraction/normalization.
 * Extracts all entities from input and rewrites them into canonical JSON.
 * Works for raw, structured, and mixed inputs.
 */

import {
  CanonicalProduct,
  DetectedStructure,
  Feature,
  UserStory,
  UserFlow,
  UseCase,
  FunctionalRequirement,
  NonFunctionalRequirement,
  Persona,
  SourceRef,
} from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { featureId, storyId, flowId, useCaseId, frId, nfrId, resetCounters } from '../utils/id_generator';

function makeSourceRef(stage: string, runId: string, location: string, originalText?: string): SourceRef {
  return { location, original_text: originalText, stage, run_id: runId };
}

export async function normalizeToCanonical(
  markdown: string,
  structure: DetectedStructure,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  resetCounters();

  const systemPrompt = `You are SpecMaster's canonical normalizer. Your job is to extract ALL product information from a source document and rewrite it into a canonical JSON structure.

RULES:
1. Extract everything that exists in the document - do not invent new content.
2. For each extracted element, set source_type to "explicit" and inferred to false.
3. If you logically derive something from explicit content, set source_type to "derived" and inferred to true.
4. Set confidence_score: 1.0 for verbatim extractions, 0.8 for reformulated content, 0.5 for derived content.
5. Preserve the original meaning - do not embellish or change intent.
6. If features/stories/use cases exist in the document, extract them faithfully.
7. Leave arrays empty if the document has no content for that level - do NOT generate placeholder content.`;

  const extractionPrompt = `Extract the product specification from this document into canonical JSON format.

The document was detected as: ${structure.input_mode} mode.
Detected sections: ${structure.sections.map(s => `${s.heading} -> ${s.mapped_to || 'unmapped'}`).join(', ')}

Return a JSON object matching this structure exactly:
{
  "title": "string",
  "summary": "string",
  "vision": "string",
  "goals": ["string"],
  "non_goals": ["string"],
  "personas": [{"name": "string", "description": "string", "goals": ["string"], "pain_points": ["string"]}],
  "domain_model": "string",
  "assumptions": ["string"],
  "open_questions": ["string"],
  "success_metrics": ["string"],
  "features": [
    {
      "title": "string",
      "description": "string",
      "business_value": "string",
      "user_value": "string",
      "scope": "string",
      "priority": "must|should|could|wont",
      "release_target": "string",
      "dependencies": ["string"],
      "source_type": "explicit|derived",
      "confidence_score": 0.0-1.0,
      "user_stories": [
        {
          "title": "string",
          "as_a": "string",
          "i_want": "string",
          "so_that": "string",
          "acceptance_intent": "string",
          "actors": ["string"],
          "preconditions": ["string"],
          "postconditions": ["string"],
          "source_type": "explicit|derived",
          "confidence_score": 0.0-1.0,
          "user_flows": [],
          "use_cases": []
        }
      ]
    }
  ],
  "existing_use_cases": [
    {
      "title": "string",
      "description": "string",
      "actors": ["string"],
      "trigger": "string",
      "preconditions": ["string"],
      "given": "string",
      "when": "string",
      "then": "string",
      "alternate_cases": ["string"],
      "error_cases": ["string"],
      "related_feature": "string",
      "source_type": "explicit|derived",
      "confidence_score": 0.0-1.0
    }
  ],
  "existing_fr": [
    {
      "title": "string",
      "statement": "string",
      "rationale": "string",
      "priority": "must|should|could|wont",
      "verification_method": "string",
      "related_feature": "string",
      "source_type": "explicit|derived",
      "confidence_score": 0.0-1.0
    }
  ],
  "existing_nfr": [
    {
      "title": "string",
      "category": "string",
      "statement": "string",
      "measurable_criteria": "string",
      "rationale": "string",
      "priority": "must|should|could|wont",
      "verification_method": "string",
      "source_type": "explicit|derived",
      "confidence_score": 0.0-1.0
    }
  ]
}

If the document doesn't contain user_stories, use_cases, fr, or nfr, return empty arrays for those.
If features are not explicitly listed but can be derived from the text, extract them with source_type "derived".

SOURCE DOCUMENT:
${markdown}`;

  const extracted = await llm.callJSON<any>({
    system: systemPrompt,
    prompt: extractionPrompt,
    max_tokens: 16000,
  });

  // Build canonical product with proper IDs
  const features: Feature[] = (extracted.features || []).map((f: any) => {
    const fId = featureId();
    const stories: UserStory[] = (f.user_stories || []).map((s: any) => {
      const sId = storyId(fId);
      return {
        story_id: sId,
        feature_id: fId,
        title: s.title || '',
        as_a: s.as_a || '',
        i_want: s.i_want || '',
        so_that: s.so_that || '',
        acceptance_intent: s.acceptance_intent || '',
        actors: s.actors || [],
        preconditions: s.preconditions || [],
        postconditions: s.postconditions || [],
        source_refs: [makeSourceRef('normalize', runId, 'extraction', s.title)],
        source_type: s.source_type || 'explicit',
        inferred: s.source_type === 'derived',
        confidence_score: s.confidence_score ?? 0.8,
        user_flows: [],
      } as UserStory;
    });

    return {
      feature_id: fId,
      title: f.title || '',
      description: f.description || '',
      business_value: f.business_value || '',
      user_value: f.user_value || '',
      scope: f.scope || '',
      priority: f.priority || 'should',
      release_target: f.release_target || '',
      dependencies: f.dependencies || [],
      source_refs: [makeSourceRef('normalize', runId, 'extraction', f.title)],
      source_type: f.source_type || 'explicit',
      inferred: f.source_type === 'derived',
      confidence_score: f.confidence_score ?? 0.8,
      user_stories: stories,
    } as Feature;
  });

  const product: CanonicalProduct = {
    product_id: `PROD-${runId.substring(0, 8)}`,
    title: extracted.title || 'Untitled Product',
    summary: extracted.summary || '',
    vision: extracted.vision || '',
    goals: extracted.goals || [],
    non_goals: extracted.non_goals || [],
    personas: (extracted.personas || []).map((p: any) => ({
      name: p.name || '',
      description: p.description || '',
      goals: p.goals || [],
      pain_points: p.pain_points || [],
    } as Persona)),
    domain_model: extracted.domain_model || '',
    assumptions: extracted.assumptions || [],
    open_questions: extracted.open_questions || [],
    success_metrics: extracted.success_metrics || [],
    release_plan: [],
    features,
    source_refs: [makeSourceRef('normalize', runId, 'full document')],
    source_type: 'explicit',
    inferred: false,
    confidence_score: 0.9,
  };

  // Store extracted but unlinked entities for later stages
  (product as any)._extracted_use_cases = extracted.existing_use_cases || [];
  (product as any)._extracted_fr = extracted.existing_fr || [];
  (product as any)._extracted_nfr = extracted.existing_nfr || [];

  return product;
}
