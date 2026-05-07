# Douyin Test Scripts

Real-world test scripts for automating Douyin (douyin.com) interactions via agent-browser.

## Prerequisites

1. **Build agent-browser**:
   ```bash
   pnpm build
   ```

2. **Chrome with remote debugging** (required for both scripts):
   ```bash
   /Applications/Chromium.app/Contents/MacOS/Chromium --remote-debugging-port=9221 --user-data-dir=/tmp/chrome-debug
   ```

## Scripts

### `douyin-test.sh` - Interactive Recorder Test

Full end-to-end test that:
1. Connects to Chrome on port 9221
2. Opens douyin.com
3. Takes a snapshot of the homepage
4. Starts the recorder (15-second capture window)
5. Stops the recorder and saves the recorded flow as YAML
6. Saves navigation history

```bash
cd /path/to/agent-browser
./scripts/douyin-test.sh
```

Output is saved to `./test-workspace-<timestamp>/` with:
- `snapshot-homepage.txt` - accessibility snapshot of the homepage
- `recorded-flow.yaml` - recorded user interactions (YAML)
- `history.txt` - navigation history

After recording, you can:
- Replay: `node dist/cli.js flow run ./test-workspace-<ts>/recorded-flow.yaml`
- Export: `node dist/cli.js flow export ./test-workspace-<ts>/recorded-flow.yaml --format playwright`

### `douyin-flow-test.sh` - Flow Replay Test

Tests the self-healing flow replay system with a predefined flow:
1. Creates a sample flow YAML with navigate, wait, snapshot, evaluate, and screenshot steps
2. Connects to Chrome
3. Runs the flow with checkpoint validation

```bash
cd /path/to/agent-browser
./scripts/douyin-flow-test.sh
```

The sample flow verifies:
- Navigation to douyin.com completes
- Page title contains "抖音"
- Screenshot is captured to `./douyin-homepage.png`

## Cleanup

```bash
node dist/cli.js kill --all
rm -rf ./test-workspace-*
rm -f ./douyin-homepage.png
```
