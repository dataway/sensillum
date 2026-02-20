use crate::build_info;
use crate::config::ServerConfig;
use hyper::HeaderMap;
use hyper::{Body, Response, StatusCode};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::net::SocketAddr;
use std::sync::Arc;

/// Extension trait that converts a `Response` builder `Result` into a `Response`,
/// logging the error and returning a plain 500 rather than panicking.
pub trait OrInternalError {
    fn or_500(self) -> Response<Body>;
}

impl OrInternalError for Result<Response<Body>, hyper::http::Error> {
    fn or_500(self) -> Response<Body> {
        self.unwrap_or_else(|e| {
            eprintln!("Response builder error: {e}");
            Response::builder()
                .status(StatusCode::INTERNAL_SERVER_ERROR)
                .body(Body::from("Internal Server Error"))
                .expect("fallback 500 is always valid")
        })
    }
}

/// Compute SHA-256 hash and return first 16 bytes as array for insignia generation
fn compute_hash_bytes(input: &str) -> Vec<u8> {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let hash = hasher.finalize();
    // Return first 16 bytes (sufficient for insignia generation)
    hash[..16].to_vec()
}

/// Decode a percent-encoded query value ('+' → space, %XX → byte).
pub fn decode_query_value(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        match b {
            b'+' => out.push(' '),
            b'%' => {
                let h1 = bytes.next().and_then(|c| (c as char).to_digit(16));
                let h2 = bytes.next().and_then(|c| (c as char).to_digit(16));
                if let (Some(h1), Some(h2)) = (h1, h2) {
                    out.push(char::from(((h1 << 4) | h2) as u8));
                }
            }
            _ => out.push(b as char),
        }
    }
    out
}

/// Parse a query string into a simple key→value map (last value wins).
pub fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
    query
        .split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            if k.is_empty() {
                None
            } else {
                Some((decode_query_value(k), decode_query_value(v)))
            }
        })
        .collect()
}

/// Build a JSON object containing server information for client diagnostics
pub fn build_server_info(
    headers: &HeaderMap,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
    protocol: String,
) -> Value {
    // Split headers into echoed and redacted based on config.redact_prefixes.
    // Redacted headers appear in the map as {"redacted": true} rather than their value.
    let mut headers_map = serde_json::Map::new();

    for (name, value) in headers.iter() {
        let name_str = name.to_string(); // HeaderName is already lowercase
        let json_value = if config
            .redact_prefixes
            .iter()
            .any(|p| name_str.starts_with(p.as_str()))
        {
            json!({"redacted": true})
        } else {
            match value.to_str() {
                Ok(s) => json!(s),
                Err(_) => {
                    let bytes = value.as_bytes();
                    if bytes.len() <= 16 {
                        let ints: Vec<u32> = bytes.iter().map(|&b| b as u32).collect();
                        json!({"binary": true, "data": ints})
                    } else {
                        json!({"binary": true})
                    }
                }
            }
        };
        headers_map.insert(name_str, json_value);
    }

    let mut server_info = json!({
        "client_addr": client_addr.to_string(),
        "protocol": protocol,
        "version": build_info::version(),
        "headers": Value::Object(headers_map),
    });

    if !config.privacy_mode {
        server_info["server_addr"] = json!(server_addr.to_string());
        server_info["hostname"] = json!(config.hostname);
        server_info["hostname_hash"] = json!(compute_hash_bytes(&config.hostname));
        server_info["build_time"] = json!(build_info::build_time());
        server_info["url_prefix"] = json!(config.url_prefix.as_deref().unwrap_or(""));
    }

    if let Some(ref node_name) = config.node_name {
        server_info["node_name"] = json!(node_name);
        server_info["node_name_hash"] = json!(compute_hash_bytes(node_name));
    }

    server_info
}
