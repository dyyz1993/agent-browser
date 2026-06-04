# Network Request Monitoring

The `network` command provides powerful network interception and monitoring capabilities for testing APIs, blocking unwanted requests, mocking responses, and debugging network behavior.

## Basic Network Monitoring

### View All Network Requests

```bash
# Start monitoring network requests
agent-browser network requests

# Clear request history
agent-browser network requests --clear

# Filter requests by URL pattern
agent-browser network requests --filter "**/api/**"
agent-browser network requests --filter "**/json"
```

### Example: Monitor API Calls

```bash
# Open a page
agent-browser open https://httpbin.org/delay/1

# View all network requests made
agent-browser network requests

# Filter to see only JSON responses
agent-browser network requests --filter "**/json"
```

## Request Interception (Routing)

### Mock API Responses

```bash
# Set up a mock response for a URL pattern
agent-browser network route "**/api/users" --body '{"users": [{"id": 1, "name": "Mock User"}]}'

# Now any request to /api/users will return the mock data
agent-browser open https://example.com

# Remove the route
agent-browser network unroute "**/api/users"
```

### Block Unwanted Requests

```bash
# Block ads or tracking scripts
agent-browser network route "**/ads/**" --abort
agent-browser network route "**/tracking/**" --abort

# Block specific domains
agent-browser network route "**/analytics.google.com/**" --abort

# Remove block
agent-browser network unroute "**/ads/**"
```

## Recording Network Activity

### During Recorder Session

```bash
# Start recording session
agent-browser recorder start --session network-test

# Navigate and perform actions
agent-browser open https://httpbin.org/get
agent-browser open https://httpbin.org/json

# View network requests during recording
agent-browser network requests
agent-browser network requests --filter "**/json"

# Stop recording
agent-browser recorder stop --output network-test.yaml
```

## Advanced Patterns

### Debug API Issues

```bash
# 1. Clear previous requests
agent-browser network requests --clear

# 2. Navigate to trigger API calls
agent-browser open https://example.com/dashboard

# 3. Check what requests were made
agent-browser network requests

# 4. Filter for specific endpoints
agent-browser network requests --filter "**/api/v1/**"
```

### Test Error Handling

```bash
# Mock error responses
agent-browser network route "**/api/critical" --body '{"error": "Service unavailable"}'

# Or block the request entirely
agent-browser network route "**/api/critical" --abort

# Test how your app handles the error
agent-browser open https://example.com
```

### Performance Testing

```bash
# Monitor requests while testing
agent-browser network requests --clear

# Perform actions
agent-browser click @e1
agent-browser wait --load networkidle

# Check how many requests were made
agent-browser network requests
```

## URL Pattern Matching

The routing uses glob patterns:

- `**/api/**` - Match any path containing /api/
- `**/api/users` - Match specific endpoint
- `**/*.json` - Match all JSON files
- `https://example.com/**` - Match specific domain
- `**/ads/**` - Match any ad URLs

## Integration with Recorder

Network monitoring works seamlessly with the recorder:

```bash
# Start recording with network monitoring
agent-browser recorder start --session my-test

# Your workflow
agent-browser open https://example.com
agent-browser snapshot -i
agent-browser click @e1

# Check network requests
agent-browser network requests

# Stop and save
agent-browser recorder stop --output test-with-network.yaml
```

## Best Practices

1. **Clear before testing**: Use `--clear` to start fresh
   ```bash
   agent-browser network requests --clear
   ```

2. **Filter effectively**: Use specific patterns to reduce noise
   ```bash
   agent-browser network requests --filter "**/api/v2/**"
   ```

3. **Clean up routes**: Always remove test routes
   ```bash
   agent-browser network unroute "**/test/**"
   ```

4. **Combine with wait**: Use network idle for comprehensive testing
   ```bash
   agent-browser click @e1
   agent-browser wait --load networkidle
   agent-browser network requests
   ```

## Use Cases

- **API Testing**: Mock responses and test error handling
- **Performance**: Monitor request count and patterns
- **Debugging**: See what requests your app makes
- **Ad Blocking**: Block unwanted requests during testing
- **Offline Testing**: Block external dependencies
- **Security**: Audit what data is being sent

## Example Test Script

```bash
#!/bin/bash

# Test network monitoring with httpbin.org

# Start browser
agent-browser open https://httpbin.org

# Clear previous requests
agent-browser network requests --clear

# Make some requests
agent-browser open https://httpbin.org/get
agent-browser open https://httpbin.org/json
agent-browser open https://httpbin.org/html

# Check all requests
agent-browser network requests

# Filter JSON requests
agent-browser network requests --filter "**/json"

# Test mocking
agent-browser network route "**/test" --body '{"mocked": true}'
agent-browser open https://httpbin.org/test
agent-browser network unroute "**/test"

# Test blocking
agent-browser network route "**/blocked" --abort

# Clean up
agent-browser close
```

## Limitations

- Routes are session-specific and reset on browser close
- Request history is stored in memory and cleared on browser close
- Mock responses only work for simple JSON bodies
- For complex mocking, consider using a dedicated API mocking service
