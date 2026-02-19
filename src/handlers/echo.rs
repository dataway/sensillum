use hyper::{Body, Request, Response, StatusCode, HeaderMap};
use std::sync::Arc;
use std::net::SocketAddr;
use crate::config::ServerConfig;
use super::common::{build_server_info, OrInternalError};

pub async fn handle_echo(
    _req: Request<Body>,
    headers: HeaderMap,
    config: Arc<ServerConfig>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    protocol: String,
    path: String,
    query: Option<String>,
) -> Result<Response<Body>, hyper::Error> {
    let mut response_data = build_server_info(
        &headers,
        client_addr,
        server_addr,
        config,
        protocol,
    );

    response_data["path"] = serde_json::json!(path);
    response_data["query"] = serde_json::json!(query);

    let response = Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .body(Body::from(response_data.to_string()))
        .or_500();

    Ok(response)
}
