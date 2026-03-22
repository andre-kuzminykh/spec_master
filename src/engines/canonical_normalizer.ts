/**
 * Stage 1 — Canonical extraction/normalization.
 *
 * WHAT IT DOES:
 *   Takes the raw markdown + detected structure and extracts ALL product entities
 *   into the canonical JSON schema. This is the critical normalization step —
 *   everything downstream depends on this output.
 *
 *   For structured input: extracts existing features, stories, use cases, FR/NFR
 *   faithfully and marks them as source_type "explicit".
 *
 *   For raw input: derives product structure from unstructured text, marking
 *   everything as source_type "derived".
 *
 * LLM CALLS:
 *   - 1+ calls — Role: generator — "Extract all product entities into canonical JSON"
 *   For large documents (>50 sections), splits into chunks and merges results.
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

const CHUNK_SECTION_THRESHOLD = 50;

function makeSourceRef(stage: string, runId: string, location: string, originalText?: string): SourceRef {
  return { location, original_text: originalText, stage, run_id: runId };
}

const SYSTEM_PROMPT = `You are SpecMaster's canonical normalizer. Your job is to extract ALL product information from a source document and rewrite it into a canonical JSON structure.

RULES:
1. Extract everything that exists in the document - do not invent new content.
2. For each extracted element, set source_type to "explicit" and inferred to false.
3. If you logically derive something from explicit content, set source_type to "derived" and inferred to true.
4. Set confidence_score: 1.0 for verbatim extractions, 0.8 for reformulated content, 0.5 for derived content.
5. Preserve the original meaning - do not embellish or change intent.
6. If features/stories/use cases exist in the document, extract them faithfully.
7. Leave arrays empty if the document has no content for that level - do NOT generate placeholder content.`;

const JSON_SCHEMA = `{
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
}`;

function splitMarkdownByLines(markdown: string, sections: DetectedSection[]): string[] {
  const lines = markdown.split('\n');
  const chunks: string[] = [];
  const chunkSize = CHUNK_SECTION_THRESHOLD;

  for (let i = 0; i < sections.length; i += chunkSize) {
    const chunkSections = sections.slice(i, i + chunkSize);
    const startLine = chunkSections[0].start_line;
    const endLine = i + chunkSize < sections.length
      ? sections[i + chunkSize].start_line - 1
      : lines.length;
    chunks.push(lines.slice(startLine, endLine).join('\n'));
  }

  return chunks;
}

function mergeExtracted(parts: any[]): any {
  const merged: any = {
    title: '',
    summary: '',
    vision: '',
    goals: [],
    non_goals: [],
    personas: [],
    domain_model: '',
    assumptions: [],
    open_questions: [],
    success_metrics: [],
    features: [],
    existing_use_cases: [],
    existing_fr: [],
    existing_nfr: [],
  };

  for (const part of parts) {
    // Scalar fields: take first non-empty
    if (!merged.title && part.title) merged.title = part.title;
    if (!merged.summary && part.summary) merged.summary = part.summary;
    if (!merged.vision && part.vision) merged.vision = part.vision;
    if (!merged.domain_model && part.domain_model) merged.domain_model = part.domain_model;

    // Array fields: concatenate
    merged.goals.push(...(part.goals || []));
    merged.non_goals.push(...(part.non_goals || []));
    merged.personas.push(...(part.personas || []));
    merged.assumptions.push(...(part.assumptions || []));
    merged.open_questions.push(...(part.open_questions || []));
    merged.success_metrics.push(...(part.success_metrics || []));
    merged.features.push(...(part.features || []));
    merged.existing_use_cases.push(...(part.existing_use_cases || []));
    merged.existing_fr.push(...(part.existing_fr || []));
    merged.existing_nfr.push(...(part.existing_nfr || []));
  }

  return merged;
}

async function extractChunk(
  llm: LLMGateway,
  markdownChunk: string,
  structure: DetectedStructure,
  chunkIndex: number,
  totalChunks: number,
): Promise<any> {
  const chunkContext = totalChunks > 1
    ? `\n\nNOTE: This is chunk ${chunkIndex + 1} of ${totalChunks} from a large document. Extract only what appears in this chunk. Do not invent content that is not present.`
    : '';

  const extractionPrompt = `Extract the product specification from this document into canonical JSON format.

The document was detected as: ${structure.input_mode} mode.
${totalChunks === 1 ? `Detected sections: ${structure.sections.map(s => `${s.heading} -> ${s.mapped_to || 'unmapped'}`).join(', ')}` : ''}

Return a JSON object matching this structure exactly:
${JSON_SCHEMA}

If the document doesn't contain user_stories, use_cases, fr, or nfr, return empty arrays for those.
If features are not explicitly listed but can be derived from the text, extract them with source_type "derived".
${chunkContext}

SOURCE DOCUMENT:
${markdownChunk}`;

  return llm.callJSON<any>(
    { system: SYSTEM_PROMPT, prompt: extractionPrompt, max_tokens: 64000 },
    totalChunks > 1
      ? `Extract product entities (chunk ${chunkIndex + 1}/${totalChunks})`
      : 'Extract all product entities into canonical JSON',
    'generator',
  );
}

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

export async function normalizeToCanonical(
  markdown: string,
  structure: DetectedStructure,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  llm.setStage('normalize');
  resetCounters();

  const needsChunking = structure.sections.length > CHUNK_SECTION_THRESHOLD;

  let extracted: any;

  if (!needsChunking) {
    extracted = await extractChunk(llm, markdown, structure, 0, 1);
  } else {
    const chunks = splitMarkdownByLines(markdown, structure.sections);
    const parts: any[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await extractChunk(llm, chunks[i], structure, i, chunks.length);
      parts.push(part);
    }
    extracted = mergeExtracted(parts);
  }

  return buildCanonicalProduct(extracted, runId);
}
