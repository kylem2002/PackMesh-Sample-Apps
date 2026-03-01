'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { packmeshClient } from '../lib/packmeshClient';

const apiKeyStorageKey = 'packmesh.sample.apiKey';

const scenarioRequestSample = `{
  "name": "Golden path packaging scenario",
  "decisionType": "endToEnd",
  "contents": {
    "orderId": "ORDER-1001",
    "items": [
      {
        "id": "SKU-100",
        "description": "Ceramic mug",
        "quantity": 24,
        "weightKg": 0.35,
        "volumeCubicMeters": 0.0018,
        "dimensionsCm": { "length": 12, "width": 9, "height": 10 }
      },
      {
        "id": "SKU-200",
        "description": "Coffee beans 1kg bag",
        "quantity": 12,
        "weightKg": 1,
        "volumeCubicMeters": 0.003,
        "dimensionsCm": { "length": 20, "width": 12, "height": 10 }
      }
    ],
    "notes": "Demo scenario from Blazor sample",
    "cartonPolicy": { "mode": "unlimited" }
  },
  "options": { "packagingOption": "baseline" },
  "goal": {
    "type": "balancedEfficiency",
    "settings": {
      "weightBalancePriority": "medium",
      "stabilityPreference": "medium",
      "standardizationBias": "medium"
    }
  },
  "status": "draft",
  "unitPreference": "metric"
}`;

const runRequestSample = `{
  "idempotencyKey": "idem-demo-run-001",
  "note": "POST /v1/scenarios/{scenarioId}/runs accepts no body. This value is read by the playground and sent as the Idempotency-Key header."
}`;

const statusRequestSample = `{
  "note": "GET /v1/scenarios/{scenarioId}/runs/{runId} does not require a request body. Provide scenarioId and runId by running the scenario first."
}`;

const edgeCaseRequestSample = `{
  "name": "Edge case: overweight item + orientation stress",
  "decisionType": "endToEnd",
  "contents": {
    "orderId": "ORDER-EDGE-01",
    "items": [
      { "id": "SKU-HEAVY", "description": "Dense metal part", "quantity": 1, "weightKg": 19.5, "volumeCubicMeters": 0.012, "dimensionsCm": { "length": 40, "width": 20, "height": 15 } },
      { "id": "SKU-LONG", "description": "Long item", "quantity": 3, "weightKg": 2.1, "volumeCubicMeters": 0.015, "dimensionsCm": { "length": 70, "width": 8, "height": 6 } }
    ],
    "cartonPolicy": { "mode": "limited", "maxCartons": 2 }
  },
  "options": { "packagingOption": "baseline" },
  "goal": { "type": "balancedEfficiency" },
  "status": "draft",
  "unitPreference": "metric"
}`;

const invalidRequestSample = `{
  "name": "Broken example",
  "decisionType": "endToEnd",
  "contents": {
    "orderId": "ORDER-BROKEN"
  }
`;

const customEquipmentSample = `{
  "category": "pallets",
  "name": "My Test Euro Pallet",
  "description": "User-scoped custom pallet created from the Next.js playground",
  "lengthMeters": 1.2,
  "widthMeters": 0.8,
  "heightMeters": 0.14,
  "maxPayloadKg": 1100
}`;

type StatusType = 'idle' | 'created' | 'queued' | 'running' | 'complete' | 'failed' | 'unknown';
type TabType = 'response' | 'logs' | 'raw';
type TemplateType = 'scenario' | 'run' | 'status' | 'edge' | 'invalid' | 'customEquipment';

type ResponseSummary = {
  totalRows: number;
  uniqueBins: number;
  totalWeight: number;
  maxLayer: number;
};

const statusIconMap: Record<string, string> = {
  complete: '✅',
  running: '🟡',
  queued: '🔵',
  failed: '🔴',
  idle: '⚪'
};

