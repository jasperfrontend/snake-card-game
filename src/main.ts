// Placeholder entrypoint. The UI is Phase 3+; for now the engine lives entirely
// in src/engine and is exercised headlessly via Vitest and simulate.ts.
const app = document.getElementById('app');
if (app) {
  app.textContent = 'Snake engine is ready. UI comes in Phase 3.';
}
