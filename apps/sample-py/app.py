import json
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import streamlit as st

from packmesh_client import PackMeshClient

st.set_page_config(page_title="PackMesh Python API Playground", layout="wide")

# Theme overrides to mirror the two-panel, utility-heavy Blazor playground layout.
st.markdown(
    """
    <style>
      .pm-quickstart {
        border: 1px solid #d9e4ff;
        border-radius: 10px;
        background: #f7faff;
        padding: 0.8rem 1rem;
        margin-bottom: 1rem;
      }
      .pm-panel {
        border: 1px solid #d9d9d9;
        border-radius: 10px;
        background: #fafafa;
        padding: 0.75rem;
        min-height: 560px;
      }
      .pm-badge {
        display: inline-block;
        border-radius: 999px;
        font-size: 0.8rem;
        font-weight: 700;
        padding: 0.2rem 0.55rem;
        color: #fff;
      }
      .pm-status-idle { background: #717783; }
      .pm-status-created { background: #1a5fe0; }
      .pm-status-queued { background: #b66a06; }
      .pm-status-running { background: #b66a06; }
      .pm-status-complete { background: #1f7a3e; }
      .pm-status-failed { background: #aa1f3d; }
      .pm-validation {
        color: #b00020;
        font-size: 0.9rem;
        margin-top: 0.2rem;
      }
      .pm-error {
        color: #8d1328;
        background: #ffe7ec;
        border: 1px solid #ffc2cf;
        border-radius: 8px;
        padding: 0.6rem;
        font-weight: 600;
        margin: 0.4rem 0;
        white-space: pre-wrap;
      }
      .pm-summary {
        border: 1px solid #d5dde8;
        background: #fff;
        border-radius: 8px;
        padding: 0.55rem;
        margin-bottom: 0.65rem;
        font-size: 0.9rem;
      }
      .pm-steps {
        margin-top: 0.8rem;
        border: 1px dashed #c7ced9;
        border-radius: 8px;
        padding: 0.6rem 0.8rem;
        background: #fff;
      }
      .pm-muted {
        color: #555;
      }
    </style>
    """,
    unsafe_allow_html=True,
)

SCENARIO_REQUEST_SAMPLE = """{
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
    "notes": "Demo scenario from Python sample",
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
}"""

RUN_REQUEST_SAMPLE = """{\n  \"idempotencyKey\": \"idem-demo-run-001\",\n  \"note\": \"POST /v1/scenarios/{scenarioId}/runs accepts no body. This value is read by the playground and sent as the Idempotency-Key header.\"\n}"""

STATUS_REQUEST_SAMPLE = """{
  "note": "GET /v1/scenarios/{scenarioId}/runs/{runId} does not require a request body. Provide scenarioId and runId by running the scenario first."
}"""

EDGE_CASE_REQUEST_SAMPLE = """{
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
}"""

INVALID_REQUEST_SAMPLE = """{
  "name": "Bad payload for demo",
  "decisionType": "endToEnd",
  "contents": {
    "items": [
      { "id": "oops", "quantity": 1 }
    ]
  }
"""

CUSTOM_EQUIPMENT_SAMPLE = """{
  "category": "shipments",
  "name": "User demo trailer 53ft",
  "description": "Custom shipment equipment created by the Python playground",
  "lengthMeters": 16.15,
  "widthMeters": 2.59,
  "heightMeters": 2.9,
  "maxPayloadKg": 20000
}"""

TEMPLATES = {
    "Create Scenario": SCENARIO_REQUEST_SAMPLE,
    "Run Scenario": RUN_REQUEST_SAMPLE,
    "Poll Status": STATUS_REQUEST_SAMPLE,
    "Edge Case (mixed constraints)": EDGE_CASE_REQUEST_SAMPLE,
    "Invalid Example (validation demo)": INVALID_REQUEST_SAMPLE,
    "Create Custom Equipment": CUSTOM_EQUIPMENT_SAMPLE,
}


