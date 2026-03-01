#include <cstdlib>
#include <iostream>
#include <string>

#include <httplib.h>

namespace {

std::string BuildPage(const std::string& base_url) {
  // Build the single-page playground HTML and inject the API base URL at runtime.
  std::string html = R"HTML(<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PackMesh C++ API Playground</title>
  <style>
    :root { color-scheme: light; font-family: Inter, system-ui, Arial, sans-serif; }
    body { margin: 0; background: #f4f6fb; color: #0f172a; }
    h1,h2,h3 { margin: 0; }
    p { margin: 0; }
    .app { max-width: 1280px; margin: 0 auto; padding: 24px; display: grid; gap: 16px; }
    .quickstart, .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; box-shadow: 0 4px 16px rgba(15,23,42,.06); }
    .muted { color: #475569; font-size: 14px; }
    .workspace-grid { display: grid; gap: 16px; grid-template-columns: minmax(0,1fr) minmax(0,1fr); }
    .row { display: flex; gap: 10px; align-items: center; margin-top: 10px; }
    .row.wrap { flex-wrap: wrap; }
    label { display:block; margin-top: 12px; font-size: 13px; font-weight: 600; }
    input, select, textarea, button { font: inherit; }
    input, select, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background:#fff; }
    textarea { resize: vertical; min-height: 280px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    button { border: 1px solid transparent; border-radius: 8px; padding: 10px 14px; cursor: pointer; font-weight: 600; }
    .primary { color: #fff; }
    .primary-blue { background: #2563eb; }
    .primary-green { background: #059669; }
    .primary-amber { background: #d97706; }
    .primary-purple { background: #7c3aed; }
    .secondary { background: #fff; border-color: #cbd5e1; color: #334155; }
    .tabs { display:flex; gap:8px; margin:12px 0; }
    .tab { background:#e2e8f0; color:#0f172a; }
    .tab.active { background:#1d4ed8; color:#fff; }
    .results { margin:0; background:#0b1220; color:#dbeafe; border-radius:10px; padding:12px; min-height:180px; overflow:auto; }
    .summary-grid { display:grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap:8px; margin: 10px 0; color:#334155; font-size:14px; }
    .badge { border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700; background:#dbeafe; color:#1e40af; }
    .badge.complete { background:#dcfce7; color:#166534; }
    .badge.failed { background:#fee2e2; color:#991b1b; }
    .steps { margin-top: 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px; }
    .steps ol { margin: 8px 0 0 18px; padding: 0; }
    .steps li.done { color:#166534; font-weight:700; }
    @media (max-width: 1024px) { .workspace-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<div class="app">
  <h1>PackMesh C++ API Playground</h1>

  <section class="quickstart">
    <h2>Quick start (30 seconds)</h2>
    <ol>
      <li>Add an API key.</li>
      <li>Keep <strong>Create Scenario</strong> selected and click <strong>Run Full Workflow</strong>.</li>
      <li>Check summary first, then inspect full response/log payload tabs.</li>
    </ol>
  </section>

  <div class="workspace-grid">
    <section class="panel">
      <h2>Configuration</h2>
      <label for="apiKey">API key</label>
      <div class="row wrap">
        <input id="apiKey" placeholder="pmk_live_..." type="password" />
        <button class="secondary" id="toggleKey">Show</button>
        <button class="secondary" id="clearKey">Clear</button>
      </div>

      <div class="row wrap">
        <label for="templateSelect">Example JSON</label>
        <select id="templateSelect">
          <option value="scenario">Create Scenario</option>
          <option value="run">Run Scenario</option>
          <option value="status">Poll Status</option>
          <option value="customEquipment">Create Custom Equipment</option>
        </select>
      </div>

      <label for="requestJson">Request JSON</label>
      <textarea id="requestJson" class="payload-editor"></textarea>

      <div class="steps">
        <strong>Workflow</strong>
        <ol>
          <li id="stepCreate">Step 1 — Create Scenario</li>
          <li id="stepRun">Step 2 — Run Scenario</li>
          <li id="stepPoll">Step 3 — Poll Status</li>
        </ol>
      </div>

      <div class="row wrap">
        <button class="primary primary-blue" id="createBtn">Create Scenario</button>
        <button class="primary primary-green" id="runBtn">Run Scenario</button>
        <button class="primary primary-amber" id="pollBtn">Poll Status</button>
        <button class="primary primary-purple" id="fullBtn">Run Full Workflow</button>
        <button class="secondary" id="catalogBtn">Get Equipment Catalog</button>
        <button class="secondary" id="customEquipmentBtn">Create Custom Equipment</button>
      </div>
    </section>

    <section class="panel">
      <h2>Actions & Results</h2>
      <div class="row wrap">
        <span id="meta">ScenarioId: - | RunId: -</span>
        <span id="statusBadge" class="badge">idle</span>
      </div>
      <div id="summary" class="summary-grid"></div>

      <div class="tabs">
        <button class="tab active" data-tab="response">Response</button>
        <button class="tab" data-tab="logs">Logs</button>
        <button class="tab" data-tab="raw">Request Payload JSON</button>
      </div>
      <pre id="response" class="results"></pre>
      <pre id="logs" class="results" style="display:none"></pre>
      <pre id="raw" class="results" style="display:none"></pre>

      <h3 style="margin-top:12px">Recent Runs (local)</h3>
      <pre id="recent" class="results"></pre>
    </section>
  </div>
</div>
<script>
  // Base URL is supplied by the C++ server so the same UI can target different environments.
  const baseUrl = "__BASE_URL__";
  // Default template for step 1: creating a scenario.
  const scenarioPayload = `{"name":"C++ sample scenario","decisionType":"endToEnd","contents":{"orderId":"ORDER-1001","items":[{"id":"SKU-100","description":"Ceramic mug","quantity":24,"weightKg":0.35,"volumeCubicMeters":0.0018,"dimensionsCm":{"length":12,"width":9,"height":10}}]},"status":"draft","unitPreference":"metric"}`;
  // Default template for step 2: launching a run.
  const runPayload = '{"idempotencyKey":"idem-cpp-run-001"}';
  // Informational template for the status step; endpoint itself uses GET.
  const statusPayload = '{"note":"Status endpoint is GET and does not require request body."}';
  // Sample payload for creating user-specific catalog equipment and validating write access.
  const customEquipmentPayload = `{"category":"shipments","name":"C++ custom trailer","description":"Created via sample-cpp playground","lengthMeters":16.15,"widthMeters":2.59,"heightMeters":2.9,"maxPayloadKg":20500}`;
  // Small DOM helper to reduce repetitive getElementById calls.
  const el = (id) => document.getElementById(id);
  // Shared UI state used to keep IDs, status, and active tab in sync.
  const state = { scenarioId:'', runId:'', status:'idle', activeTab:'response' };
  // Start the editor with the scenario template formatted for readability.
  el('requestJson').value = JSON.stringify(JSON.parse(scenarioPayload), null, 2);

  // Prepend a timestamped line so latest events are always visible first.
  const log = (m) => { el('logs').textContent = `[${new Date().toLocaleTimeString()}] ${m}\n` + el('logs').textContent; };
  // Re-render derived UI values whenever workflow state changes.
  const refreshMeta = () => {
    el('meta').textContent = `ScenarioId: ${state.scenarioId || '-'} | RunId: ${state.runId || '-'}`;
    const badge = el('statusBadge');
    badge.textContent = state.status;
    badge.className = `badge ${state.status === 'complete' ? 'complete' : state.status === 'failed' ? 'failed' : ''}`;
    el('raw').textContent = el('requestJson').value;
    el('stepCreate').classList.toggle('done', !!state.scenarioId);
    el('stepRun').classList.toggle('done', !!state.runId);
    el('stepPoll').classList.toggle('done', state.status === 'complete');
  };

  // Generic API helper that adds auth headers, sends JSON, and surfaces non-2xx failures.
  const api = async (path, method, body, extraHeaders) => {
    const key = el('apiKey').value.trim();
    if (!key) throw new Error('API key is required.');
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { 'Content-Type':'application/json', 'X-Api-Key': key, ...(extraHeaders || {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  };

  // Persist recent run metadata in localStorage so users can inspect previous attempts.
  const storageKey = 'packmesh.sample.cpp.runs';
  const saveRecent = () => {
    const runs = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (state.runId) runs.unshift({ scenarioId: state.scenarioId, runId: state.runId, status: state.status, at: new Date().toISOString() });
    localStorage.setItem(storageKey, JSON.stringify(runs.slice(0, 8)));
    el('recent').textContent = JSON.stringify(JSON.parse(localStorage.getItem(storageKey) || '[]'), null, 2);
  };
  // Render API responses consistently as pretty JSON.
  const show = (v) => { el('response').textContent = JSON.stringify(v, null, 2); };

  // Step 1: create a scenario and capture its identifier for subsequent steps.
  async function createScenario() {
    const data = await api('/v1/scenarios', 'POST', JSON.parse(el('requestJson').value));
    state.scenarioId = data.id || data.scenarioId || '';
    state.status = 'created';
    show(data); log(`Scenario created: ${state.scenarioId}`); refreshMeta();
  }

  // Step 2: run the scenario that was just created and capture the returned run ID.
  async function runScenario() {
    if (!state.scenarioId) throw new Error('Create scenario first.');
    const runConfig = JSON.parse(el('requestJson').value || '{}');
    const idempotencyKey = String(runConfig.idempotencyKey || `idem-cpp-${Date.now()}`);
    const data = await api(`/v1/scenarios/${state.scenarioId}/runs`, 'POST', undefined, { 'Idempotency-Key': idempotencyKey });
    state.runId = data.runId || '';
    state.status = 'queued';
    show(data); log(`Run started: ${state.runId}`); refreshMeta(); saveRecent();
  }

  // Step 3: poll run status and show a compact summary when completion data is available.
  async function pollStatus() {
    if (!state.scenarioId || !state.runId) throw new Error('Run scenario first.');
    const data = await api(`/v1/scenarios/${state.scenarioId}/runs/${state.runId}`, 'GET');
    state.status = (data.status || 'unknown').toLowerCase();
    show(data); log(`Run status: ${state.status}`); refreshMeta();
    if (state.status === 'complete') {
      const rows = data?.data?.rows || [];
      el('summary').innerHTML = `<span>Total rows: <strong>${rows.length}</strong></span><span>Status: <strong>${state.status}</strong></span>`;
      saveRecent();
    }
  }


  // Fetches combined default + user-scoped equipment entries for all equipment categories.
  async function getEquipmentCatalog() {
    const data = await api('/v1/catalog/equipment', 'GET');
    show(data);
    log(`Catalog fetched: packaging=${(data.packaging || []).length}, pallets=${(data.pallets || []).length}, shipments=${(data.shipments || []).length}`);
    refreshMeta();
  }

  // Creates one custom entry for the authenticated user and then re-reads catalog entries.
  async function createCustomEquipment() {
    const created = await api('/v1/catalog/equipment/custom', 'POST', JSON.parse(el('requestJson').value));
    log(`Custom equipment created: ${created.id || 'unknown-id'}`);
    await getEquipmentCatalog();
  }

  // Convenience flow: execute create, run, and status polling in one click.
  async function fullWorkflow() {
    await createScenario();
    el('requestJson').value = runPayload;
    await runScenario();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 1500));
      await pollStatus();
      if (state.status === 'complete' || state.status === 'failed') break;
    }
  }

  // Switch the request editor between guided templates.
  el('templateSelect').addEventListener('change', (e) => {
    const map = { scenario: scenarioPayload, run: runPayload, status: statusPayload, customEquipment: customEquipmentPayload };
    el('requestJson').value = JSON.stringify(JSON.parse(map[e.target.value] || scenarioPayload), null, 2);
    refreshMeta();
  });
  // Toggle API key visibility to make copy/paste and verification easier.
  el('toggleKey').addEventListener('click', () => {
    el('apiKey').type = el('apiKey').type === 'password' ? 'text' : 'password';
    el('toggleKey').textContent = el('apiKey').type === 'password' ? 'Show' : 'Hide';
  });
  // Fast way to clear local key input without refreshing the page.
  el('clearKey').addEventListener('click', () => { el('apiKey').value = ''; });
  // Bind each action button to its async handler and log errors inline.
  el('createBtn').addEventListener('click', () => createScenario().catch((e)=>log(e.message)));
  el('runBtn').addEventListener('click', () => runScenario().catch((e)=>log(e.message)));
  el('pollBtn').addEventListener('click', () => pollStatus().catch((e)=>log(e.message)));
  el('fullBtn').addEventListener('click', () => fullWorkflow().catch((e)=>log(e.message)));
  el('catalogBtn').addEventListener('click', () => getEquipmentCatalog().catch((e)=>log(e.message)));
  el('customEquipmentBtn').addEventListener('click', () => createCustomEquipment().catch((e)=>log(e.message)));
  // Basic tab switcher for response, log, and raw request panels.
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
    state.activeTab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    ['response','logs','raw'].forEach((id) => { el(id).style.display = id === state.activeTab ? 'block' : 'none'; });
  }));

  // Hydrate recent runs from localStorage and perform initial UI sync.
  el('recent').textContent = JSON.stringify(JSON.parse(localStorage.getItem(storageKey) || '[]'), null, 2);
  refreshMeta();
</script>
</body>
</html>)HTML";

  // Replace the marker inside the HTML template with the configured API URL.
  const std::string placeholder = "__BASE_URL__";
  const std::size_t pos = html.find(placeholder);
  if (pos != std::string::npos) {
    html.replace(pos, placeholder.size(), base_url);
  }

  return html;
}

}  // namespace

int main() {
  // Allow the API target URL to be overridden via environment variable.
  const char* env_base_url = std::getenv("PACKMESH_BASE_URL");
  const std::string base_url = env_base_url == nullptr || std::string(env_base_url).empty()
                                   ? "https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api"
                                   : std::string(env_base_url);

  // Allow hosting platforms to provide the HTTP port; default for local dev is 8081.
  const char* env_port = std::getenv("PORT");
  const int port = env_port == nullptr ? 8081 : std::stoi(env_port);

  // Create a lightweight HTTP server that serves the UI and a health probe.
  httplib::Server app;
  // Serve the playground HTML at root.
  app.Get("/", [base_url](const httplib::Request&, httplib::Response& res) {
    res.set_content(BuildPage(base_url), "text/html; charset=utf-8");
  });
  // Expose a minimal readiness endpoint for container/platform checks.
  app.Get("/healthz", [](const httplib::Request&, httplib::Response& res) {
    res.set_content("ok", "text/plain; charset=utf-8");
  });

  // Log startup information, then bind to all interfaces for container compatibility.
  std::cout << "sample-cpp running at http://localhost:" << port << std::endl;
  app.listen("0.0.0.0", port);
  return 0;
}
