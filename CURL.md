# curl Test Cases

Test cases that cannot be initiated from a browser and require curl or a similar tool.  
Replace `http://localhost:3030` with the URL of the proxy under test as appropriate.

---

## WebSocket: non-GET upgrade method

Browsers always use GET for WebSocket upgrades (it's in the spec). This tests whether
a proxy passes a non-conformant upgrade through or rejects it.  
Sensillum will return `405 Method Not Allowed`; observe whether the proxy changes,
swallows, or forwards that response.

```bash
curl -v -X POST \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  http://localhost:3030/ws
```

---

## WebSocket: cross-origin connection

Browsers send an `Origin` header on all WebSocket upgrades; same-origin policy does
not block the connection itself. This simulates a cross-origin attempt.  
Sensillum will accept the connection but return `"origin_mismatch": true` with an
empty `headers` object in the initial frame.

```bash
curl -v -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  -H "Host: localhost:3030" \
  -H "Origin: http://evil.example.com" \
  http://localhost:3030/ws
```

Expected first frame: `{"origin_mismatch":true,"headers":{},...}`

---

## Large headers

Tests whether the proxy enforces a header-size limit before forwarding to the origin.
Sensillum accepts up to 16 MiB. Adjust the `python3` command to vary the payload size.

```bash
BIG=$(python3 -c "print('A' * 8192)")
curl -v -H "X-Big-Header: $BIG" http://localhost:3030/echo
```

---

## Large URL / query string

Tests whether the proxy enforces a URL-length limit.

```bash
LONG=$(python3 -c "print('a' * 8192)")
curl -v "http://localhost:3030/echo?pad=$LONG"
```

---

## HTTP/2 cleartext (h2c)

Browsers only use HTTP/2 over TLS. curl can send h2c directly using prior knowledge
(skipping the upgrade negotiation), which is useful for testing whether a proxy
supports or strips h2c.

```bash
curl -v --http2-prior-knowledge http://localhost:3030/echo
```