def init_state() -> None:
    """Initialize Streamlit session keys used across the playground UI."""
    defaults = {
        "api_key": "",
        "show_api_key_validation": False,
        "selected_template": "Create Scenario",
        "request_json": SCENARIO_REQUEST_SAMPLE,
        "json_validation_error": "",
        "scenario_id": "",
        "run_id": "",
        "status": "idle",
        "results_json": "",
        "log_output": "",
        "error": "",
        "active_tab": "response",
        "result_search": "",
        "last_duration_ms": 0,
        "last_failed_action": "",
        "copy_button_label": "Copy",
        "download_button_label": "Download JSON",
        "response_summary": None,
        "status_timeline": [],
        "recent_runs": [],
        "workflow_running": False,
        "auto_poll_enabled": True,
        "auto_poll_iterations": 0,
        "last_poll_epoch": 0.0,
        "copy_feedback_until": 0.0,
        "download_feedback_until": 0.0,
    }
    for key, value in defaults.items():
        if key not in st.session_state:
            st.session_state[key] = value


def now_iso() -> str:
    """Return the current UTC time in ISO-8601 format for audit-friendly metadata."""
    return datetime.now(timezone.utc).isoformat()


def log_message(message: str) -> None:
    """Prepend a timestamped log line to the in-memory log and timeline views."""
    entry = f"[{datetime.now().strftime('%H:%M:%S')}] {message}"
    st.session_state.log_output = f"{entry}\n{st.session_state.log_output}".strip()
    st.session_state.status_timeline.insert(0, entry)
    st.session_state.status_timeline = st.session_state.status_timeline[:20]


def validate_api_key() -> bool:
    """Ensure an API key is present before any API-bound action can run."""
    missing = not st.session_state.api_key.strip()
    st.session_state.show_api_key_validation = missing
    if missing:
        st.session_state.error = "Please provide an API key before sending requests."
        return False
    return True


def validate_request_json() -> bool:
    """Validate the request editor contents and surface JSON parse errors inline."""
    try:
        json.loads(st.session_state.request_json)
        st.session_state.json_validation_error = ""
        return True
    except json.JSONDecodeError as ex:
        st.session_state.json_validation_error = f"Invalid JSON: {ex}"
        st.session_state.error = st.session_state.json_validation_error
        return False


def format_request_json() -> None:
    """Pretty-print the request JSON so payloads are easier to read and edit."""
    if not validate_request_json():
        return
    st.session_state.request_json = json.dumps(json.loads(st.session_state.request_json), indent=2)
    st.session_state.error = ""


def format_json_if_possible(value: str) -> str:
    """Best-effort JSON formatter used for API responses and persisted snippets."""
    if not value.strip():
        return value
    try:
        return json.dumps(json.loads(value), indent=2)
    except json.JSONDecodeError:
        return value


def save_recent_run(scenario_id: str, run_id: str, status: str) -> None:
    """Store or refresh a recent run entry so users can quickly inspect past runs."""
    runs = st.session_state.recent_runs
    runs = [run for run in runs if run["runId"].lower() != run_id.lower()]
    runs.insert(
        0,
        {
            "scenarioId": scenario_id,
            "runId": run_id,
            "status": status,
            "updatedAt": now_iso(),
        },
    )
    st.session_state.recent_runs = runs[:15]


def update_recent_run_status(run_id: str, status: str) -> None:
    """Update one cached recent-run item when new status information arrives."""
    for run in st.session_state.recent_runs:
        if run["runId"].lower() == run_id.lower():
            run["status"] = status
            run["updatedAt"] = now_iso()
            break


def build_response_summary(raw_results: str) -> Optional[Dict[str, Any]]:
    """Create a small KPI summary from tabular run results for fast inspection."""
    if not raw_results.strip():
        return None

    try:
        payload = json.loads(raw_results)
        rows = payload.get("data", {}).get("rows")
        if not isinstance(rows, list):
            return None

        bins = set()
        total_weight = 0.0
        max_layer = 0
        for row in rows:
            if isinstance(row.get("bin"), str):
                bins.add(row["bin"])
            weight = row.get("weight")
            if isinstance(weight, (int, float)):
                total_weight += float(weight)
            layer = row.get("layer")
            if isinstance(layer, int):
                max_layer = max(max_layer, layer)

        return {
            "total_rows": len(rows),
            "unique_bins": len(bins),
            "total_weight": total_weight,
            "max_layer": max_layer,
        }
    except (TypeError, ValueError):
        return None