function normalizeStatus(status: string): StatusType {
  // Normalize API status values so UI rendering can rely on a single status union.
  const value = status.toLowerCase();
  if (value === 'completed') {
    return 'complete';
  }

  if (value === 'idle' || value === 'created' || value === 'queued' || value === 'running' || value === 'complete' || value === 'failed') {
    return value;
  }

  return 'unknown';
}

function formatJsonIfPossible(input: string): string {
  // Keep raw payloads readable when valid JSON, but never block if payload is plain text.
  try {
    return JSON.stringify(JSON.parse(input), null, 2);
  } catch {
    return input;
  }
}

function buildResponseSummary(rawResults: string): ResponseSummary | null {
  // Build high-level response metrics for quick scanning in the playground summary panel.
  if (!rawResults.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawResults) as {
      data?: { rows?: Array<{ bin?: string; weight?: number; layer?: number }> };
    };

    const rows = parsed?.data?.rows;
    if (!Array.isArray(rows)) {
      return null;
    }

    const bins = new Set<string>();
    let totalWeight = 0;
    let maxLayer = 0;

    rows.forEach((row) => {
      // Count distinct bins to show how many cartons/containers were used.
      if (typeof row.bin === 'string') {
        bins.add(row.bin);
      }

      if (typeof row.weight === 'number') {
        totalWeight += row.weight;
      }

      if (typeof row.layer === 'number') {
        maxLayer = Math.max(maxLayer, row.layer);
      }
    });

    return {
      totalRows: rows.length,
      uniqueBins: bins.size,
      totalWeight,
      maxLayer
    };
  } catch {
    return null;
  }
}

function getTemplatePayload(template: TemplateType): string {
  // Return the canned payload that matches the template selected in the UI dropdown.
  switch (template) {
    case 'run':
      return runRequestSample;
    case 'status':
      return statusRequestSample;
    case 'edge':
      return edgeCaseRequestSample;
    case 'invalid':
      return invalidRequestSample;
    case 'customEquipment':
      return customEquipmentSample;
    case 'scenario':
    default:
      return scenarioRequestSample;
  }
}

