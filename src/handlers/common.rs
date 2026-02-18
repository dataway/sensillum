use hyper::HeaderMap;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;
use crate::config::ServerConfig;
use crate::build_info;
use sha2::{Sha256, Digest};

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
    query.split('&')
        .filter_map(|pair| {
            let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
            if k.is_empty() { None } else { Some((decode_query_value(k), decode_query_value(v))) }
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
    // Convert headers to JSON
    let headers_json: Value = headers
        .iter()
        .map(|(name, value)| {
            (
                name.to_string(),
                json!(value.to_str().unwrap_or("<binary>")),
            )
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();
    
    let mut server_info = json!({
        "client_addr": client_addr.to_string(),
        "server_addr": server_addr.to_string(),
        "hostname": config.hostname,
        "hostname_hash": compute_hash_bytes(&config.hostname),
        "protocol": protocol,
        "version": build_info::version(),
        "build_time": build_info::build_time(),
        "url_prefix": config.url_prefix.as_deref().unwrap_or(""),
        "headers": headers_json
    });
    
    if let Some(ref node_name) = config.node_name {
        server_info["node_name"] = json!(node_name);
        server_info["node_name_hash"] = json!(compute_hash_bytes(node_name));
    }
    
    server_info
}