def display_with_search(value: str, placeholder: str) -> str:
    """Filter multiline content by search text while preserving fallback messaging."""
    base_text = value if value.strip() else placeholder
    search = st.session_state.result_search.strip()
    if not search:
        return base_text

    lines = base_text.split("\n")
    matches = [line for line in lines if search.lower() in line.lower()]
    if matches:
        return f"Matched {len(matches)} line(s) for '{search}':\n\n" + "\n".join(matches)
    return f"No matches for '{search}'.\n\n{base_text}"


def status_to_css(status: str) -> str:
    """Map API/runtime status values to CSS classes used by the status badge."""
    normalized = status.lower() if status else "idle"
    return {
        "created": "pm-status-created",
        "queued": "pm-status-queued",
        "running": "pm-status-running",
        "complete": "pm-status-complete",
        "completed": "pm-status-complete",
        "failed": "pm-status-failed",
        "idle": "pm-status-idle",
    }.get(normalized, "pm-status-idle")


def normalized_status(status: str) -> str:
    """Normalize status aliases so the UI relies on one canonical vocabulary."""
    lower = (status or "").lower()
    if lower == "completed":
        return "complete"
    if not lower:
        return "idle"
    return lower


def clear_results_panel() -> None:
    """Reset run-specific state so users can start a clean workflow."""
    st.session_state.workflow_running = False
    st.session_state.auto_poll_iterations = 0
    st.session_state.scenario_id = ""
    st.session_state.run_id = ""
    st.session_state.status = "idle"
    st.session_state.results_json = ""
    st.session_state.error = ""
    st.session_state.log_output = ""
    st.session_state.active_tab = "response"
    st.session_state.result_search = ""
    st.session_state.last_duration_ms = 0
    st.session_state.last_failed_action = ""
    st.session_state.response_summary = None
    st.session_state.status_timeline = []


def jump_to_error() -> None:
    """Show a focused snippet around the first `error` token in the active tab."""
    content = {
        "response": st.session_state.results_json,
        "logs": st.session_state.log_output,
        "raw": st.session_state.request_json,
    }.get(st.session_state.active_tab, st.session_state.results_json)

    index = content.lower().find("error")
    if index < 0:
        st.session_state.error = "No 'error' token found in the current tab."
        return

    start = max(0, index - 120)
    end = min(len(content), start + 360)
    st.session_state.error = "Jump-to-error preview:\n" + content[start:end]


def run_action(action_name: str, action, validate_json: bool = False) -> None:
    """Run an action with shared validation, timing, and error-to-UI handling."""
    if not validate_api_key() or (validate_json and not validate_request_json()):
        return

    st.session_state.error = ""
    start = time.perf_counter()

    try:
        action()
    except Exception as ex:  # noqa: BLE001 - surface errors in playground UI.
        st.session_state.status = "failed"
        st.session_state.error = str(ex)
        st.session_state.last_failed_action = action_name
        log_message(f"{action_name} failed: {ex}")
    finally:
        st.session_state.last_duration_ms = int((time.perf_counter() - start) * 1000)


def create_scenario(client: PackMeshClient) -> None:
    """Call the create-scenario API and update UI workflow markers."""
    def _inner() -> None:
        # Parse the JSON editor payload right before sending to avoid stale copies.
        st.session_state.scenario_id = client.create_scenario(json.loads(st.session_state.request_json))
        st.session_state.status = "created"
        st.session_state.last_failed_action = ""
        st.session_state.active_tab = "logs"
        log_message(f"Scenario created: {st.session_state.scenario_id}")

    run_action("Create Scenario", _inner, validate_json=True)


