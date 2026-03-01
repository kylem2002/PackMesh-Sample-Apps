const { goldenScenario, copyText } = require('..');

if (!goldenScenario || !goldenScenario.items?.length) {
  throw new Error('Golden scenario fixture missing');
}

if (!copyText.createScenario) {
  throw new Error('Copy text missing');
}

console.log('shared smoke test passed');
