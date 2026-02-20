use super::common::{parse_query, OrInternalError};
use hyper::header::HeaderValue;
use hyper::{Body, Request, Response, StatusCode};

/// Safety cap — no point generating more than 2 MiB of response headers.
const MAX_RESPONSE_HEADER_BYTES: usize = 2 * 1024 * 1024;

/// GET /hdr?byte=<hexbyte>
///
/// Response-header character test: sends back a single `x-charset-test` header whose
/// value is `probe<byte>probe` (11 bytes).  The client checks whether the proxy passed,
/// stripped, or modified the byte.
///
/// `http::HeaderValue::from_bytes` accepts 0x09 (HTAB) and 0x20–0xFF; it will reject
/// control characters and 0x7F, in which case the response body contains
/// `{"ok":false,"reason":"byte rejected by HTTP library"}`.
///
/// GET /hdr?size=N&mode=single|multi
///
/// Returns a response whose headers consume approximately `size` bytes:
///   - mode=single  → one large X-Response-Test header
///   - mode=multi   → ten headers (X-Response-Test-0 … -9) each of size/10 bytes
///
/// The client uses this to binary-search the proxy's *response* header size limit.
pub async fn handle_response_headers_test(req: Request<Body>) -> Response<Body> {
    let params = parse_query(req.uri().query().unwrap_or(""));

    // --- character-test branch ---
    if let Some(hex) = params.get("byte") {
        if let Ok(byte_val) = u8::from_str_radix(hex.trim(), 16) {
            let mut value_bytes: Vec<u8> = b"probe".to_vec();
            value_bytes.push(byte_val);
            value_bytes.extend_from_slice(b"probe");

            match HeaderValue::from_bytes(&value_bytes) {
                Ok(hv) => {
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/json")
                        .header("Access-Control-Expose-Headers", "x-charset-test")
                        .header("x-charset-test", hv)
                        .body(Body::from(format!(
                            r#"{{"ok":true,"byte":"{}"}}"#,
                            hex.trim()
                        )))
                        .or_500();
                }
                Err(_) => {
                    return Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", "application/json")
                        .body(Body::from(
                            r#"{"ok":false,"reason":"byte rejected by HTTP library"}"#,
                        ))
                        .or_500();
                }
            }
        }
    }

    let size: usize = params
        .get("size")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
        .min(MAX_RESPONSE_HEADER_BYTES);

    let mode = params.get("mode").cloned().unwrap_or_default();

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Expose-Headers", "*");

    if size > 0 {
        if mode == "multi" {
            let num_headers: usize = 10;
            let per_header = size / num_headers;
            if per_header > 0 {
                let value = "x".repeat(per_header);
                for i in 0..num_headers {
                    builder = builder.header(format!("x-response-test-{}", i), value.clone());
                }
            }
        } else {
            builder = builder.header("x-response-test", "x".repeat(size));
        }
    }

    builder.body(Body::from(r#"{"ok":true}"#)).or_500()
}
