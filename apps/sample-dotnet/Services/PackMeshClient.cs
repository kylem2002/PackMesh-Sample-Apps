using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.JSInterop;

namespace SampleDotnet.Services;

public class PackMeshClient
{
    // Local storage key used to keep a short history for developer troubleshooting.
    private const string RecentRunsStorageKey = "packmesh.sample.recentRuns";
    private const int RecentRunsLimit = 15;
    private readonly HttpClient _httpClient;
    private readonly IJSRuntime _js;
    // Allow overriding the API endpoint for local/dev environments.
    private readonly string _baseUrl = Environment.GetEnvironmentVariable("PACKMESH_BASE_URL")
        ?? "https://packmesh-api-prod-adhqddbbcnbadkhb.canadacentral-01.azurewebsites.net/api";

    // Dependencies are injected from DI so the component can stay thin/testable.
    public PackMeshClient(HttpClient httpClient, IJSRuntime js)
    {
        _httpClient = httpClient;
        _js = js;
    }

    // Centralized HTTP pipeline so all PackMesh requests share headers/retry behavior.
    private async Task<string> SendAsync(
        string method,
        string path,
        string apiKey,
        string? payload = null,
        IReadOnlyDictionary<string, string>? extraHeaders = null,
        int retries = 3)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), BuildUri(path));
        request.Headers.Authorization = new AuthenticationHeaderValue("ApiKey", apiKey);
        request.Headers.Add("X-Request-Id", $"pm-{Guid.NewGuid()}");

        if (extraHeaders is not null)
        {
            foreach (var header in extraHeaders)
            {
                request.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        if (payload is not null) request.Content = new StringContent(payload, Encoding.UTF8, "application/json");

        var response = await _httpClient.SendAsync(request);
        // Retry transient failures (rate limits and server errors) with a short backoff.
        if ((response.StatusCode == System.Net.HttpStatusCode.TooManyRequests || (int)response.StatusCode >= 500) && retries > 0)
        {
            await Task.Delay((4 - retries) * 800);
            return await SendAsync(method, path, apiKey, payload, extraHeaders, retries - 1);
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync();
    }

    // Normalizes relative paths against the configured PackMesh base URL.
    private string BuildUri(string path)
    {
        var normalizedBaseUrl = _baseUrl.TrimEnd('/');
        var normalizedPath = path.StartsWith('/') ? path : $"/{path}";
        return $"{normalizedBaseUrl}{normalizedPath}";
    }

    // Creates a scenario and returns its server-generated id for subsequent steps.
    public async Task<string> CreateScenario(string inputJson, string apiKey)
    {
        var body = await SendAsync("POST", "/v1/scenarios", apiKey, inputJson);
        using var document = System.Text.Json.JsonDocument.Parse(body);
        var root = document.RootElement;

        if (root.TryGetProperty("id", out var idProperty))
        {
            return idProperty.GetString() ?? string.Empty;
        }

        throw new KeyNotFoundException("Scenario response did not contain required property 'id'.");
    }

    // Starts a scenario run and returns runId used by polling/results APIs.
    // The runs endpoint accepts no body; pass optional idempotency through header.
    public async Task<string> RunScenario(string scenarioId, string apiKey, string? runRequestJson = null)
    {
        var idempotencyKey = $"idem-{Guid.NewGuid()}";
        if (!string.IsNullOrWhiteSpace(runRequestJson))
        {
            using var document = JsonDocument.Parse(runRequestJson);
            if (document.RootElement.TryGetProperty("idempotencyKey", out var idempotencyProperty)
                && idempotencyProperty.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(idempotencyProperty.GetString()))
            {
                idempotencyKey = idempotencyProperty.GetString()!;
            }
        }

        var body = await SendAsync(
            "POST",
            $"/v1/scenarios/{scenarioId}/runs",
            apiKey,
            payload: null,
            extraHeaders: new Dictionary<string, string>
            {
                ["Idempotency-Key"] = idempotencyKey
            });
        return JsonDocument.Parse(body).RootElement.GetProperty("runId").GetString() ?? string.Empty;
    }

    // Poll endpoint used by the playground until the run reaches a terminal state.
    public async Task<string> GetRunStatus(string scenarioId, string runId, string apiKey)
    {
        var body = await SendAsync("GET", $"/v1/scenarios/{scenarioId}/runs/{runId}", apiKey);
        return System.Text.Json.JsonDocument.Parse(body).RootElement.GetProperty("status").GetString() ?? "unknown";
    }

    // Retrieves raw result rows for the run (packaging dataset for this sample).
    public Task<string> GetRunResults(string scenarioId, string runId, string apiKey)
        => SendAsync("GET", $"/v1/scenarios/{scenarioId}/results/raw?dataset=packaging&runId={runId}", apiKey);
    // Helper endpoint for future drill-down scenarios/details in the playground.
    public Task<string> GetScenario(string scenarioId, string apiKey) => SendAsync("GET", $"/v1/scenarios/{scenarioId}", apiKey);

    // Reads merged default + user-specific equipment for packaging, pallets, and shipments.
    public Task<string> GetEquipmentCatalog(string apiKey)
        => SendAsync("GET", "/v1/catalog/equipment", apiKey);

    // Creates one custom catalog item scoped to the current user/company.
    public Task<string> CreateCustomEquipment(string payloadJson, string apiKey)
        => SendAsync("POST", "/v1/catalog/equipment/custom", apiKey, payloadJson);


    // Maintains a recency-ordered list in localStorage for quick reruns/debugging.
    public async Task SaveRecentRun(string scenarioId, string runId, string status)
    {
        var runs = await ReadRecentRunsAsync();
        runs.RemoveAll(run => run.RunId.Equals(runId, StringComparison.OrdinalIgnoreCase));
        runs.Insert(0, new RecentRun(scenarioId, runId, status, DateTimeOffset.UtcNow));
        if (runs.Count > RecentRunsLimit)
        {
            runs = runs.Take(RecentRunsLimit).ToList();
        }

        await WriteRecentRunsAsync(runs);
    }

    // Updates status in local history so the Recent Runs panel reflects progress.
    public async Task UpdateRecentRunStatus(string runId, string status)
    {
        var runs = await ReadRecentRunsAsync();
        var index = runs.FindIndex(run => run.RunId.Equals(runId, StringComparison.OrdinalIgnoreCase));
        if (index < 0)
        {
            return;
        }

        var current = runs[index];
        runs[index] = current with { Status = status, UpdatedAt = DateTimeOffset.UtcNow };
        await WriteRecentRunsAsync(runs);
    }

    // Exposes local run history as formatted JSON for UI rendering.
    public async Task<string> ListRecentRuns()
    {
        var runs = await ReadRecentRunsAsync();
        return JsonSerializer.Serialize(runs, new JsonSerializerOptions { WriteIndented = true });
    }

    // localStorage access can fail in private mode/restricted browsers, so we degrade gracefully.
    private async Task<List<RecentRun>> ReadRecentRunsAsync()
    {
        try
        {
            var raw = await _js.InvokeAsync<string?>("localStorage.getItem", RecentRunsStorageKey);
            if (string.IsNullOrWhiteSpace(raw))
            {
                return [];
            }

            return JsonSerializer.Deserialize<List<RecentRun>>(raw) ?? [];
        }
        catch
        {
            return [];
        }
    }

    // Persists recent runs snapshot to localStorage after each mutation.
    private async Task WriteRecentRunsAsync(List<RecentRun> runs)
    {
        var payload = JsonSerializer.Serialize(runs);
        await _js.InvokeVoidAsync("localStorage.setItem", RecentRunsStorageKey, payload);
    }

    // Lightweight immutable model used for serialization to/from localStorage.
    private record RecentRun(string ScenarioId, string RunId, string Status, DateTimeOffset UpdatedAt);
}
