# sample-dotnet (Blazor WebAssembly)

## Quickstart
```bash
cd PackMesh-Api
./scripts/install-dotnet-sdk.sh 8.0
cd ../packmesh-sample-apps/apps/sample-dotnet
dotnet run
```

## Config
- `PACKMESH_API_KEY`
- `PACKMESH_BASE_URL` (defaults to `https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api`)

## How it works
`PackMeshClient` wraps create scenario, run, status, and results endpoints.

## Common modifications
- Use local storage JS interop for persisted recent runs/API key.
