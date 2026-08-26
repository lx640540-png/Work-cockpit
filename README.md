# Work Cockpit

This repository contains a single-page work cockpit and its automated regression tests.

## Local test setup

Install the Node.js dependencies and the Chromium browser used by Playwright:

```bash
npm ci
npm run setup:cloud
```

Run both regression suites with:

```bash
npm test
```

The suites can also be run independently:

```bash
npm run test:static
npm run test:browser
```

The browser regression runner starts a temporary loopback HTTP server automatically. An
explicit application URL can still be supplied as the first argument to `qa-browser.js`.

## Codex Cloud setup

Configure the Codex Cloud environment setup command as:

```bash
./.codex/setup.sh
```

This installs the locked npm dependencies and Playwright's Chromium binary. The test command
for the environment can then be `npm test`. No long-running development server is required.
