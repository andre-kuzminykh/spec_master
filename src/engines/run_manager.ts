/**
 * Run Manager — manages pipeline execution, manifest, resume, and output files.
 */

import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { RunManifest, StageResult, CanonicalProduct, DetectedStructure } from '../schemas/canonical';
import { writeJSON, readJSON, writeText, ensureDir, fileExists } from '../utils/file_utils';
import { CrossValidationResult } from './cross_validator';
import { TraceabilityMatrix } from './traceability_engine';
import {
  renderFinalSpecification,
  renderFeaturesMarkdown,
  renderStoriesMarkdown,
  renderUseCasesMarkdown,
  renderRequirementsMarkdown,
  renderReleasePlanMarkdown,
} from './renderer';

export const STAGES = [
  'detect',
  'normalize',
  'features',
  'releases',
  'stories',
  'flows',
  'use_cases',
  'requirements',
  'cross_validate',
  'render',
] as const;

export type StageName = typeof STAGES[number];

export class RunManager {
  private manifest: RunManifest;
  private outDir: string;

  constructor(
    inputFile: string,
    outDir: string,
    provider: string,
    model: string,
    mode: 'strict' | 'balanced' | 'creative',
  ) {
    this.outDir = outDir;
    this.manifest = {
      run_id: uuidv4(),
      started_at: new Date().toISOString(),
      input_file: inputFile,
      output_dir: outDir,
      provider,
      model,
      mode,
      stages: STAGES.map(s => ({
        stage: s,
        status: 'pending',
        output_files: [],
      })),
      status: 'running',
    };

    ensureDir(outDir);
    this.saveManifest();
  }

  get runId(): string {
    return this.manifest.run_id;
  }

  static fromManifest(manifestPath: string): RunManager {
    const manifest = readJSON<RunManifest>(manifestPath);
    const rm = Object.create(RunManager.prototype);
    rm.manifest = manifest;
    rm.outDir = manifest.output_dir;
    return rm;
  }

  getNextPendingStage(): StageName | null {
    const stage = this.manifest.stages.find(s => s.status === 'pending');
    return stage ? stage.stage as StageName : null;
  }

  getStageStatus(stage: string): string {
    return this.manifest.stages.find(s => s.stage === stage)?.status || 'unknown';
  }

  startStage(stage: string): void {
    const s = this.manifest.stages.find(st => st.stage === stage);
    if (s) {
      s.status = 'running';
      s.started_at = new Date().toISOString();
      this.saveManifest();
    }
  }

  completeStage(stage: string, outputFiles: string[]): void {
    const s = this.manifest.stages.find(st => st.stage === stage);
    if (s) {
      s.status = 'completed';
      s.completed_at = new Date().toISOString();
      s.output_files = outputFiles;
      this.saveManifest();
    }
  }

  failStage(stage: string, error: string): void {
    const s = this.manifest.stages.find(st => st.stage === stage);
    if (s) {
      s.status = 'failed';
      s.completed_at = new Date().toISOString();
      s.error = error;
      this.manifest.status = 'failed';
      this.saveManifest();
    }
  }

  complete(): void {
    this.manifest.completed_at = new Date().toISOString();
    this.manifest.status = 'completed';
    this.saveManifest();
  }

  // ─── Save outputs ──────────────────────────────────────────────────────

  saveDetectedStructure(structure: DetectedStructure): string[] {
    const dir = path.join(this.outDir, 'raw');
    const filePath = path.join(dir, 'detected_structure.json');
    writeJSON(filePath, structure);
    return [filePath];
  }

  saveParsedDocument(markdown: string): string[] {
    const dir = path.join(this.outDir, 'raw');
    const filePath = path.join(dir, 'parsed_document.json');
    writeJSON(filePath, { content: markdown, parsed_at: new Date().toISOString() });
    return [filePath];
  }

