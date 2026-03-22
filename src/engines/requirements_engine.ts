/**
 * Stages 7 & 8 — Functional and Non-Functional Requirements.
 *
 * WHAT IT DOES:
 *   For each validated use case, generates or validates requirements.
 *
 *   Stage 7 — FR (Functional Requirements):
 *     System obligations ("The system shall..."). Must be verifiable, unambiguous.
 *     Not just rephrased stories. Pre-extracted FRs from the source are reused.
 *
 *   Stage 8 — NFR (Non-Functional Requirements):
 *     Quality attributes (performance, security, usability, etc.).
 *     Must be measurable. Only generated where genuinely relevant.
 *
 * LLM CALLS (per use case):
 *   - FR:  2 calls (generator + validator) or 1 if pre-extracted
 *   - NFR: 2 calls (generator + validator) or 1 if pre-extracted
 *   - Generator role: "Generate FR/NFR for use case [name]"
 *   - Validator role: "Validate FR/NFR quality and measurability"
 */

import {
  CanonicalProduct,
  FunctionalRequirement,
  NonFunctionalRequirement,
  NFRCategory,
  SourceRef,
} from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';
import { frId, nfrId } from '../utils/id_generator';

function makeRef(runId: string, location: string): SourceRef {
  return { location, stage: 'requirements', run_id: runId };
}

export async function processRequirements(
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<CanonicalProduct> {
  llm.setStage('requirements');
  const extractedFR: any[] = (product as any)._extracted_fr || [];
  const extractedNFR: any[] = (product as any)._extracted_nfr || [];

  for (const feature of product.features) {
    for (const story of feature.user_stories) {
      for (const flow of story.user_flows) {
        for (const uc of flow.use_cases) {
          // Functional Requirements
          if (uc.functional_requirements.length === 0) {
            const matchingFR = extractedFR.filter(
              fr => fr.related_feature?.toLowerCase().includes(feature.title.toLowerCase()),
            );
            if (matchingFR.length > 0) {
              uc.functional_requirements = matchingFR.map((fr: any) => ({
                requirement_id: frId(uc.use_case_id),
                use_case_id: uc.use_case_id,
                type: 'functional' as const,
                title: fr.title || '',
                statement: fr.statement || '',
                rationale: fr.rationale || '',
                priority: fr.priority || 'should',
                verification_method: fr.verification_method || 'test',
                source_refs: [makeRef(runId, 'extracted from source')],
                source_type: 'explicit' as const,
                inferred: false,
                confidence_score: fr.confidence_score ?? 0.8,
              }));
              for (const m of matchingFR) {
                const idx = extractedFR.indexOf(m);
                if (idx >= 0) extractedFR.splice(idx, 1);
              }
            } else {
              uc.functional_requirements = await generateFR(uc, feature, product, llm, runId);
            }
            uc.functional_requirements = await validateFR(uc.functional_requirements, uc, llm, runId);
          }

          // Non-Functional Requirements
          if (uc.non_functional_requirements.length === 0) {
            const matchingNFR = extractedNFR.filter(
              nfr => nfr.related_feature?.toLowerCase().includes(feature.title.toLowerCase()),
            );
            if (matchingNFR.length > 0) {
              uc.non_functional_requirements = matchingNFR.map((nfr: any) => ({
                requirement_id: nfrId(uc.use_case_id),
                use_case_id: uc.use_case_id,
                type: 'non_functional' as const,
                category: (nfr.category || 'usability') as NFRCategory,
                title: nfr.title || '',
                statement: nfr.statement || '',
                measurable_criteria: nfr.measurable_criteria || '',
                rationale: nfr.rationale || '',
                priority: nfr.priority || 'should',
                verification_method: nfr.verification_method || 'test',
                source_refs: [makeRef(runId, 'extracted from source')],
                source_type: 'explicit' as const,
                inferred: false,
                confidence_score: nfr.confidence_score ?? 0.8,
              }));
              for (const m of matchingNFR) {
                const idx = extractedNFR.indexOf(m);
                if (idx >= 0) extractedNFR.splice(idx, 1);
              }
            } else {
              uc.non_functional_requirements = await generateNFR(uc, feature, product, llm, runId);
            }
            uc.non_functional_requirements = await validateNFR(uc.non_functional_requirements, uc, llm, runId);
          }
        }
      }
    }
  }

  return product;
}

async function generateFR(
  uc: { use_case_id: string; title: string; given: string; when: string; then: string; description: string },
  feature: { title: string },
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<FunctionalRequirement[]> {
  const frs = await llm.callJSON<any[]>(
    {
      system: `You are SpecMaster's functional requirements generator.

RULES:
1. Each FR describes a system obligation/behavior.
2. FRs must be verifiable and unambiguous.
3. FRs are NOT just rephrased user stories.
4. FRs should be specific enough to implement and test.
5. Avoid vague UI descriptions.`,
      prompt: `Product: ${product.title}
Feature: ${feature.title}
Use Case: ${uc.title}
Given: ${uc.given}
When: ${uc.when}
Then: ${uc.then}
Description: ${uc.description}

Generate functional requirements.
Return JSON array:
[{
  "title": "string",
  "statement": "The system shall...",
  "rationale": "string",
  "priority": "must|should|could|wont",
  "verification_method": "test|inspection|analysis|demonstration"
}]`,
      max_tokens: 4000,
    },
    `Generate functional requirements for use case "${uc.title}"`,
    'generator',
  );

  return frs.map((fr: any) => ({
    requirement_id: frId(uc.use_case_id),
    use_case_id: uc.use_case_id,
    type: 'functional' as const,
    title: fr.title || '',
    statement: fr.statement || '',
    rationale: fr.rationale || '',
    priority: fr.priority || 'should',
    verification_method: fr.verification_method || 'test',
    source_refs: [makeRef(runId, `generated for ${uc.use_case_id}`)],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
  }));
}

async function validateFR(
  frs: FunctionalRequirement[],
  uc: { use_case_id: string; title: string },
  llm: LLMGateway,
  runId: string,
): Promise<FunctionalRequirement[]> {
  if (frs.length === 0) return frs;

  const validation = await llm.callJSON<any>(
    {
      system: `You are SpecMaster's FR validator. Check functional requirements for quality.

Check each FR:
1. Describes a system obligation?
2. Is verifiable?
3. Is unambiguous?
4. Not just a rephrased story?
5. Not too vague?`,
      prompt: `Use Case: ${uc.title} (${uc.use_case_id})

FRs to validate:
${JSON.stringify(frs.map(f => ({ requirement_id: f.requirement_id, title: f.title, statement: f.statement })), null, 2)}

Return JSON:
{
  "valid_ids": ["string"],
  "issues": [{"requirement_id": "string", "issue": "string", "severity": "low|medium|high"}]
}`,
      max_tokens: 2000,
    },
    `Validate functional requirements for use case "${uc.title}"`,
    'validator',
  );

  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const fr = frs.find(f => f.requirement_id === issue.requirement_id);
      if (fr && issue.severity === 'high') {
        fr.confidence_score = Math.min(fr.confidence_score, 0.4);
        fr.source_refs.push(makeRef(runId, `validation issue: ${issue.issue}`));
      }
    }
  }

  return frs;
}

