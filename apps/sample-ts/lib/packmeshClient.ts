export type ScenarioInput = Record<string, unknown>;
export type RunStatus = { runId?: string; status: string; updatedAt?: string; error?: string };
export type EquipmentCatalogItem = {
  id: string;
  name: string;
  description: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  maxPayloadKg?: number;
  badge?: string;
};

export type EquipmentCatalogResponse = {
  packaging: EquipmentCatalogItem[];
  pallets: EquipmentCatalogItem[];
  shipments: EquipmentCatalogItem[];
};

export type CreateCustomEquipmentRequest = {
  category: 'packaging' | 'pallets' | 'shipments';
  name: string;
  description?: string;
  lengthMeters: number;
  widthMeters: number;
  heightMeters: number;
  maxPayloadKg: number;
};

type RecentRun = {
  scenarioId: string;
  runId: string;
  status: string;
  updatedAt: string;
};

const RECENT_RUNS_STORAGE_KEY = 'packmesh.sample.recentRuns';
const RECENT_RUNS_LIMIT = 15;
const baseUrl = process.env.NEXT_PUBLIC_PACKMESH_BASE_URL
  ?? 'https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api';
const timeoutMs = Number(process.env.NEXT_PUBLIC_PACKMESH_TIMEOUT_MS ?? 20000);

// Pause between retry attempts when requests are throttled or encounter transient server errors.
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requestId() {
  // Generate a lightweight client request id to help correlate requests in downstream logs.
  return `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePath(path: string): string {
  // Ensure endpoint paths always have a leading slash before appending to base URL.
  return path.startsWith('/') ? path : `/${path}`;
}

async function apiRequest(path: string, options: RequestInit & { apiKey: string }, retries = 3): Promise<any> {
  // Abort requests that exceed the configured timeout to prevent hanging UI operations.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const rid = requestId();

  try {
    // Use a normalized URL and standard auth/request-id headers for all API calls.
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${normalizePath(path)}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': rid,
        Authorization: `ApiKey ${options.apiKey}`,
        ...(options.headers ?? {})
      }
    });

    // Retry throttling and transient server failures with linear backoff.
    if ((response.status === 429 || response.status >= 500) && retries > 0) {
      await delay((4 - retries) * 800);
      return apiRequest(path, options, retries - 1);
    }

    // Surface full response body for non-retriable failures to simplify debugging.
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body}`);
    }

    // Some endpoints can acknowledge success without response content.
    if (response.status === 204) {
      return null;
    }

    // Parse JSON when available; otherwise return response text as-is.
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }

    return response.text();
  } finally {
    // Always clear timeout handles once request completes to avoid leaking timers.
    clearTimeout(timer);
  }
}

function readRecentRuns(): RecentRun[] {
  // Guard browser-only storage calls when code runs during server rendering.
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const value = localStorage.getItem(RECENT_RUNS_STORAGE_KEY);
    if (!value) {
      return [];
    }

    // Treat malformed or unexpected storage payloads as an empty recent-run list.
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentRuns(runs: RecentRun[]): void {
  // Guard browser-only storage calls when code runs during server rendering.
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(RECENT_RUNS_STORAGE_KEY, JSON.stringify(runs));
}

export const packmeshClient = {
  async createScenario(input: ScenarioInput, apiKey: string) {
    // Create a scenario and return its id regardless of backend field naming differences.
    const data = await apiRequest('/v1/scenarios', { method: 'POST', body: JSON.stringify(input), apiKey });
    const id = data?.id ?? data?.scenarioId;
    if (!id) {
      throw new Error("Scenario response did not contain required property 'id'.");
    }

    return String(id);
  },
  async runScenario(scenarioId: string, apiKey: string, runRequestJson?: string) {
    // Run endpoint accepts no request body; optional idempotency is supplied via header.
    const runOptions = runRequestJson ? JSON.parse(runRequestJson) as { idempotencyKey?: string } : {};
    const idempotencyKey = String(runOptions.idempotencyKey ?? `idem-${requestId()}`);
    const data = await apiRequest(`/v1/scenarios/${scenarioId}/runs`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      apiKey
    });

    return String(data?.runId ?? '');
  },
  async getRunStatus(scenarioId: string, runId: string, apiKey: string): Promise<string> {
    // Read current run lifecycle status for polling and UI state transitions.
    const response = await apiRequest(`/v1/scenarios/${scenarioId}/runs/${runId}`, { method: 'GET', apiKey });
    return String(response?.status ?? 'unknown');
  },
  async getRunResults(scenarioId: string, runId: string, apiKey: string) {
    // Fetch raw result payload and normalize to a printable string for the playground viewer.
    const response = await apiRequest(`/v1/scenarios/${scenarioId}/results/raw?dataset=packaging&runId=${encodeURIComponent(runId)}`, {
      method: 'GET',
      apiKey
    });

    return typeof response === 'string' ? response : JSON.stringify(response, null, 2);
  },
  async getScenario(scenarioId: string, apiKey: string) {
    // Fetch full scenario details for troubleshooting or future UI extensions.
    return apiRequest(`/v1/scenarios/${scenarioId}`, { method: 'GET', apiKey });
  },
  async getEquipmentCatalog(apiKey: string): Promise<EquipmentCatalogResponse> {
    // Returns merged user + PackMesh default catalog entries grouped by category.
    return apiRequest('/v1/catalog/equipment', { method: 'GET', apiKey });
  },
  async createCustomEquipment(payload: CreateCustomEquipmentRequest, apiKey: string): Promise<EquipmentCatalogItem> {
    // Create custom equipment using the canonical catalog write endpoint.
    return apiRequest('/v1/catalog/equipment/custom', { method: 'POST', apiKey, body: JSON.stringify(payload) });
  },
  saveRecentRun(scenarioId: string, runId: string, status: string) {
    // Insert newest run first, de-dupe by run id, and keep only the most recent entries.
    const runs = readRecentRuns().filter((run) => run.runId !== runId);
    runs.unshift({ scenarioId, runId, status, updatedAt: new Date().toISOString() });
    writeRecentRuns(runs.slice(0, RECENT_RUNS_LIMIT));
  },
  updateRecentRunStatus(runId: string, status: string) {
    // Update local run status and timestamp so history reflects latest poll outcome.
    const runs = readRecentRuns().map((run) => (run.runId === runId
      ? { ...run, status, updatedAt: new Date().toISOString() }
      : run));
    writeRecentRuns(runs);
  },
  listRecentRuns() {
    // Read cached runs used by the playground's recent-run panel.
    return readRecentRuns();
  }
};
