# API Key Authentication Usage

## Running the bundler with API key protection

To enable API key authentication for specific RPC methods, use the following command:

```bash
# Protect eth_sendUserOperation and boost_sendUserOperation methods
alto \
  --api-key "your-secret-api-key" \
  --protected-methods "eth_sendUserOperation,boost_sendUserOperation" \
  --entrypoints "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789" \
  --rpc-url "http://localhost:8545" \
  --executor-private-keys "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
```

## Making authenticated requests

When calling protected methods, include the API key in the `x-api-key` header:

```bash
# Example: Calling eth_sendUserOperation with API key
curl -X POST http://localhost:3000/rpc \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-secret-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "method": "eth_sendUserOperation",
    "params": [...],
    "id": 1
  }'
```

## Configuration options

- `--api-key`: The API key that clients must provide to access protected methods
- `--protected-methods`: Comma-separated list of RPC methods that require authentication

## Examples

### Protect only user operation submission:
```bash
alto --api-key "secret123" --protected-methods "eth_sendUserOperation"
```

### Protect multiple methods:
```bash
alto --api-key "secret123" --protected-methods "eth_sendUserOperation,boost_sendUserOperation,pimlico_sendUserOperationNow"
```

### No protection (default):
```bash
alto  # No --api-key flag means no authentication required
```

## WebSocket Authentication

WebSocket connections also support API key authentication for protected methods.

### Using API key in query parameter:
```javascript
const ws = new WebSocket('ws://localhost:3000/rpc?apiKey=your-secret-api-key');

ws.on('open', () => {
  ws.send(JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_sendUserOperation",
    params: [...],
    id: 1
  }));
});
```

### Using API key in headers (Node.js example):
```javascript
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/rpc', {
  headers: {
    'x-api-key': 'your-secret-api-key'
  }
});
```

### WebSocket error response for unauthorized requests:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Unauthorized: Invalid or missing API key"
  }
}
```

## Notes

- If no `--api-key` is provided, authentication is disabled
- If `--api-key` is provided but `--protected-methods` is empty, no methods are protected
- Unprotected methods can be called without an API key
- The `/health` and `/metrics` endpoints are never protected
- WebSocket connections support API key via query parameter or headers
- The same protected methods list applies to both HTTP and WebSocket endpoints