def run_scenario(client: PackMeshClient) -> None:
    """Queue a run for the current scenario using the payload in the request editor."""
    def _inner() -> None:
        run_request = json.loads(st.session_state.request_json)
        st.session_state.run_id = client.run_scenario(st.session_state.scenario_id, run_request)
        save_recent_run(st.session_state.scenario_id, st.session_state.run_id, "queued")
        st.session_state.status = "queued"
        st.session_state.last_failed_action = ""
        st.session_state.active_tab = "logs"
        log_message(f"Run queued: {st.session_state.run_id}")

    run_action("Run Scenario", _inner, validate_json=True)


def poll_status(client: PackMeshClient) -> None:
    """Fetch run status, then retrieve results once the run is complete."""
    def _inner() -> None:
        status_payload = client.get_run_status(st.session_state.scenario_id, st.session_state.run_id)
        new_status = normalized_status(str(status_payload.get("status", "unknown")))
        st.session_state.status = new_status
        update_recent_run_status(st.session_state.run_id, new_status)
        log_message(f"Status polled: {new_status}")

        if new_status == "complete":
            raw_results = client.get_run_results(st.session_state.scenario_id, st.session_state.run_id)
            st.session_state.results_json = format_json_if_possible(json.dumps(raw_results))
            st.session_state.response_summary = build_response_summary(st.session_state.results_json)
            st.session_state.active_tab = "response"
            log_message("Fetched run results.")

    run_action("Poll Status", _inner)



def get_equipment_catalog(client: PackMeshClient) -> None:
    """Read packaging/pallet/shipment catalog entries (user + PackMesh defaults)."""

    def _inner() -> None:
        catalog = client.get_equipment_catalog()
        st.session_state.results_json = json.dumps(catalog, indent=2)
        st.session_state.active_tab = "response"
        st.session_state.last_failed_action = ""
        packaging = len(catalog.get("packaging", []))
        pallets = len(catalog.get("pallets", []))
        shipments = len(catalog.get("shipments", []))
        log_message(
            f"Catalog fetched: packaging={packaging}, pallets={pallets}, shipments={shipments}"
        )

    run_action("Get Equipment Catalog", _inner)


def create_custom_equipment(client: PackMeshClient) -> None:
    """Create one custom user equipment entry and then re-read the catalog to verify it."""

    def _inner() -> None:
        payload = json.loads(st.session_state.request_json)
        created = client.create_custom_equipment(payload)
        log_message(f"Created custom equipment: {created.get('id', 'unknown')} ({created.get('name', 'unnamed')})")
        refreshed_catalog = client.get_equipment_catalog()
        st.session_state.results_json = json.dumps(refreshed_catalog, indent=2)
        st.session_state.active_tab = "response"
        st.session_state.last_failed_action = ""

    run_action("Create Custom Equipment", _inner, validate_json=True)


def retry_last_failed_step(client: PackMeshClient) -> None:
    """Replay the most recent failed API step to speed up iterative debugging."""
    action = st.session_state.last_failed_action
    if action == "Create Scenario":
        create_scenario(client)
    elif action == "Run Scenario":
        run_scenario(client)
    elif action == "Poll Status":
        poll_status(client)
    elif action == "Get Equipment Catalog":
        get_equipment_catalog(client)
    elif action == "Create Custom Equipment":
        create_custom_equipment(client)


def run_full_workflow(client: PackMeshClient) -> None:
    """Execute create→run and optionally enable the auto-poll continuation loop."""
    if not validate_api_key() or not validate_request_json():
        return

    st.session_state.workflow_running = True
    st.session_state.auto_poll_iterations = 0

    create_scenario(client)
    if st.session_state.status == "failed":
        st.session_state.workflow_running = False
        return

    st.session_state.request_json = RUN_REQUEST_SAMPLE
    run_scenario(client)
    if st.session_state.status == "failed":
        st.session_state.workflow_running = False
        return

    if not st.session_state.auto_poll_enabled:
        st.session_state.workflow_running = False
        return

    st.session_state.last_poll_epoch = 0.0


