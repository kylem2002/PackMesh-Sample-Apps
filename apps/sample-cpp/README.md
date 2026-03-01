# sample-cpp

C++ playground app that mirrors the same UI/UX and workflow controls as the Blazor playground sample.

## Run

```bash
cd apps/sample-cpp
cmake -S . -B build
cmake --build build
./build/sample-cpp
```

Then open http://localhost:8081.

## Environment

- `PACKMESH_BASE_URL` (defaults to `https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api`)
- `PORT` (defaults to `8081`)
