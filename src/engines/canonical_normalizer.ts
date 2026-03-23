/**
 * Stage 1 — Canonical extraction/normalization.
 *
 * WHAT IT DOES:
 *   Takes the raw markdown + detected structure and extracts ALL product entities
 *   into the canonical JSON schema. This is the critical normalization step —
 *   everything downstream depends on this output.
 *
 *   Uses SMART MULTI-PASS extraction:
 *   - Groups sections by their mapped_to type (from detector)
 *   - Sends only relevant sections to each extraction pass
 *   - Small focused prompts → no output truncation even for huge PRDs
 *
 * LLM CALLS:
 *   - 2-4 calls depending on document content (one per entity group)
 *   - Role: generator
 */

import {
  CanonicalProduct,
  DetectedStructure,
  DetectedSection,
  Feature,
  UserStory,
  Persona,
  SourceRef,
} from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { featureId, storyId, resetCounters } from '../utils/id_generator';

function makeSourceRef(stage: string, runId: string, location: string, originalText?: string): SourceRef {
  return { location, original_text: originalText, stage, run_id: runId };
}

// ─── Section grouping by semantic type ──────────────────────────────────────

interface SectionGroup {
  type: string;
  sections: DetectedSection[];
  content: string;
}

const ENTITY_GROUPS: Record<string, string[]> = {
  metadata: ['vision', 'summary', 'goals', 'non_goals', 'personas', 'domain_model', 'assumptions', 'open_questions', 'success_metrics', 'release_plan'],
  features: ['features', 'user_stories'],
  use_cases: ['use_cases', 'user_flows'],
  requirements: ['functional_requirements', 'non_functional_requirements'],
};

function groupSectionsByType(
  markdown: string,
  sections: DetectedSection[],
): Map<string, SectionGroup> {
  const lines = markdown.split('\n');
  const groups = new Map<string, SectionGroup>();

  // Init all groups
  for (const [groupName] of Object.entries(ENTITY_GROUPS)) {
    groups.set(groupName, { type: groupName, sections: [], content: '' });
  }
  groups.set('unmapped', { type: 'unmapped', sections: [], content: '' });

  for (const section of sections) {
    const mappedTo = section.mapped_to;
    let targetGroup = 'unmapped';

    if (mappedTo) {
      for (const [groupName, fields] of Object.entries(ENTITY_GROUPS)) {
        if (fields.includes(mappedTo)) {
          targetGroup = groupName;
          break;
        }
      }
    }

    groups.get(targetGroup)!.sections.push(section);
  }

  // Extract content for each group
  for (const [, group] of groups) {
    if (group.sections.length === 0) continue;
    const contentParts: string[] = [];
    for (const sec of group.sections) {
      const start = Math.max(0, sec.start_line - 1); // 1-based to 0-based
      const end = sec.end_line;
      contentParts.push(lines.slice(start, end).join('\n'));
    }
    group.content = contentParts.join('\n\n');
  }

  return groups;
}

// ─── Per-group extraction prompts ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are SpecMaster's canonical normalizer. Extract product information FAITHFULLY from the source document into JSON.

RULES:
1. Extract only what exists — do not invent content.
2. source_type "explicit" for verbatim, "derived" for inferred.
3. confidence_score: 1.0 verbatim, 0.8 reformulated, 0.5 derived.
4. Preserve original meaning. Do not embellish.
5. Return empty arrays for absent categories.`;

async function extractMetadata(llm: LLMGateway, content: string, unmappedContent: string): Promise<any> {
  // Include unmapped content as context (titles, intros, etc. often land here)
  const fullContent = content + (unmappedContent ? '\n\n--- Additional context ---\n' + unmappedContent : '');

  return llm.callJSON<any>(
    {
      system: SYSTEM_PROMPT,
      prompt: `Extract product METADATA from these document sections. Return JSON:

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
  "success_metrics": ["string"]
}

SOURCE SECTIONS:
${fullContent}`,
      max_tokens: 8000,
    },
    'Extract product metadata (title, goals, personas, etc.)',
    'generator',
  );
}

async function extractFeatures(llm: LLMGateway, content: string): Promise<any> {
  return llm.callJSON<any>(
    {
      system: SYSTEM_PROMPT,
      prompt: `Extract ALL features and their user stories from these document sections. Return JSON:

{
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
          "confidence_score": 0.0-1.0
        }
      ]
    }
  ]
}

SOURCE SECTIONS:
${content}`,
      max_tokens: 16000,
    },
    'Extract features and user stories',
    'generator',
  );
}

async function extractUseCases(llm: LLMGateway, content: string): Promise<any> {
  return llm.callJSON<any>(
    {
      system: SYSTEM_PROMPT,
      prompt: `Extract ALL use cases from these document sections. Return JSON:

{
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
  ]
}

SOURCE SECTIONS:
${content}`,
      max_tokens: 16000,
    },
    'Extract use cases',
    'generator',
  );
}

async function extractRequirements(llm: LLMGateway, content: string): Promise<any> {
  return llm.callJSON<any>(
    {
      system: SYSTEM_PROMPT,
      prompt: `Extract ALL functional and non-functional requirements from these sections. Return JSON:

{
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

SOURCE SECTIONS:
${content}`,
      max_tokens: 16000,
    },
    'Extract functional and non-functional requirements',
    'generator',
  );
}

// ─── Fallback: single-call extraction for small documents ──────────────────

async function extractAll(llm: LLMGateway, markdown: string, structure: DetectedStructure): Promise<any> {
  return llm.callJSON<any>(
    {
      system: SYSTEM_PROMPT,
      prompt: `Extract the product specification from this document into canonical JSON.

Detected as: ${structure.input_mode} mode.
Sections: ${structure.sections.map(s => `${s.heading} -> ${s.mapped_to || 'unmapped'}`).join(', ')}

Return JSON:
{
  "title": "string", "summary": "string", "vision": "string",
  "goals": ["string"], "non_goals": ["string"],
  "personas": [{"name": "string", "description": "string", "goals": ["string"], "pain_points": ["string"]}],
  "domain_model": "string", "assumptions": ["string"], "open_questions": ["string"], "success_metrics": ["string"],
  "features": [{"title": "string", "description": "string", "business_value": "string", "user_value": "string", "scope": "string", "priority": "must|should|could|wont", "release_target": "string", "dependencies": ["string"], "source_type": "explicit|derived", "confidence_score": 0.0-1.0, "user_stories": [{"title": "string", "as_a": "string", "i_want": "string", "so_that": "string", "acceptance_intent": "string", "actors": ["string"], "preconditions": ["string"], "postconditions": ["string"], "source_type": "explicit|derived", "confidence_score": 0.0-1.0}]}],
  "existing_use_cases": [{"title": "string", "description": "string", "actors": ["string"], "trigger": "string", "preconditions": ["string"], "given": "string", "when": "string", "then": "string", "alternate_cases": ["string"], "error_cases": ["string"], "related_feature": "string", "source_type": "explicit|derived", "confidence_score": 0.0-1.0}],
  "existing_fr": [{"title": "string", "statement": "string", "rationale": "string", "priority": "must|should|could|wont", "verification_method": "string", "related_feature": "string", "source_type": "explicit|derived", "confidence_score": 0.0-1.0}],
  "existing_nfr": [{"title": "string", "category": "string", "statement": "string", "measurable_criteria": "string", "rationale": "string", "priority": "must|should|could|wont", "verification_method": "string", "source_type": "explicit|derived", "confidence_score": 0.0-1.0}]
}

SOURCE DOCUMENT:
${markdown}`,
      max_tokens: 64000,
    },
    'Extract all product entities into canonical JSON',
    'generator',
  );
}

// ─── Build canonical product ───────────────────────────────────────────────

function buildCanonicalProduct(extracted: any, runId: string): CanonicalProduct {
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

  (product as any)._extracted_use_cases = extracted.existing_use_cases || [];
  (product as any)._extracted_fr = extracted.existing_fr || [];
  (product as any)._extracted_nfr = extracted.existing_nfr || [];

  return product;
}

// ─── Main entry point ──────────────────────────────────────────────────────

const SMALL_DOC_THRESHOLD = 50; // sections

export async function normalizeToCanonical(
  markdown: string,
  structure: DetectedStructure,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  llm.setStage('normalize');
  resetCounters();

  // Small docs: single LLM call (fast path)
  if (structure.sections.length <= SMALL_DOC_THRESHOLD) {
    const extracted = await extractAll(llm, markdown, structure);
    return buildCanonicalProduct(extracted, runId);
  }

  // Large docs: smart multi-pass extraction by semantic group
  const groups = groupSectionsByType(markdown, structure.sections);
  const extracted: any = {
    features: [],
    existing_use_cases: [],
    existing_fr: [],
    existing_nfr: [],
  };

  // Pass 1: Metadata (always runs — includes unmapped sections as context)
  const metadataGroup = groups.get('metadata')!;
  const unmappedGroup = groups.get('unmapped')!;
  const metadataContent = metadataGroup.content || unmappedGroup.content;
  if (metadataContent) {
    const meta = await extractMetadata(
      llm,
      metadataGroup.content,
      unmappedGroup.content,
    );
    Object.assign(extracted, meta);
  }

  // Pass 2: Features + Stories (if present)
  const featuresGroup = groups.get('features')!;
  if (featuresGroup.sections.length > 0) {
    const feats = await extractFeatures(llm, featuresGroup.content);
    extracted.features = feats.features || [];
  }

  // Pass 3: Use Cases (if present)
  const useCasesGroup = groups.get('use_cases')!;
  if (useCasesGroup.sections.length > 0) {
    const ucs = await extractUseCases(llm, useCasesGroup.content);
    extracted.existing_use_cases = ucs.existing_use_cases || [];
  }

  // Pass 4: Requirements (if present)
  const reqsGroup = groups.get('requirements')!;
  if (reqsGroup.sections.length > 0) {
    const reqs = await extractRequirements(llm, reqsGroup.content);
    extracted.existing_fr = reqs.existing_fr || [];
    extracted.existing_nfr = reqs.existing_nfr || [];
  }

  return buildCanonicalProduct(extracted, runId);
}