def maybe_continue_workflow(client: PackMeshClient) -> None:
    """Drive auto-poll execution between reruns until completion or timeout."""
    if not st.session_state.workflow_running:
        return

    if st.session_state.status in {"complete", "failed"}:
        st.session_state.workflow_running = False
        return

    if st.session_state.auto_poll_iterations >= 20:
        st.session_state.workflow_running = False
        log_message("Auto-poll reached max attempts (20).")
        return

    now = time.time()
    if now - st.session_state.last_poll_epoch < 1.5:
        return

    st.session_state.last_poll_epoch = now
    st.session_state.auto_poll_iterations += 1
    poll_status(client)

    if st.session_state.status in {"complete", "failed"}:
        st.session_state.workflow_running = False
        return

    time.sleep(0.2)
    st.rerun()


def active_tab_content() -> str:
    """Return raw content shown in the currently selected result tab."""
    return {
        "response": st.session_state.results_json,
        "logs": st.session_state.log_output,
        "raw": st.session_state.request_json,
    }.get(st.session_state.active_tab, st.session_state.results_json)


def apply_template() -> None:
    """Load a canned JSON template into the editor and clear run artifacts."""
    st.session_state.request_json = TEMPLATES[st.session_state.selected_template]
    st.session_state.json_validation_error = ""
    st.session_state.error = ""
    clear_results_panel()


def on_template_change() -> None:
    """React to template dropdown changes with a full template application."""
    apply_template()


def clear_api_key() -> None:
    """Clear API-key-related session values and re-enable validation hints."""
    st.session_state.api_key = ""
    st.session_state.remembered_api_key = ""
    st.session_state.show_api_key_validation = True


def on_api_key_changed() -> None:
    """Sync remembered-key storage only when users opt into session persistence."""
    if st.session_state.api_key.strip():
        st.session_state.show_api_key_validation = False

    if st.session_state.remember_api_key:
        st.session_state.remembered_api_key = st.session_state.api_key


def on_remember_api_key_changed() -> None:
    """Apply remember-toggle behavior immediately so checkbox has a clear effect."""
    if st.session_state.remember_api_key:
        st.session_state.remembered_api_key = st.session_state.api_key
        return

    st.session_state.remembered_api_key = ""
    st.session_state.api_key = ""
    st.session_state.show_api_key_validation = True


def on_api_key_changed() -> None:
    """Keep validation state in sync as users edit their API key."""
    if st.session_state.api_key.strip():
        st.session_state.show_api_key_validation = False


def reset_expired_button_labels() -> None:
    """Return temporary feedback button labels back to their default text."""
    now = time.time()
    if now >= st.session_state.copy_feedback_until:
        st.session_state.copy_button_label = "Copy"
    if now >= st.session_state.download_feedback_until:
        st.session_state.download_button_label = "Download JSON"


def set_copy_feedback() -> None:
    """Set short-lived copy feedback text so users know click intent was captured."""
    st.session_state.copy_button_label = "Copied!"
    st.session_state.copy_feedback_until = time.time() + 1.8


def set_download_feedback() -> None:
    """Set short-lived download feedback text for immediate UI acknowledgement."""
    st.session_state.download_button_label = "Downloading..."
    st.session_state.download_feedback_until = time.time() + 1.8


# Bootstrap all state before rendering any widgets that depend on session data.
init_state()
# Expire temporary button labels during reruns so captions self-heal.
reset_expired_button_labels()

if st.session_state.remember_api_key and st.session_state.remembered_api_key and not st.session_state.api_key:
    # Restore remembered key once per session so users do not re-enter credentials.
    st.session_state.api_key = st.session_state.remembered_api_key

st.title("PackMesh Python API Playground")
st.markdown(
    "<p class='pm-muted'>Run guided scenario workflows with live status, validation, and response tabs.</p>",
    unsafe_allow_html=True,
)