  saveCanonicalProduct(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'canonical');
    const filePath = path.join(dir, 'canonical_product.json');
    // Remove internal extracted data before saving
    const cleanProduct = { ...product };
    delete (cleanProduct as any)._extracted_use_cases;
    delete (cleanProduct as any)._extracted_fr;
    delete (cleanProduct as any)._extracted_nfr;
    writeJSON(filePath, cleanProduct);
    return [filePath];
  }

  saveFeatures(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'features');
    const jsonPath = path.join(dir, 'features.json');
    const mdPath = path.join(dir, 'features.md');
    writeJSON(jsonPath, product.features);
    writeText(mdPath, renderFeaturesMarkdown(product));
    return [jsonPath, mdPath];
  }

  saveReleases(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'releases');
    const jsonPath = path.join(dir, 'release_plan.json');
    const mdPath = path.join(dir, 'release_plan.md');
    writeJSON(jsonPath, product.release_plan);
    writeText(mdPath, renderReleasePlanMarkdown(product));
    return [jsonPath, mdPath];
  }

  saveStories(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'stories');
    const jsonPath = path.join(dir, 'stories.json');
    const mdPath = path.join(dir, 'stories.md');
    const allStories = product.features.flatMap(f => f.user_stories);
    writeJSON(jsonPath, allStories);
    writeText(mdPath, renderStoriesMarkdown(product));
    return [jsonPath, mdPath];
  }

  saveFlows(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'flows');
    const mermaidDir = path.join(dir, 'mermaid');
    ensureDir(mermaidDir);
    const jsonPath = path.join(dir, 'flows.json');
    const allFlows = product.features.flatMap(f =>
      f.user_stories.flatMap(s => s.user_flows),
    );
    writeJSON(jsonPath, allFlows);

    const files = [jsonPath];
    for (const flow of allFlows) {
      if (flow.mermaid) {
        const mmdPath = path.join(mermaidDir, `${flow.flow_id}.mmd`);
        writeText(mmdPath, flow.mermaid);
        files.push(mmdPath);
      }
    }
    return files;
  }

  saveUseCases(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'use-cases');
    const jsonPath = path.join(dir, 'use_cases.json');
    const mdPath = path.join(dir, 'use_cases.md');
    const allUCs = product.features.flatMap(f =>
      f.user_stories.flatMap(s =>
        s.user_flows.flatMap(fl => fl.use_cases),
      ),
    );
    writeJSON(jsonPath, allUCs);
    writeText(mdPath, renderUseCasesMarkdown(product));
    return [jsonPath, mdPath];
  }

  saveRequirements(product: CanonicalProduct): string[] {
    const dir = path.join(this.outDir, 'requirements');
    const allFR = product.features.flatMap(f =>
      f.user_stories.flatMap(s =>
        s.user_flows.flatMap(fl =>
          fl.use_cases.flatMap(uc => uc.functional_requirements),
        ),
      ),
    );
    const allNFR = product.features.flatMap(f =>
      f.user_stories.flatMap(s =>
        s.user_flows.flatMap(fl =>
          fl.use_cases.flatMap(uc => uc.non_functional_requirements),
        ),
      ),
    );
    const frPath = path.join(dir, 'functional_requirements.json');
    const nfrPath = path.join(dir, 'non_functional_requirements.json');
    const mdPath = path.join(dir, 'requirements.md');
    writeJSON(frPath, allFR);
    writeJSON(nfrPath, allNFR);
    writeText(mdPath, renderRequirementsMarkdown(product));
    return [frPath, nfrPath, mdPath];
  }

  saveTraceability(
    traceability: TraceabilityMatrix,
    validation: CrossValidationResult,
  ): string[] {
    const dir = path.join(this.outDir, 'trace');
    const tracePath = path.join(dir, 'traceability_matrix.json');
    const assumptionsPath = path.join(dir, 'assumptions.json');
    const unresolvedPath = path.join(dir, 'unresolved_items.json');
    writeJSON(tracePath, traceability);
    writeJSON(assumptionsPath, validation.assumptions);
    writeJSON(unresolvedPath, validation.unresolved_items);
    return [tracePath, assumptionsPath, unresolvedPath];
  }

  saveFinalSpec(content: string): string[] {
    const filePath = path.join(this.outDir, 'final_specification.md');
    writeText(filePath, content);
    return [filePath];
  }

  loadCanonicalProduct(): CanonicalProduct {
    const filePath = path.join(this.outDir, 'canonical', 'canonical_product.json');
    return readJSON<CanonicalProduct>(filePath);
  }

  private saveManifest(): void {
    writeJSON(path.join(this.outDir, 'run_manifest.json'), this.manifest);
  }
}
