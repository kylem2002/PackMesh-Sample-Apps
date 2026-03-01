import json
import os
import time
import uuid
from typing import Any, Dict

import requests

# Resolve the API base URL from environment so local/dev endpoints can be swapped in easily.
BASE_URL = os.getenv(
    "PACKMESH_BASE_URL",
    "https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api",
)
# Convert timeout milliseconds from env into seconds, which is what requests expects.
TIMEOUT = int(os.getenv("PACKMESH_TIMEOUT_MS", "20000")) / 1000


class PackMeshClient:
    """Thin API client used by the Streamlit playground."""

    def __init__(self, api_key: str):
        """Store the API key used to authorize all outbound PackMesh API calls."""
        self.api_key = api_key

    def _request(
        self,
        method: str,
        path: str,
        payload: Dict[str, Any] | None = None,
        extra_headers: Dict[str, str] | None = None,
        retries: int = 3,
    ) -> Dict[str, Any]:
        """Send one HTTP request with request ID tracing and retry handling for transient failures."""
        headers = {
            "Authorization": f"ApiKey {self.api_key}",
            "Content-Type": "application/json",
            # Stamp each API call with a unique request id to simplify backend log correlation.
            "X-Request-Id": f"pm-{uuid.uuid4()}",
        }

        if extra_headers:
            headers.update(extra_headers)

        response = requests.request(
            method,
            f"{BASE_URL}{path}",
            # Serialize payload explicitly so we can keep request construction predictable.
            data=json.dumps(payload) if payload is not None else None,
            headers=headers,
            timeout=TIMEOUT,
        )

        # Retry transient throttling/server failures using a short progressive backoff.
        if (response.status_code == 429 or response.status_code >= 500) and retries > 0:
            time.sleep((4 - retries) * 0.8)
            return self._request(method, path, payload, extra_headers, retries - 1)

        # Raise for non-success responses so caller UI can surface the exact failure details.
        response.raise_for_status()

        # Some endpoints return no body (204), so normalize to an empty object.
        if response.status_code == 204:
            return {}

        return response.json()

    def create_scenario(self, input_payload: Dict[str, Any]) -> str:
        """Create a scenario and return its identifier for subsequent run operations."""
        data = self._request("POST", "/v1/scenarios", input_payload)
        scenario_id = data.get("id") or data.get("scenarioId")
        if not scenario_id:
            raise KeyError("Scenario response did not contain 'id' or 'scenarioId'.")
        return str(scenario_id)

    def run_scenario(self, scenario_id: str, options: Dict[str, Any] | None = None) -> str:
        """Start a run for a scenario and return the server-issued run identifier."""
        config = dict(options or {})
        # Provide an idempotency key by default so accidental duplicate clicks are safe.
        idempotency_key = str(config.get("idempotencyKey") or f"idem-{uuid.uuid4()}")
        data = self._request(
            "POST",
            f"/v1/scenarios/{scenario_id}/runs",
            payload=None,
            extra_headers={"Idempotency-Key": idempotency_key},
        )
        run_id = data.get("runId")
        if not run_id:
            raise KeyError("Run response did not contain 'runId'.")
        return str(run_id)

    def get_run_status(self, scenario_id: str, run_id: str) -> Dict[str, Any]:
        """Fetch current execution status metadata for a specific scenario run."""
        return self._request("GET", f"/v1/scenarios/{scenario_id}/runs/{run_id}")

    def get_run_results(self, scenario_id: str, run_id: str) -> Dict[str, Any]:
        """Fetch raw packaging result rows for a completed run."""
        return self._request(
            "GET",
            f"/v1/scenarios/{scenario_id}/results/raw?dataset=packaging&runId={run_id}",
        )

    def get_scenario(self, scenario_id: str) -> Dict[str, Any]:
        """Retrieve the current persisted scenario payload by scenario id."""
        return self._request("GET", f"/v1/scenarios/{scenario_id}")

    def get_equipment_catalog(self) -> Dict[str, Any]:
        """Get merged user + PackMesh default packaging, pallet, and shipment equipment entries."""
        return self._request("GET", "/v1/catalog/equipment")

    def create_custom_equipment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Create one custom equipment entry in the authenticated user's catalog scope."""
        return self._request("POST", "/v1/catalog/equipment/custom", payload)
