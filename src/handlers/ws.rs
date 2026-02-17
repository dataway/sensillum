use hyper::{Body, Request, Response, StatusCode, header};
use std::net::SocketAddr;
use serde_json::json;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::WebSocketStream;
use futures_util::{StreamExt, SinkExt};
use std::time::Duration;
use std::sync::Arc;

use crate::config::ServerConfig;
use super::common::build_server_info;

pub async fn handle_ws_upgrade(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Response<Body> {
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
            .unwrap();
    }

    // Perform WebSocket handshake
    let key = headers
        .get(header::SEC_WEBSOCKET_KEY)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    
    let accept = tokio_tungstenite::tungstenite::handshake::derive_accept_key(key.as_bytes());
    
    // Get HTTP protocol version
    let protocol = format!("{:?}", req.version());
    
    // Clone variables for spawned task (WebSocket requires separate task that outlives handler)
    let headers_clone = headers.clone();
    
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
                
                let server_info = build_server_info(
                    &headers_clone,
                    client_addr,
                    server_addr,
                    config.clone(),
                    protocol.clone(),
                );
                
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
        .unwrap()
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
