# sample-py (Streamlit)

## Quickstart
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
streamlit run app.py
```

## Config
- `PACKMESH_API_KEY`
- `PACKMESH_BASE_URL`
- `PACKMESH_TIMEOUT_MS`

## How it works
Uses `requests` wrapper methods matching the shared client naming contract.

## Common modifications
- Add persisted local file storage for recent runs.
- Expand error displays into dedicated UI alerts.
