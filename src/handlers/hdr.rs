use hyper::{Body, Request, Response, StatusCode};
use super::common::{parse_query, OrInternalError};

/// Safety cap — no point generating more than 2 MiB of response headers.
const MAX_RESPONSE_HEADER_BYTES: usize = 2 * 1024 * 1024;

/// GET /response-headers-test?size=N&mode=single|multi
///
/// Returns a response whose headers consume approximately `size` bytes:
///   - mode=single  → one large X-Response-Test header
///   - mode=multi   → ten headers (X-Response-Test-0 … -9) each of size/10 bytes
///
/// The client uses this to binary-search the proxy's *response* header size limit.
pub async fn handle_response_headers_test(req: Request<Body>) -> Response<Body> {
    let params = parse_query(req.uri().query().unwrap_or(""));

    let size: usize = params.get("size")
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
                    builder = builder.header(
                        format!("x-response-test-{}", i),
                        value.clone(),
                    );
                }
            }
        } else {
            builder = builder.header("x-response-test", "x".repeat(size));
        }
    }

    builder.body(Body::from(r#"{"ok":true}"#)).or_500()
}
