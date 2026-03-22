/**
 * Logger — structured, human-readable pipeline logging.
 * Shows what each LLM call does, timing, token usage, and stage progress.
 */

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LLMCallLog {
  call_number: number;
  stage: string;
  purpose: string;
  role: 'generator' | 'validator' | 'analyzer' | 'planner';
  started_at: number;
  completed_at?: number;
  duration_ms?: number;
  input_tokens?: number;
  output_tokens?: number;
  success: boolean;
  error?: string;
}

export class Logger {
  private llmCallCount = 0;
  private stageStartTime = 0;
  private pipelineStartTime = 0;
  private callLogs: LLMCallLog[] = [];
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
    this.pipelineStartTime = Date.now();
  }

  // ─── Pipeline-level ──────────────────────────────────────────────────

  pipelineStart(input: string, provider: string, model: string, mode: string): void {
    console.log('');
    console.log(`${COLORS.bold}${COLORS.cyan}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}║             SpecMaster — Spec Generation Pipeline       ║${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.cyan}╚══════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('');
    console.log(`  ${COLORS.dim}Input:${COLORS.reset}    ${input}`);
    console.log(`  ${COLORS.dim}Provider:${COLORS.reset} ${provider}`);
    console.log(`  ${COLORS.dim}Model:${COLORS.reset}    ${model}`);
    console.log(`  ${COLORS.dim}Mode:${COLORS.reset}     ${mode}`);
    console.log('');
  }

  pipelineEnd(outputDir: string): void {
    const totalMs = Date.now() - this.pipelineStartTime;
    const totalCalls = this.callLogs.length;
    const totalInputTokens = this.callLogs.reduce((s, c) => s + (c.input_tokens || 0), 0);
    const totalOutputTokens = this.callLogs.reduce((s, c) => s + (c.output_tokens || 0), 0);
    const failedCalls = this.callLogs.filter(c => !c.success).length;

    console.log('');
    console.log(`${COLORS.bold}${COLORS.green}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.green}║                   Pipeline Complete                      ║${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.green}╚══════════════════════════════════════════════════════════╝${COLORS.reset}`);
    console.log('');
    console.log(`  ${COLORS.dim}Output:${COLORS.reset}        ${outputDir}`);
    console.log(`  ${COLORS.dim}Total time:${COLORS.reset}    ${this.formatDuration(totalMs)}`);
    console.log(`  ${COLORS.dim}LLM calls:${COLORS.reset}     ${totalCalls}${failedCalls > 0 ? ` (${COLORS.red}${failedCalls} failed${COLORS.reset})` : ''}`);
    console.log(`  ${COLORS.dim}Tokens in:${COLORS.reset}     ${totalInputTokens.toLocaleString()}`);
    console.log(`  ${COLORS.dim}Tokens out:${COLORS.reset}    ${totalOutputTokens.toLocaleString()}`);
    console.log(`  ${COLORS.dim}Total tokens:${COLORS.reset}  ${(totalInputTokens + totalOutputTokens).toLocaleString()}`);
    console.log('');
  }

  // ─── Stage-level ─────────────────────────────────────────────────────

  stageStart(stageNum: number, totalStages: number, name: string, description: string): void {
    this.stageStartTime = Date.now();
    console.log(`${COLORS.bold}${COLORS.blue}┌─ Stage ${stageNum}/${totalStages}: ${name}${COLORS.reset}`);
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.dim}${description}${COLORS.reset}`);
  }

  stageSkip(stageNum: number, totalStages: number, name: string): void {
    console.log(`${COLORS.gray}┌─ Stage ${stageNum}/${totalStages}: ${name} (skipped — already completed)${COLORS.reset}`);
  }

  stageEnd(name: string, summary: string): void {
    const durationMs = Date.now() - this.stageStartTime;
    const stageCalls = this.callLogs.filter(c => c.stage === name);
    console.log(`${COLORS.blue}│${COLORS.reset}`);
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.green}Result:${COLORS.reset} ${summary}`);
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.dim}LLM calls: ${stageCalls.length} | Time: ${this.formatDuration(durationMs)}${COLORS.reset}`);
    console.log(`${COLORS.blue}└─────────────────────────────────────────${COLORS.reset}`);
    console.log('');
  }

  stageFail(name: string, error: string): void {
    const durationMs = Date.now() - this.stageStartTime;
    console.log(`${COLORS.blue}│${COLORS.reset}`);
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.red}FAILED: ${error}${COLORS.reset}`);
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.dim}Time: ${this.formatDuration(durationMs)}${COLORS.reset}`);
    console.log(`${COLORS.red}└─────────────────────────────────────────${COLORS.reset}`);
    console.log('');
  }

  // ─── LLM call tracking ──────────────────────────────────────────────

  llmCallStart(stage: string, purpose: string, role: LLMCallLog['role']): number {
    this.llmCallCount++;
    const callNum = this.llmCallCount;

    const roleIcon = {
      generator: '🔨',
      validator: '🔍',
      analyzer: '📊',
      planner: '📋',
    }[role];

    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.yellow}[LLM #${callNum}]${COLORS.reset} ${roleIcon} ${role.toUpperCase()}: ${purpose}`);

    this.callLogs.push({
      call_number: callNum,
      stage,
      purpose,
      role,
      started_at: Date.now(),
      success: false,
    });

    return callNum;
  }

  llmCallEnd(callNum: number, inputTokens?: number, outputTokens?: number): void {
    const log = this.callLogs.find(c => c.call_number === callNum);
    if (log) {
      log.completed_at = Date.now();
      log.duration_ms = log.completed_at - log.started_at;
      log.input_tokens = inputTokens;
      log.output_tokens = outputTokens;
      log.success = true;

      const tokenInfo = inputTokens !== undefined
        ? ` ${COLORS.dim}(${inputTokens}→${outputTokens} tokens, ${this.formatDuration(log.duration_ms)})${COLORS.reset}`
        : ` ${COLORS.dim}(${this.formatDuration(log.duration_ms)})${COLORS.reset}`;

      console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.green}         ✓ done${COLORS.reset}${tokenInfo}`);
    }
  }

  llmCallFail(callNum: number, error: string): void {
    const log = this.callLogs.find(c => c.call_number === callNum);
    if (log) {
      log.completed_at = Date.now();
      log.duration_ms = log.completed_at - log.started_at;
      log.success = false;
      log.error = error;
      console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.red}         ✗ failed: ${error}${COLORS.reset}`);
    }
  }

  // ─── Info messages within stages ─────────────────────────────────────

  stageInfo(message: string): void {
    console.log(`${COLORS.blue}│${COLORS.reset}  ${message}`);
  }

  stageDetail(label: string, value: string): void {
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.dim}${label}:${COLORS.reset} ${value}`);
  }

  stageWarn(message: string): void {
    console.log(`${COLORS.blue}│${COLORS.reset}  ${COLORS.yellow}⚠ ${message}${COLORS.reset}`);
  }

  // ─── Get logs for manifest ──────────────────────────────────────────

  getCallLogs(): LLMCallLog[] {
    return [...this.callLogs];
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }
}

// Singleton for the pipeline
let _logger: Logger | null = null;

export function getLogger(): Logger {
  if (!_logger) _logger = new Logger();
  return _logger;
}

export function createLogger(level: LogLevel = 'info'): Logger {
  _logger = new Logger(level);
  return _logger;
}
