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
The browser suite fails when Chromium is unavailable so a missing browser cannot be reported
as a successful regression. For an intentional static-only diagnostic, opt in explicitly with
`ALLOW_BROWSER_SKIP=1 npm run test:browser`.

## Codex Cloud setup

Configure the Codex Cloud environment setup command as:

```bash
./.codex/setup.sh
```

This installs the locked npm dependencies and Playwright's Chromium binary. The test command
for the environment can then be `npm test`. No long-running development server is required.
# 源码维护

应用源码已按职责拆分到 `src/`。请修改源码后运行 `npm run build`，同时提交生成的 `index.html`；不要直接修改发布文件。详见 [代码维护边界](docs/code-structure.md)。

