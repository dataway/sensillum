use hyper::{Body, Request, Response, StatusCode, HeaderMap};
use std::sync::Arc;
use std::net::SocketAddr;
use crate::config::ServerConfig;
use super::common::build_server_info;

pub async fn handle_echo(
    _req: Request<Body>,
    headers: HeaderMap,
    config: Arc<ServerConfig>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    protocol: String,
) -> Result<Response<Body>, hyper::Error> {
    // Build server info using shared function
    let response_data = build_server_info(
        &headers,
        client_addr,
        server_addr,
        config,
        protocol,
    );

    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Headers", "*")
        .header("Access-Control-Expose-Headers", "*")
        .body(Body::from(response_data.to_string()))
        .unwrap();

    Ok(response)
}
