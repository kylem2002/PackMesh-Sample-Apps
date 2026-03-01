using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using SampleDotnet;
using SampleDotnet.Services;

// Bootstraps the WebAssembly host used by the playground.
var builder = WebAssemblyHostBuilder.CreateDefault(args);
// Mount the Blazor app into the #app element from wwwroot/index.html.
builder.RootComponents.Add<App>("#app");
// Enables dynamic updates to <head> content from Razor components.
builder.RootComponents.Add<HeadOutlet>("head::after");

// HttpClient is scoped per browser session and uses the current site origin.
builder.Services.AddScoped(sp => new HttpClient { BaseAddress = new Uri(builder.HostEnvironment.BaseAddress) });
// PackMeshClient wraps all API interactions for the playground UI.
builder.Services.AddScoped<PackMeshClient>();

// Build and start the Blazor app.
await builder.Build().RunAsync();