async function generateNFR(
  uc: { use_case_id: string; title: string; description: string },
  feature: { title: string },
  product: CanonicalProduct,
  llm: LLMGateway,
  runId: string,
): Promise<NonFunctionalRequirement[]> {
  const nfrs = await llm.callJSON<any[]>(
    {
      system: `You are SpecMaster's non-functional requirements generator.

RULES:
1. Each NFR must be relevant to the use case.
2. NFR must be measurable or verifiable.
3. Must belong to a standard category: performance, reliability, availability, security, privacy, usability, accessibility, scalability, observability, maintainability, compliance.
4. Do NOT generate NFRs "for the sake of it" — only where genuinely relevant.
5. Quality over quantity.`,
      prompt: `Product: ${product.title}
Feature: ${feature.title}
Use Case: ${uc.title} — ${uc.description}

Generate relevant non-functional requirements. Only include categories that are genuinely applicable.
Return JSON array:
[{
  "category": "performance|reliability|availability|security|privacy|usability|accessibility|scalability|observability|maintainability|compliance",
  "title": "string",
  "statement": "string",
  "measurable_criteria": "string",
  "rationale": "string",
  "priority": "must|should|could|wont",
  "verification_method": "test|inspection|analysis|demonstration"
}]`,
      max_tokens: 4000,
    },
    `Generate non-functional requirements for use case "${uc.title}"`,
    'generator',
  );

  return nfrs.map((nfr: any) => ({
    requirement_id: nfrId(uc.use_case_id),
    use_case_id: uc.use_case_id,
    type: 'non_functional' as const,
    category: (nfr.category || 'usability') as NFRCategory,
    title: nfr.title || '',
    statement: nfr.statement || '',
    measurable_criteria: nfr.measurable_criteria || '',
    rationale: nfr.rationale || '',
    priority: nfr.priority || 'should',
    verification_method: nfr.verification_method || 'test',
    source_refs: [makeRef(runId, `generated for ${uc.use_case_id}`)],
    source_type: 'derived' as const,
    inferred: true,
    confidence_score: 0.7,
  }));
}

async function validateNFR(
  nfrs: NonFunctionalRequirement[],
  uc: { use_case_id: string; title: string },
  llm: LLMGateway,
  runId: string,
): Promise<NonFunctionalRequirement[]> {
  if (nfrs.length === 0) return nfrs;

  const validation = await llm.callJSON<any>(
    {
      system: `You are SpecMaster's NFR validator. Check non-functional requirements for quality.

Check each NFR:
1. Relevant to the use case?
2. Measurable or verifiable?
3. Valid category?
4. Not generated just for completeness?`,
      prompt: `Use Case: ${uc.title} (${uc.use_case_id})

NFRs to validate:
${JSON.stringify(nfrs.map(n => ({ requirement_id: n.requirement_id, category: n.category, title: n.title, statement: n.statement, measurable_criteria: n.measurable_criteria })), null, 2)}

Return JSON:
{
  "valid_ids": ["string"],
  "issues": [{"requirement_id": "string", "issue": "string", "severity": "low|medium|high"}]
}`,
      max_tokens: 2000,
    },
    `Validate non-functional requirements for use case "${uc.title}"`,
    'validator',
  );

  if (validation.issues?.length > 0) {
    for (const issue of validation.issues) {
      const nfr = nfrs.find(n => n.requirement_id === issue.requirement_id);
      if (nfr && issue.severity === 'high') {
        nfr.confidence_score = Math.min(nfr.confidence_score, 0.4);
        nfr.source_refs.push(makeRef(runId, `validation issue: ${issue.issue}`));
      }
    }
  }

  return nfrs;
}
