use hyper::{Body, Request, Response, StatusCode};
use rust_embed::RustEmbed;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::build_info;
use crate::config::ServerConfig;
use super::common::{build_server_info, OrInternalError};

#[derive(RustEmbed)]
#[folder = "generated/"]
pub struct Assets;

pub async fn handle_index(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Response<Body> {
    let header = Assets::get("header.html").expect("header.html missing from binary");
    let footer = Assets::get("footer.html").expect("footer.html missing from binary");
    let tail   = Assets::get("tail.html").expect("tail.html missing from binary");

    let protocol = format!("{:?}", req.version());
    let version_line = if config.privacy_mode {
        format!(r#"<span class="version">Sensillum v{}</span>"#, build_info::version())
    } else {
        format!(
            r#"<span class="version">Sensillum v{} (built {})</span>"#,
            build_info::full_version(),
            build_info::build_time(),
        )
    };
    let server_info = build_server_info(
        req.headers(),
        client_addr,
        server_addr,
        config,
        protocol,
    );

    let body = [
        header.data.as_ref(),
        server_info.to_string().as_bytes(),
        footer.data.as_ref(),
        version_line.as_bytes(),
        tail.data.as_ref(),
    ].concat();

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-cache, no-store, must-revalidate")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        .body(Body::from(body))
        .or_500()
}
