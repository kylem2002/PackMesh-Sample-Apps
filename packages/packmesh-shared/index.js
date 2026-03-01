const goldenScenario = require('./fixtures/golden-scenario.json');

const copyText = {
  createScenario: 'Create a PackMesh scenario from UI or JSON editor.',
  runScenario: 'Run a scenario with idempotency and robust retry logic.',
  pollRun: 'Poll scenario execution status and handle retries/cancel.',
  results: 'Inspect output summary, raw JSON, and artifacts.'
};

module.exports = {
  goldenScenario,
  copyText
};
