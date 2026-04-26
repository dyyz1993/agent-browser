# AGENTS.md

Instructions for AI coding agents working with this codebase.

## Code Style

- Do not use emojis in code, output, or documentation. Unicode symbols (✓, ✗, →, ⚠) are acceptable.
- CLI colored output uses `cli/src/color.rs`. This module respects the `NO_COLOR` environment variable. Never use hardcoded ANSI color codes.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->

## Browser Executable Path

On macOS, always use the system Chromium instead of letting Playwright download one:

```bash
export AGENT_BROWSER_EXECUTABLE_PATH=/Applications/Chromium.app/Contents/MacOS/Chromium
```

Or pass the flag directly:

```bash
agent-browser --executable-path /Applications/Chromium.app/Contents/MacOS/Chromium open <url>
```

If the environment variable is set, `--executable-path` is not needed. Verify with `agent-browser config`.
