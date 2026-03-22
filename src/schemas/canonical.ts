/**
 * Canonical JSON schema types for SpecMaster internal model.
 * All pipeline stages operate on these types.
 */

export type SourceType = 'explicit' | 'derived' | 'assumed';

export interface SourceRef {
  location: string;       // e.g. "line 42", "section: Features", "paragraph 3"
  original_text?: string; // verbatim excerpt from source
  stage: string;          // pipeline stage that produced this ref
  run_id: string;
}

export interface ConfidenceMetadata {
  confidence_score: number; // 0.0–1.0
  source_type: SourceType;
  source_refs: SourceRef[];
  inferred: boolean;
}

// ─── Non-Functional Requirement ──────────────────────────────────────────────

export type NFRCategory =
  | 'performance'
  | 'reliability'
  | 'availability'
  | 'security'
  | 'privacy'
  | 'usability'
  | 'accessibility'
  | 'scalability'
  | 'observability'
  | 'maintainability'
  | 'compliance';

export interface NonFunctionalRequirement extends ConfidenceMetadata {
  requirement_id: string;
  use_case_id: string;
  type: 'non_functional';
  category: NFRCategory;
  title: string;
  statement: string;
  measurable_criteria: string;
  rationale: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  verification_method: string;
}

// ─── Functional Requirement ──────────────────────────────────────────────────

export interface FunctionalRequirement extends ConfidenceMetadata {
  requirement_id: string;
  use_case_id: string;
  type: 'functional';
  title: string;
  statement: string;
  rationale: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  verification_method: string;
}

// ─── Use Case ────────────────────────────────────────────────────────────────

export interface UseCase extends ConfidenceMetadata {
  use_case_id: string;
  flow_id: string;
  title: string;
  description: string;
  actors: string[];
  trigger: string;
  preconditions: string[];
  given: string;
  when: string;
  then: string;
  alternate_cases: string[];
  error_cases: string[];
  functional_requirements: FunctionalRequirement[];
  non_functional_requirements: NonFunctionalRequirement[];
}

// ─── User Flow ───────────────────────────────────────────────────────────────

export interface UserFlow extends ConfidenceMetadata {
  flow_id: string;
  story_id: string;
  title: string;
  description: string;
  main_path: string[];
  alternate_paths: string[][];
  error_paths: string[][];
  entry_points: string[];
  exit_points: string[];
  mermaid: string;
  use_cases: UseCase[];
}

// ─── User Story ──────────────────────────────────────────────────────────────

export interface UserStory extends ConfidenceMetadata {
  story_id: string;
  feature_id: string;
  title: string;
  as_a: string;
  i_want: string;
  so_that: string;
  acceptance_intent: string;
  actors: string[];
  preconditions: string[];
  postconditions: string[];
  user_flows: UserFlow[];
}

// ─── Feature ─────────────────────────────────────────────────────────────────

export interface Feature extends ConfidenceMetadata {
  feature_id: string;
  title: string;
  description: string;
  business_value: string;
  user_value: string;
  scope: string;
  priority: 'must' | 'should' | 'could' | 'wont';
  release_target: string;
  dependencies: string[];
  user_stories: UserStory[];
}

// ─── Release ─────────────────────────────────────────────────────────────────

export interface ReleaseVersion {
  version: string;        // e.g. "MVP", "v1", "v2", "future"
  description: string;
  feature_ids: string[];
  rationale: string;
}

// ─── Product (Root) ──────────────────────────────────────────────────────────

export interface Persona {
  name: string;
  description: string;
  goals: string[];
  pain_points: string[];
}

export interface CanonicalProduct extends ConfidenceMetadata {
  product_id: string;
  title: string;
  summary: string;
  vision: string;
  goals: string[];
  non_goals: string[];
  personas: Persona[];
  domain_model: string;
  assumptions: string[];
  open_questions: string[];
  success_metrics: string[];
  release_plan: ReleaseVersion[];
  features: Feature[];
}

// ─── Detected structure (Stage 0 output) ─────────────────────────────────────

export type InputMode = 'raw' | 'structured' | 'mixed';

export interface DetectedSection {
  heading: string;
  start_line: number;
  end_line: number;
  mapped_to?: string; // canonical field name
  content_preview: string;
}

export interface DetectedStructure {
  input_mode: InputMode;
  has_features: boolean;
  has_user_stories: boolean;
  has_user_flows: boolean;
  has_use_cases: boolean;
  has_functional_requirements: boolean;
  has_non_functional_requirements: boolean;
  has_release_plan: boolean;
  has_goals: boolean;
  has_personas: boolean;
  has_domain_model: boolean;
  sections: DetectedSection[];
  raw_sections: string[];
}

// ─── Run Manifest ────────────────────────────────────────────────────────────

export interface StageResult {
  stage: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  started_at?: string;
  completed_at?: string;
  error?: string;
  output_files: string[];
}

export interface RunManifest {
  run_id: string;
  started_at: string;
  completed_at?: string;
  input_file: string;
  output_dir: string;
  provider: string;
  model: string;
  mode: 'strict' | 'balanced' | 'creative';
  stages: StageResult[];
  status: 'running' | 'completed' | 'failed' | 'partial';
}
