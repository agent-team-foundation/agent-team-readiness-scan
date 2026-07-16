# Canonical agent instructions

Never edit generated files directly.

npm test -- --runInBand --project=packages/api --include=packages/api/test/integration/**/*.test.mjs --include=packages/api/test/contract/**/*.test.mjs --reporter=spec --coverage --coverage-reporter=text