st.markdown(
    """
    <section class="pm-quickstart">
      <h2 style="margin:0 0 0.35rem 0; font-size:1.15rem;">Quick start (30 seconds)</h2>
      <ol>
        <li>Add an API key (use a test key where possible).</li>
        <li>Keep the <strong>Create Scenario</strong> template selected, then click <strong>Run Full Workflow</strong>.</li>
        <li>Inspect the response summary first, then use the <strong>Response</strong> and <strong>Logs</strong> tabs for full details.</li>
      </ol>
      <p class="pm-muted" style="margin:0.2rem 0 0;">Tip: If a step fails, use <strong>Retry Last Failed Step</strong> with the same payload after you fix the issue.</p>
    </section>
    """,
    unsafe_allow_html=True,
)

left_col, right_col = st.columns(2, gap="large")

with left_col:
    with st.container(border=True):
        st.subheader("Configuration")

        api_key_value = st.text_input(
            "API key",
            type="password",
            placeholder="pmk_live_...",
            key="api_key",
            on_change=on_api_key_changed,
        )

        if api_key_value.strip() and not st.session_state.remember_api_key:
            st.session_state.show_api_key_validation = False

        key_controls = st.columns([1, 3])
        key_controls[0].button("Clear", on_click=clear_api_key)

        state_text = "Not connected" if not st.session_state.api_key.strip() else "Connected ✓"
        state_color = "#9f2a1d" if not st.session_state.api_key.strip() else "#1f7a3e"
        st.markdown(
            f"<p style='margin:0.25rem 0 0; font-weight:600; color:{state_color};'>API Key: {state_text}</p>",
            unsafe_allow_html=True,
        )

        if st.session_state.show_api_key_validation:
            st.markdown("<p class='pm-validation'>API key is required before making requests.</p>", unsafe_allow_html=True)

        st.selectbox(
            "Example JSON",
            list(TEMPLATES.keys()),
            index=list(TEMPLATES.keys()).index(st.session_state.selected_template),
            key="selected_template",
            on_change=on_template_change,
        )

        if st.button("Format JSON"):
            format_request_json()

        st.text_area(
            "Request JSON",
            height=340,
            key="request_json",
        )

        if st.session_state.json_validation_error:
            st.markdown(
                f"<p class='pm-validation'>{st.session_state.json_validation_error}</p>",
                unsafe_allow_html=True,
            )

        st.markdown("<div class='pm-steps'><strong>Workflow</strong>", unsafe_allow_html=True)
        step1_done = bool(st.session_state.scenario_id)
        step2_done = bool(st.session_state.run_id)
        step3_done = st.session_state.status == "complete"
        st.markdown(
            "\n".join(
                [
                    f"1. {'✅' if step1_done else '⬜'} Step 1 — Create Scenario",
                    f"2. {'✅' if step2_done else '⬜'} Step 2 — Run Scenario",
                    f"3. {'✅' if step3_done else '⬜'} Step 3 — Poll Status",
                ]
            )
        )
        st.markdown("</div>", unsafe_allow_html=True)

        if st.session_state.api_key.strip():
            # Always create the client from current state to avoid stale API keys.
            client = PackMeshClient(st.session_state.api_key)
        else:
            client = PackMeshClient("")

        action_row_1 = st.columns(4)
        if action_row_1[0].button("Create Scenario", use_container_width=True):
            create_scenario(client)
        if action_row_1[1].button("Run Scenario", use_container_width=True, disabled=not st.session_state.scenario_id):
            run_scenario(client)
        if action_row_1[2].button("Poll Status", use_container_width=True, disabled=not st.session_state.run_id):
            poll_status(client)
        if action_row_1[3].button("Run Full Workflow", use_container_width=True):
            run_full_workflow(client)

        action_row_2 = st.columns([1, 1, 2, 2])
        if action_row_2[0].button("Cancel", use_container_width=True, disabled=not st.session_state.workflow_running):
            st.session_state.workflow_running = False
            st.session_state.status = "idle"
            log_message("Cancel requested.")
        if action_row_2[1].button("Get Equipment Catalog", use_container_width=True):
            get_equipment_catalog(client)
        if action_row_2[2].button("Create Custom Equipment", use_container_width=True):
            create_custom_equipment(client)

        action_row_2[3].checkbox(
            "Auto-poll until completion",
            key="auto_poll_enabled",
        )

        if st.session_state.workflow_running:
            st.info("Workflow running…")

