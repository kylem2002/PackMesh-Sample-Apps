# sample-ts (Next.js App Router)

## Quickstart
```bash
npm install
npm run dev -w apps/sample-ts
```

## Config
- `NEXT_PUBLIC_PACKMESH_API_KEY`
- `NEXT_PUBLIC_PACKMESH_BASE_URL`
- `NEXT_PUBLIC_PACKMESH_TIMEOUT_MS`
- `NEXT_PUBLIC_PACKMESH_POLL_INTERVAL_MS`

## How it works
Calls `/v1/scenarios`, `/v1/scenarios/{id}/runs`, `/v1/scenarios/{id}/runs/{runId}`, and `/v1/scenarios/{id}/results/raw` through the `packmeshClient` wrapper.

## Common modifications
- Add scenario templates in `packages/packmesh-shared/fixtures`
- Replace simple styles with real shadcn/ui components
