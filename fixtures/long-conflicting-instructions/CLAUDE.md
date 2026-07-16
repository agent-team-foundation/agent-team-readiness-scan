# Alternate agent instructions

Never edit generated files directly.

npm test -- --runInBand --project=packages/web --include=packages/web/test/browser/**/*.test.mjs --include=packages/web/test/accessibility/**/*.test.mjs --reporter=dot --coverage --coverage-reporter=json