with right_col:
    with st.container(border=True):
        st.subheader("Actions & Results")

        status_css = status_to_css(st.session_state.status)
        status_label = st.session_state.status or "idle"
        duration_part = f" • {st.session_state.last_duration_ms} ms" if st.session_state.last_duration_ms > 0 else ""
        st.markdown(
            f"""
            <div style="margin-bottom:0.35rem; font-family: ui-monospace, monospace; font-size:0.9rem;">
              ScenarioId: {st.session_state.scenario_id or '-'}<br/>
              RunId: {st.session_state.run_id or '-'}<br/>
              <span class="pm-badge {status_css}">{status_label}</span>{duration_part}
            </div>
            """,
            unsafe_allow_html=True,
        )

        if st.session_state.status_timeline:
            st.caption("Recent timeline")
            for entry in st.session_state.status_timeline[:6]:
                st.markdown(f"- {entry}")

        summary = st.session_state.response_summary
        if summary:
            st.markdown(
                f"""
                <div class="pm-summary">
                  Total rows: <strong>{summary['total_rows']}</strong> &nbsp; | &nbsp;
                  Unique bins: <strong>{summary['unique_bins']}</strong> &nbsp; | &nbsp;
                  Total weight: <strong>{summary['total_weight']:.2f}</strong> &nbsp; | &nbsp;
                  Layers: <strong>{summary['max_layer']}</strong>
                </div>
                """,
                unsafe_allow_html=True,
            )

        st.radio(
            "Result views",
            options=["response", "logs", "raw"],
            format_func=lambda x: {
                "response": "Response",
                "logs": "Logs",
                "raw": "Request Payload JSON",
            }[x],
            horizontal=True,
            index=["response", "logs", "raw"].index(st.session_state.active_tab),
            key="active_tab",
        )

        st.text_input(
            "Search in current tab...",
            key="result_search",
        )

        utility_row = st.columns(6)
        active_content = active_tab_content()
        utility_row[0].download_button(
        st.session_state.download_button_label,
        data=active_content.encode("utf-8"),
        file_name=f"packmesh-{st.session_state.active_tab}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json",
        mime="application/json",
        use_container_width=True,
        disabled=not active_content.strip(),
        on_click=set_download_feedback,
    )
        if utility_row[1].button(st.session_state.copy_button_label, use_container_width=True):
            if active_content.strip():
                set_copy_feedback()
                st.toast("Copy requested for current tab.")
            else:
                st.toast("Nothing to copy.")

        if utility_row[2].button("Refresh Recent Runs", use_container_width=True):
            st.toast("Recent runs are updated live in this session.")
        if utility_row[3].button("Clear Results", use_container_width=True):
            clear_results_panel()
            st.rerun()
        if utility_row[4].button('Jump to "error"', use_container_width=True):
            jump_to_error()
        if utility_row[5].button(
            "Retry Last Failed Step",
            use_container_width=True,
            disabled=not st.session_state.last_failed_action,
        ):
            retry_last_failed_step(client)

        if st.session_state.error:
            st.markdown(f"<div class='pm-error'>{st.session_state.error}</div>", unsafe_allow_html=True)

        if st.session_state.active_tab == "response":
            st.code(display_with_search(st.session_state.results_json, "No response yet."), language="json")
        elif st.session_state.active_tab == "logs":
            st.code(display_with_search(st.session_state.log_output, "No logs yet."), language="text")
        else:
            st.code(display_with_search(st.session_state.request_json, "No request JSON."), language="json")

        st.markdown("### Recent Runs (local)")
        st.code(
            display_with_search(
                json.dumps(st.session_state.recent_runs, indent=2),
                "No recent runs yet.",
            ),
            language="json",
        )

# Continue workflow at the end so UI updates are fully rendered before rerun logic.
maybe_continue_workflow(client)
