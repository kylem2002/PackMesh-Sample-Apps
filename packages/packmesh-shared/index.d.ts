export interface ScenarioInput {
  name: string;
  items: Array<{ sku: string; quantity: number }>;
  constraints?: Record<string, unknown>;
}

export interface RunStatus {
  runId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export const goldenScenario: ScenarioInput;
export const copyText: Record<string, string>;
