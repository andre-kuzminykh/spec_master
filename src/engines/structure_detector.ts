/**
 * Stage 0 — Parse and detect structure.
 * Determines if input is raw idea, structured spec, or mixed.
 * Extracts sections and maps them to canonical fields.
 */

import { DetectedStructure, DetectedSection, InputMode } from '../schemas/canonical';
import { LLMGateway } from '../utils/llm_gateway';

const SECTION_MAPPINGS: Record<string, string> = {
  'vision': 'vision',
  'product vision': 'vision',
  'summary': 'summary',
  'product summary': 'summary',
  'overview': 'summary',
  'goals': 'goals',
  'objectives': 'goals',
  'non-goals': 'non_goals',
  'non goals': 'non_goals',
  'out of scope': 'non_goals',
  'personas': 'personas',
  'users': 'personas',
  'target users': 'personas',
  'domain model': 'domain_model',
  'data model': 'domain_model',
  'features': 'features',
  'feature list': 'features',
  'capabilities': 'features',
  'user stories': 'user_stories',
  'stories': 'user_stories',
  'user flows': 'user_flows',
  'flows': 'user_flows',
  'workflows': 'user_flows',
  'use cases': 'use_cases',
  'scenarios': 'use_cases',
  'functional requirements': 'functional_requirements',
  'requirements': 'functional_requirements',
  'system requirements': 'functional_requirements',
  'non-functional requirements': 'non_functional_requirements',
  'nfr': 'non_functional_requirements',
  'quality requirements': 'non_functional_requirements',
  'release plan': 'release_plan',
  'roadmap': 'release_plan',
  'milestones': 'release_plan',
  'mvp': 'release_plan',
  'phases': 'release_plan',
  'assumptions': 'assumptions',
  'constraints': 'assumptions',
  'open questions': 'open_questions',
  'questions': 'open_questions',
  'risks': 'open_questions',
  'success metrics': 'success_metrics',
  'kpis': 'success_metrics',
  'metrics': 'success_metrics',
  'product principles': 'goals',
  'principles': 'goals',
};

interface HeadingInfo {
  level: number;
  text: string;
  line: number;
}

function extractHeadings(markdown: string): HeadingInfo[] {
  const lines = markdown.split('\n');
  const headings: HeadingInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i + 1,
      });
    }
  }
  return headings;
}

function mapHeadingToField(heading: string): string | undefined {
  const normalized = heading.toLowerCase()
    .replace(/^\d+[\.\)]\s*/, '')  // strip leading numbers
    .replace(/[*_`#]/g, '')       // strip markdown formatting
    .trim();

  // Direct match
  if (SECTION_MAPPINGS[normalized]) return SECTION_MAPPINGS[normalized];

  // Partial match
  for (const [key, value] of Object.entries(SECTION_MAPPINGS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value;
    }
  }
  return undefined;
}

export async function detectStructure(
  markdown: string,
  llm: LLMGateway,
  runId: string,
): Promise<DetectedStructure> {
  const lines = markdown.split('\n');
  const headings = extractHeadings(markdown);

  // Build sections
  const sections: DetectedSection[] = [];
  for (let i = 0; i < headings.length; i++) {
    const start = headings[i].line;
    const end = i + 1 < headings.length ? headings[i + 1].line - 1 : lines.length;
    const sectionLines = lines.slice(start - 1, end);
    const contentPreview = sectionLines.slice(0, 5).join('\n');

    sections.push({
      heading: headings[i].text,
      start_line: start,
      end_line: end,
      mapped_to: mapHeadingToField(headings[i].text),
      content_preview: contentPreview,
    });
  }

  // Determine what exists
  const mappedFields = new Set(sections.map(s => s.mapped_to).filter(Boolean));

  const has_features = mappedFields.has('features');
  const has_user_stories = mappedFields.has('user_stories');
  const has_user_flows = mappedFields.has('user_flows');
  const has_use_cases = mappedFields.has('use_cases');
  const has_functional_requirements = mappedFields.has('functional_requirements');
  const has_non_functional_requirements = mappedFields.has('non_functional_requirements');
  const has_release_plan = mappedFields.has('release_plan');
  const has_goals = mappedFields.has('goals');
  const has_personas = mappedFields.has('personas');
  const has_domain_model = mappedFields.has('domain_model');

  // Determine input mode
  const structuredCount = [
    has_features,
    has_user_stories,
    has_user_flows,
    has_use_cases,
    has_functional_requirements,
    has_non_functional_requirements,
  ].filter(Boolean).length;

  let input_mode: InputMode;
  if (structuredCount >= 3) {
    input_mode = 'structured';
  } else if (structuredCount >= 1) {
    input_mode = 'mixed';
  } else {
    input_mode = 'raw';
  }

  // If heuristics are inconclusive, use LLM for deeper analysis
  if (input_mode === 'raw' && headings.length > 5) {
    try {
      const llmResult = await llm.callJSON<{ mode: InputMode }>({
        system: 'You are a document structure analyzer. Determine if this document is a raw idea, a structured specification, or a mix.',
        prompt: `Analyze this document and determine its structure level.
Return JSON: { "mode": "raw" | "structured" | "mixed" }

Document (first 3000 chars):
${markdown.substring(0, 3000)}`,
      });
      input_mode = llmResult.mode;
    } catch {
      // Keep heuristic result
    }
  }

  return {
    input_mode,
    has_features,
    has_user_stories,
    has_user_flows,
    has_use_cases,
    has_functional_requirements,
    has_non_functional_requirements,
    has_release_plan,
    has_goals,
    has_personas,
    has_domain_model,
    sections,
    raw_sections: sections.map(s => s.heading),
  };
}
