# sample-java

Java/Spring Boot PackMesh playground app mirroring the same guided workflow used by the Blazor sample.

## Run

```bash
cd apps/sample-java
./mvnw spring-boot:run
# Windows PowerShell
.\mvnw.cmd spring-boot:run
# or if Maven is installed globally
mvn spring-boot:run
```

Then open http://localhost:8080.

## Features

- API key input with show/hide + clear controls.
- Request template selector (create scenario / run scenario / poll status).
- Full workflow actions: create, run, poll, and run-full.
- Response/log/raw tabs and local recent-runs panel.

## Environment

- API base URL defaults to production PackMesh API; adjust in `WebController` if needed.


If `mvn` is not installed, use the Maven Wrapper scripts (`mvnw`/`mvnw.cmd`) shown above; they bootstrap Maven automatically.
