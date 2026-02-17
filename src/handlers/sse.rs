use hyper::{Body, Request, Response, StatusCode};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::time::interval;

use crate::config::ServerConfig;
use super::common::build_server_info;

pub async fn handle_sse(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Response<Body> {
    println!("SSE client connected from: {} to {}", client_addr, server_addr);
    
    // Get HTTP protocol version
    let protocol = format!("{:?}", req.version());
    
    // Build server info using shared function
    let server_info = build_server_info(
        req.headers(),
        client_addr,
        server_addr,
        config,
        protocol,
    );
    
    // Create the SSE stream
    let stream = async_stream::stream! {
        // Send initial connection info
        let info_event = format!(
            "event: headers\ndata: {}\n\n",
            server_info.to_string()
        );
        yield Ok::<_, hyper::Error>(info_event);
        
        // Send heartbeats every 5 seconds
        let mut count = 0;
        let mut tick = interval(Duration::from_secs(5));
        
        loop {
            tick.tick().await;
            let heartbeat = format!("data: Heartbeat #{}\n\n", count);
            yield Ok(heartbeat);
            count += 1;
        }
    };
    
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .header("Connection", "keep-alive")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::wrap_stream(stream))
        .unwrap()
}
