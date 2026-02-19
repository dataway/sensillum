use hyper::{Body, Request, Response, StatusCode, header};
use std::net::SocketAddr;
use serde_json::json;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::WebSocketStream;
use futures_util::{StreamExt, SinkExt};
use std::time::Duration;
use std::sync::Arc;

use crate::config::ServerConfig;
use super::common::{build_server_info, OrInternalError};

/// Returns false only when an Origin header is present and its host[:port]
/// does not match the Host header — i.e. an explicit cross-origin browser request.
/// Requests with no Origin header (curl, server-side clients) are passed through.
fn origin_matches_host(headers: &hyper::HeaderMap) -> bool {
    let origin = match headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        Some(o) => o,
        None => return true, // no Origin → not a browser cross-origin request
    };
    let host = match headers.get(header::HOST).and_then(|v| v.to_str().ok()) {
        Some(h) => h,
        None => return false, // Origin present but no Host — reject
    };
    // Strip scheme (http://, https://, ws://, wss://) to get bare host[:port]
    let origin_host = ["https://", "http://", "wss://", "ws://"]
        .iter()
        .find_map(|scheme| origin.strip_prefix(scheme))
        .unwrap_or(origin);
    origin_host == host
}

pub async fn handle_ws_upgrade(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Response<Body> {
    // RFC 6455 §4.1: the opening handshake must be a GET request.
    if req.method() != hyper::Method::GET {
        return Response::builder()
            .status(StatusCode::METHOD_NOT_ALLOWED)
            .header("Allow", "GET")
            .body(Body::from("WebSocket upgrade requires GET"))
            .or_500();
    }

    // Check if it's a WebSocket upgrade request
    let headers = req.headers();
    let is_upgrade = headers
        .get(header::UPGRADE)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.eq_ignore_ascii_case("websocket"))
        .unwrap_or(false);
    
    if !is_upgrade {
        return Response::builder()
            .status(StatusCode::BAD_REQUEST)
            .body(Body::from("Expected WebSocket upgrade"))
            .or_500();
    }

    let origin_mismatch = !origin_matches_host(headers);

    // Perform WebSocket handshake
    let key = headers
        .get(header::SEC_WEBSOCKET_KEY)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    
    let accept = tokio_tungstenite::tungstenite::handshake::derive_accept_key(key.as_bytes());
    
    // Get HTTP protocol version
    let protocol = format!("{:?}", req.version());

    let headers_for_task = if origin_mismatch {
        hyper::HeaderMap::new()
    } else {
        headers.clone()
    };

    // Spawn task to handle the WebSocket connection
    tokio::spawn(async move {
        // Wait for the connection to be upgraded
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let ws = WebSocketStream::from_raw_socket(
                    upgraded,
                    tokio_tungstenite::tungstenite::protocol::Role::Server,
                    None,
                ).await;

                let mut server_info = build_server_info(
                    &headers_for_task,
                    client_addr,
                    server_addr,
                    config.clone(),
                    protocol.clone(),
                );

                if origin_mismatch {
                    server_info["origin_mismatch"] = json!(true);
                }

                handle_websocket(ws, server_info, client_addr, server_addr).await;
            }
            Err(e) => {
                eprintln!("WebSocket upgrade error: {}", e);
            }
        }
    });
    
    Response::builder()
        .status(StatusCode::SWITCHING_PROTOCOLS)
        .header(header::UPGRADE, "websocket")
        .header(header::CONNECTION, "Upgrade")
        .header(header::SEC_WEBSOCKET_ACCEPT, accept)
        .body(Body::empty())
        .or_500()
}

async fn handle_websocket(
    mut ws: WebSocketStream<hyper::upgrade::Upgraded>,
    mut server_info: serde_json::Value,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
) {
    let protocol = server_info.get("protocol")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    println!("WebSocket client connected from: {} to {} via {}", client_addr, server_addr, protocol);
    
    // Add type field for WebSocket protocol
    server_info["type"] = json!("headers");
    let message_obj = server_info;
    
    // Send headers as the first message
    if ws.send(Message::Text(message_obj.to_string())).await.is_err() {
        println!("Failed to send headers");
        return;
    }
    
    let mut count = 0;
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    
    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Send heartbeat
                if ws.send(Message::Text(format!("Heartbeat #{}", count))).await.is_err() {
                    break;
                }
                count += 1;
            }
            msg = ws.next() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    Some(Err(_)) => {
                        break;
                    }
                    _ => {}
                }
            }
        }
    }
    
    println!("WebSocket connection closed: {} -> {}", client_addr, server_addr);
}