export default function HomePage() {
  const [apiKey, setApiKey] = useState('');
  const [rememberApiKeyForSession, setRememberApiKeyForSession] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateType>('scenario');
  const [requestJson, setRequestJson] = useState(scenarioRequestSample);
  const [scenarioId, setScenarioId] = useState('');
  const [runId, setRunId] = useState('');
  const [status, setStatus] = useState<StatusType>('idle');
  const [resultsJson, setResultsJson] = useState('');
  const [error, setError] = useState('');
  const [logOutput, setLogOutput] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('response');
  const [jsonValidationError, setJsonValidationError] = useState('');
  const [resultSearch, setResultSearch] = useState('');
  const [lastDurationMs, setLastDurationMs] = useState(0);
  const [showApiKeyValidation, setShowApiKeyValidation] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [autoPollEnabled, setAutoPollEnabled] = useState(true);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [copyButtonLabel, setCopyButtonLabel] = useState('Copy');
  const [downloadButtonLabel, setDownloadButtonLabel] = useState('Download JSON');
  const [recentRunsJson, setRecentRunsJson] = useState('[]');
  const [lastFailedAction, setLastFailedAction] = useState('');
  const [statusTimeline, setStatusTimeline] = useState<string[]>([]);
  const [responseSummary, setResponseSummary] = useState<ResponseSummary | null>(null);

  const workflowCancelRef = useRef(false);
  const copyFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isApiKeyMissing = useMemo(() => !apiKey.trim(), [apiKey]);
  const statusClass = useMemo(() => `status-${status}`, [status]);
  const statusLabel = useMemo(() => `${statusIconMap[status] ?? '⚪'} ${status}`, [status]);

  const loadRecentRuns = useCallback(() => {
    // Pull locally saved runs from the SDK helper so users can quickly re-check prior requests.
    const runs = packmeshClient.listRecentRuns();
    setRecentRunsJson(JSON.stringify(runs, null, 2));
  }, []);

  useEffect(() => {
    // Restore API key from session storage to reduce repeated setup during a single browser session.
    const storedKey = window.sessionStorage.getItem(apiKeyStorageKey);
    if (storedKey) {
      setApiKey(storedKey);
      setRememberApiKeyForSession(true);
    }

    loadRecentRuns();
  }, [loadRecentRuns]);

  useEffect(() => {
    // Persist or clear the in-session API key based on the user's checkbox preference.
    if (rememberApiKeyForSession && apiKey.trim()) {
      window.sessionStorage.setItem(apiKeyStorageKey, apiKey);
    } else {
      window.sessionStorage.removeItem(apiKeyStorageKey);
    }
  }, [apiKey, rememberApiKeyForSession]);

  const logMessage = useCallback((message: string) => {
    // Prefix log lines with local time to make workflow timing easier to follow.
    const entry = `[${new Date().toLocaleTimeString('en-US', { hour12: false })}] ${message}`;
    setLogOutput((previous) => `${entry}\n${previous}`);
    setStatusTimeline((previous) => [entry, ...previous]);
  }, []);

  const validateApiKey = useCallback(() => {
    // Enforce API key presence before any network action to avoid predictable request failures.
    const missing = !apiKey.trim();
    setShowApiKeyValidation(missing);
    if (missing) {
      setError('Please provide an API key before sending requests.');
      return false;
    }

    return true;
  }, [apiKey]);

  const validateRequestJson = useCallback(() => {
    // Ensure request payload text is parseable JSON before using it for API calls.
    try {
      JSON.parse(requestJson);
      setJsonValidationError('');
      return true;
    } catch (jsonError) {
      setJsonValidationError(jsonError instanceof Error ? jsonError.message : 'Invalid JSON payload.');
      setError('Request JSON is invalid. Fix formatting before continuing.');
      return false;
    }
  }, [requestJson]);

  const executeWithState = useCallback(async (
    actionName: string,
    action: () => Promise<void>,
    options?: { validateJson?: boolean }
  ) => {
    // Centralized execution wrapper that handles validation, timing, and shared error state.
    if (!validateApiKey() || (options?.validateJson && !validateRequestJson())) {
      return;
    }

    // Capture elapsed time for the status strip so users can compare request durations.
    const startedAt = performance.now();
    setIsBusy(true);
    setError('');

    try {
      await action();
    } catch (actionError) {
      setStatus('failed');
      const message = actionError instanceof Error ? actionError.message : 'Unexpected error';
      setError(message);
      setLastFailedAction(actionName);
      logMessage(`${actionName} failed: ${message}`);
    } finally {
      setLastDurationMs(Math.round(performance.now() - startedAt));
      setIsBusy(false);
    }
  }, [logMessage, validateApiKey, validateRequestJson]);

  const createScenario = useCallback(async () => {
    // Create a scenario from the editor payload and move the workflow to the next step.
    await executeWithState('Create Scenario', async () => {
      const scenario = JSON.parse(requestJson) as Record<string, unknown>;
      const createdScenarioId = await packmeshClient.createScenario(scenario, apiKey);
      setScenarioId(createdScenarioId);
      setStatus('created');
      setLastFailedAction('');
      logMessage(`Scenario created: ${createdScenarioId}`);
      setActiveTab('logs');
    }, { validateJson: true });
  }, [apiKey, executeWithState, logMessage, requestJson]);

  const runScenario = useCallback(async () => {
    // Trigger a run for the current scenario and track it in local recent-run history.
    await executeWithState('Run Scenario', async () => {
      const createdRunId = await packmeshClient.runScenario(scenarioId, apiKey, requestJson);
      packmeshClient.saveRecentRun(scenarioId, createdRunId, 'queued');
      loadRecentRuns();
      setRunId(createdRunId);
      setStatus('queued');
      setLastFailedAction('');
      logMessage(`Run queued: ${createdRunId}`);
      setActiveTab('logs');
    }, { validateJson: true });
  }, [apiKey, executeWithState, loadRecentRuns, logMessage, requestJson, scenarioId]);

  const pollStatus = useCallback(async () => {
    // Fetch latest run status and pull results immediately once processing is complete.
    await executeWithState('Poll Status', async () => {
      const nextStatus = normalizeStatus(await packmeshClient.getRunStatus(scenarioId, runId, apiKey));
      packmeshClient.updateRecentRunStatus(runId, nextStatus);
      loadRecentRuns();
      setStatus(nextStatus);
      logMessage(`Status polled: ${nextStatus}`);

      if (nextStatus === 'complete') {
        const rawResults = await packmeshClient.getRunResults(scenarioId, runId, apiKey);
        const formatted = formatJsonIfPossible(rawResults);
        setResultsJson(formatted);
        setResponseSummary(buildResponseSummary(formatted));
        setActiveTab('response');
        logMessage('Fetched run results.');
      }
    });
  }, [apiKey, executeWithState, loadRecentRuns, logMessage, runId, scenarioId]);

  const getEquipmentCatalog = useCallback(async () => {
    // Retrieve merged user + default equipment catalogs so users can verify read access quickly.
    await executeWithState('Get Equipment Catalog', async () => {
      const data = await packmeshClient.getEquipmentCatalog(apiKey);
      const formatted = JSON.stringify(data, null, 2);
      setResultsJson(formatted);
      setActiveTab('response');
      logMessage(`Fetched catalog entries: packaging=${data.packaging.length}, pallets=${data.pallets.length}, shipments=${data.shipments.length}`);
    });
  }, [apiKey, executeWithState, logMessage]);

  const createCustomEquipment = useCallback(async () => {
    // Creates one custom entry for the current user then re-fetches catalog to confirm persistence.
    await executeWithState('Create Custom Equipment', async () => {
      const payload = JSON.parse(requestJson) as {
        category: 'packaging' | 'pallets' | 'shipments';
        name: string;
        description?: string;
        lengthMeters: number;
        widthMeters: number;
        heightMeters: number;
        maxPayloadKg: number;
      };
      const created = await packmeshClient.createCustomEquipment(payload, apiKey);
      logMessage(`Created custom equipment: ${created.id} (${created.name})`);
      const refreshed = await packmeshClient.getEquipmentCatalog(apiKey);
      const formatted = JSON.stringify(refreshed, null, 2);
      setResultsJson(formatted);
      setActiveTab('response');
      setLastFailedAction('');
    }, { validateJson: true });
  }, [apiKey, executeWithState, logMessage, requestJson]);

  const runFullWorkflow = useCallback(async () => {
    // One-click helper that runs create -> run -> optional polling for a guided demo flow.
    if (!validateApiKey() || !validateRequestJson()) {
      return;
    }

    workflowCancelRef.current = false;
    setIsWorkflowRunning(true);

    try {
      const scenarioPayload = JSON.parse(requestJson) as Record<string, unknown>;
      const createdScenarioId = await packmeshClient.createScenario(scenarioPayload, apiKey);
      setScenarioId(createdScenarioId);
      setStatus('created');
      setLastFailedAction('');
      logMessage(`Scenario created: ${createdScenarioId}`);

      if (workflowCancelRef.current) {
        throw new Error('Workflow canceled.');
      }

      setRequestJson(runRequestSample);
      // Use a lightweight run payload during full workflow so users can focus on lifecycle behavior.
      const createdRunId = await packmeshClient.runScenario(createdScenarioId, apiKey, runRequestSample);
      setRunId(createdRunId);
      packmeshClient.saveRecentRun(createdScenarioId, createdRunId, 'queued');
      loadRecentRuns();
      setStatus('queued');
      setLastFailedAction('');
      logMessage(`Run queued: ${createdRunId}`);
      setActiveTab('logs');

      if (!autoPollEnabled || workflowCancelRef.current) {
        return;
      }

      for (let i = 0; i < 20; i += 1) {
        // Poll with a bounded retry window so the demo cannot loop forever.
        if (workflowCancelRef.current) {
          throw new Error('Workflow canceled.');
        }

        const currentStatus = normalizeStatus(await packmeshClient.getRunStatus(createdScenarioId, createdRunId, apiKey));
        setStatus(currentStatus);
        packmeshClient.updateRecentRunStatus(createdRunId, currentStatus);
        loadRecentRuns();
        logMessage(`Status polled: ${currentStatus}`);

        if (currentStatus === 'complete') {
          const rawResults = await packmeshClient.getRunResults(createdScenarioId, createdRunId, apiKey);
          const formatted = formatJsonIfPossible(rawResults);
          setResultsJson(formatted);
          setResponseSummary(buildResponseSummary(formatted));
          setActiveTab('response');
          logMessage('Fetched run results.');
          break;
        }

        if (currentStatus === 'failed') {
          break;
        }

        await new Promise((resolve) => {
          // Space requests to avoid hammering the status endpoint.
          window.setTimeout(resolve, 1500);
        });
      }
    } catch (workflowError) {
      if (workflowError instanceof Error && workflowError.message === 'Workflow canceled.') {
        logMessage('Workflow canceled.');
        setStatus('idle');
      } else {
        const message = workflowError instanceof Error ? workflowError.message : 'Workflow failed unexpectedly.';
        setError(message);
      }
    } finally {
      setIsWorkflowRunning(false);
    }
  }, [apiKey, autoPollEnabled, loadRecentRuns, logMessage, requestJson, validateApiKey, validateRequestJson]);

  const cancelAutoPolling = useCallback(() => {
    // Signal long-running workflow loop to stop at the next safe checkpoint.
    workflowCancelRef.current = true;
    setIsWorkflowRunning(false);
    logMessage('Cancel requested.');
  }, [logMessage]);

  const retryLastFailedStep = useCallback(async () => {
    // Replay only the failed action so users can recover after fixing payloads or credentials.
    if (!lastFailedAction) {
      return;
    }

    if (lastFailedAction === 'Create Scenario') {
      await createScenario();
      return;
    }

    if (lastFailedAction === 'Run Scenario') {
      await runScenario();
      return;
    }

    if (lastFailedAction === 'Poll Status') {
      await pollStatus();
      return;
    }

    if (lastFailedAction === 'Get Equipment Catalog') {
      await getEquipmentCatalog();
      return;
    }

    if (lastFailedAction === 'Create Custom Equipment') {
      await createCustomEquipment();
    }
  }, [createScenario, createCustomEquipment, getEquipmentCatalog, lastFailedAction, pollStatus, runScenario]);

  const clearResultsPanel = useCallback(() => {
    // Reset workflow and result-state fields without modifying the current request template.
    workflowCancelRef.current = true;
    setIsWorkflowRunning(false);
    setScenarioId('');
    setRunId('');
    setStatus('idle');
    setResultsJson('');
    setError('');
    setLogOutput('');
    setActiveTab('response');
    setResultSearch('');
    setLastDurationMs(0);
    setLastFailedAction('');
    setResponseSummary(null);
    setStatusTimeline([]);
  }, []);

  const getActiveTabContent = useCallback(() => {
    // Resolve currently visible tab text for copy/download/search utilities.
    if (activeTab === 'logs') {
      return logOutput;
    }

    if (activeTab === 'raw') {
      return requestJson;
    }

    return resultsJson;
  }, [activeTab, logOutput, requestJson, resultsJson]);

  const displayWithSearch = useCallback((content: string, fallback: string) => {
    // Filter visible panel output by search query while preserving a readable fallback message.
    if (!content.trim()) {
      return fallback;
    }

    if (!resultSearch.trim()) {
      return content;
    }

    const lines = content.split('\n');
    const matches = lines.filter((line) => line.toLowerCase().includes(resultSearch.toLowerCase()));
    if (matches.length === 0) {
      return `No matches for "${resultSearch}" in this tab.`;
    }

    return matches.join('\n');
  }, [resultSearch]);

  const showButtonFeedback = useCallback((
    setter: (label: string) => void,
    timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
    activeLabel: string,
    idleLabel: string
  ) => {
    // Reusable transient label helper used by copy/download buttons.
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    setter(activeLabel);
    timerRef.current = setTimeout(() => {
      setter(idleLabel);
      timerRef.current = null;
    }, 1500);
  }, []);

  const copyActiveTab = useCallback(async () => {
    // Copy whichever tab content is currently active to clipboard for quick sharing/debugging.
    const content = getActiveTabContent();
    if (!content.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(content);
      showButtonFeedback(setCopyButtonLabel, copyFeedbackTimerRef, 'Copied!', 'Copy');
    } catch {
      setError('Copy to clipboard failed. Browser permissions may block clipboard access.');
    }
  }, [getActiveTabContent, showButtonFeedback]);

  const downloadActiveTab = useCallback(() => {
    // Download active tab content as JSON so users can archive responses and logs locally.
    const content = getActiveTabContent();
    if (!content.trim()) {
      return;
    }

    const fileName = `packmesh-${activeTab}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    // Blob + temporary anchor pattern triggers a browser download without server-side endpoints.
    const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    showButtonFeedback(setDownloadButtonLabel, downloadFeedbackTimerRef, 'Downloaded!', 'Download JSON');
  }, [activeTab, getActiveTabContent, showButtonFeedback]);

  const jumpToError = useCallback(() => {
    // Find and preview the first "error" occurrence for faster triage in large payloads/logs.
    const content = getActiveTabContent();
    const index = content.toLowerCase().indexOf('error');
    if (index < 0) {
      setError('No "error" token found in the current tab.');
      return;
    }

    const start = Math.max(0, index - 120);
    const preview = content.slice(start, start + 360);
    setError(`Jump-to-error preview:\n${preview}`);
  }, [getActiveTabContent]);

  const applyTemplate = useCallback((template: TemplateType) => {
    // Swap editor payload to selected sample and clear stale validation messages.
    setSelectedTemplate(template);
    setRequestJson(getTemplatePayload(template));
    setJsonValidationError('');
  }, []);

  const formatRequestJson = useCallback(() => {
    // Pretty-print the request editor payload for easier reading and editing.
    try {
      setRequestJson((current) => JSON.stringify(JSON.parse(current), null, 2));
      setJsonValidationError('');
    } catch {
      setJsonValidationError('Unable to format JSON because the current payload is invalid.');
    }
  }, []);

  const onApiKeyChange = useCallback((value: string) => {
    // Centralized API key update so all input methods share the same validation behavior.
    setApiKey(value);
    if (value.trim()) {
      setShowApiKeyValidation(false);
    }
  }, []);

  return (
    <main className="container">
      <h1>PackMesh Blazor API Playground</h1>
      <p className="muted">Run guided scenario workflows with live status, validation, and response tabs.</p>

      <section className="quickstart" aria-labelledby="quickstart-title">
        <h2 id="quickstart-title">Quick start (30 seconds)</h2>
        <ol>
          <li>Add an API key (use a test key where possible).</li>
          <li>Keep the <strong>Create Scenario</strong> template selected, then click <strong>Run Full Workflow</strong>.</li>
          <li>Inspect the response summary first, then use the <strong>Response</strong> and <strong>Logs</strong> tabs for full details.</li>
        </ol>
        <p className="muted compact">Tip: If a step fails, use <strong>Retry Last Failed Step</strong> with the same payload after you fix the issue.</p>
      </section>

      <div className="workspace-grid">
        <section className="panel">
          <h2>Configuration</h2>

          <label htmlFor="apiKey">API key</label>
          <div className="row wrap">
            <input
              id="apiKey"
              type={showApiKey ? 'text' : 'password'}
              className="api-key-input"
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder="pmk_live_..."
            />
            <button className="secondary" onClick={() => setShowApiKey((current) => !current)}>{showApiKey ? 'Hide' : 'Show'}</button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  const pasted = await navigator.clipboard.readText();
                  if (pasted.trim()) {
                    onApiKeyChange(pasted.trim());
                  }
                } catch {
                  setError('Clipboard paste failed. Browser permissions may block clipboard access.');
                }
              }}
            >
              Paste
            </button>
            <button className="secondary" onClick={() => {
              setApiKey('');
              setShowApiKeyValidation(true);
              window.sessionStorage.removeItem(apiKeyStorageKey);
            }}>
              Clear
            </button>
          </div>

          <div className="row wrap compact-row">
            <label className="inline-check" htmlFor="rememberApiKeyForSession">
              <input
                id="rememberApiKeyForSession"
                type="checkbox"
                checked={rememberApiKeyForSession}
                onChange={(event) => setRememberApiKeyForSession(event.target.checked)}
              />
              Remember in this browser session only
            </label>
            <span className={`api-state ${isApiKeyMissing ? 'api-state-error' : 'api-state-ok'}`} role="status" aria-live="polite">
              API Key: {isApiKeyMissing ? 'Not connected' : 'Connected ✓'}
            </span>
          </div>

          {showApiKeyValidation && <p className="validation-message">API key is required before making requests.</p>}

          <div className="editor-toolbar">
            <label htmlFor="templateSelect">Example JSON</label>
            <select
              id="templateSelect"
              value={selectedTemplate}
              onChange={(event) => applyTemplate(event.target.value as TemplateType)}
            >
              <option value="scenario">Create Scenario</option>
              <option value="run">Run Scenario</option>
              <option value="status">Poll Status</option>
              <option value="edge">Edge Case (mixed constraints)</option>
              <option value="invalid">Invalid Example (validation demo)</option>
              <option value="customEquipment">Create Custom Equipment</option>
            </select>
            <button className="secondary" onClick={formatRequestJson}>Format JSON</button>
          </div>

          <label htmlFor="payloadEditor">Request JSON</label>
          <textarea id="payloadEditor" value={requestJson} onChange={(event) => setRequestJson(event.target.value)} rows={18} className="payload-editor" />
          {jsonValidationError && <p className="validation-message">{jsonValidationError}</p>}

          <div className="steps">
            <p className="steps-title">Workflow</p>
            <ol>
              <li className={scenarioId ? 'done' : ''}>Step 1 — Create Scenario</li>
              <li className={runId ? 'done' : ''}>Step 2 — Run Scenario</li>
              <li className={status === 'complete' ? 'done' : ''}>Step 3 — Poll Status</li>
            </ol>
          </div>

          <div className="row wrap action-row">
            <button className="primary primary-blue" onClick={createScenario} disabled={isBusy || isApiKeyMissing}>Create Scenario</button>
            <button className="primary primary-green" onClick={runScenario} disabled={isBusy || isApiKeyMissing || !scenarioId}>Run Scenario</button>
            <button className="primary primary-amber" onClick={pollStatus} disabled={isBusy || isApiKeyMissing || !runId}>Poll Status</button>
            <button className="primary primary-purple" onClick={runFullWorkflow} disabled={isBusy || isApiKeyMissing}>Run Full Workflow</button>
            <button className="secondary" onClick={getEquipmentCatalog} disabled={isBusy || isApiKeyMissing}>Get Equipment Catalog</button>
            <button className="secondary" onClick={createCustomEquipment} disabled={isBusy || isApiKeyMissing}>Create Custom Equipment</button>
            <button className="secondary" onClick={cancelAutoPolling} disabled={!isWorkflowRunning}>Cancel</button>
            <label className="inline-check" htmlFor="autoPollEnabled">
              <input
                id="autoPollEnabled"
                type="checkbox"
                checked={autoPollEnabled}
                onChange={(event) => setAutoPollEnabled(event.target.checked)}
              />
              Auto-poll until completion
            </label>
            {isBusy && <span className="loading" role="status" aria-live="polite">Loading…</span>}
          </div>
        </section>

        <section className="panel">
          <h2>Actions &amp; Results</h2>

          <div className="status-meta" role="status" aria-live="polite">
            <div className="status-row">
              <span className="result">ScenarioId: {scenarioId || '-'}</span>
              <span className="result">RunId: {runId || '-'}</span>
              <span className={`badge ${statusClass}`}>{statusLabel}</span>
              {lastDurationMs > 0 && <span className="result">{lastDurationMs} ms</span>}
            </div>
            {statusTimeline.length > 0 && (
              <ul className="timeline">
                {statusTimeline.slice(0, 6).map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            )}
          </div>

          {responseSummary && (
            <div className="summary-grid">
              <span>Total rows: <strong>{responseSummary.totalRows}</strong></span>
              <span>Unique bins: <strong>{responseSummary.uniqueBins}</strong></span>
              <span>Total weight: <strong>{responseSummary.totalWeight.toFixed(2)}</strong></span>
              <span>Layers: <strong>{responseSummary.maxLayer}</strong></span>
            </div>
          )}

          <div className="tabs" role="tablist" aria-label="Result views">
            <button id="tab-response" role="tab" aria-selected={activeTab === 'response'} aria-controls="panel-response" className={activeTab === 'response' ? 'tab active' : 'tab'} onClick={() => setActiveTab('response')}>Response</button>
            <button id="tab-logs" role="tab" aria-selected={activeTab === 'logs'} aria-controls="panel-logs" className={activeTab === 'logs' ? 'tab active' : 'tab'} onClick={() => setActiveTab('logs')}>Logs</button>
            <button id="tab-raw" role="tab" aria-selected={activeTab === 'raw'} aria-controls="panel-raw" className={activeTab === 'raw' ? 'tab active' : 'tab'} onClick={() => setActiveTab('raw')}>Request Payload JSON</button>
          </div>

          <div className="row wrap compact-row">
            <input className="search-input" placeholder="Search in current tab..." value={resultSearch} onChange={(event) => setResultSearch(event.target.value)} />
            <button className="secondary" onClick={copyActiveTab}>{copyButtonLabel}</button>
            <button className="secondary" onClick={downloadActiveTab}>{downloadButtonLabel}</button>
            <button className="secondary" onClick={loadRecentRuns}>Refresh Recent Runs</button>
            <button className="secondary" onClick={clearResultsPanel}>Clear Results</button>
            <button className="secondary" onClick={jumpToError}>Jump to &quot;error&quot;</button>
            <button className="secondary" onClick={retryLastFailedStep} disabled={!lastFailedAction}>Retry Last Failed Step</button>
          </div>

          {error && <div className="error-banner" role="alert" aria-live="assertive">{error}</div>}

          <div id="panel-response" role="tabpanel" aria-labelledby="tab-response" hidden={activeTab !== 'response'}>
            <pre className="results">{displayWithSearch(resultsJson, 'No response yet.')}</pre>
          </div>
          <div id="panel-logs" role="tabpanel" aria-labelledby="tab-logs" hidden={activeTab !== 'logs'}>
            <pre className="results">{displayWithSearch(logOutput, 'No logs yet.')}</pre>
          </div>
          <div id="panel-raw" role="tabpanel" aria-labelledby="tab-raw" hidden={activeTab !== 'raw'}>
            <pre className="results">{displayWithSearch(requestJson, 'No request JSON.')}</pre>
          </div>

          <h3>Recent Runs (local)</h3>
          <pre className="results">{displayWithSearch(recentRunsJson, 'No recent runs yet.')}</pre>
        </section>
      </div>
    </main>
  );
}
