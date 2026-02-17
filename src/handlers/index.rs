use hyper::{Body, Request, Response, StatusCode};
use rust_embed::RustEmbed;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::config::ServerConfig;
use super::common::build_server_info;

#[derive(RustEmbed)]
#[folder = "public/"]
pub struct Assets;

pub async fn handle_index(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Response<Body> {
    let asset = match Assets::get("index.html") {
        Some(content) => content,
        None => {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("index.html not found"))
                .unwrap();
        }
    };
    
    let html = std::str::from_utf8(&asset.data).unwrap();
    
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
    
    // Inject the server info as JavaScript variable into the HTML
    let injected_script = format!(
        "window.initialServerInfo = {};",
        server_info.to_string()
    );
    
    let modified_html = html.replace("// #SERVER_INFO_INJECTION", &injected_script);
    
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/html; charset=utf-8")
        .body(Body::from(modified_html))
        .unwrap()
}
