use hyper::{Body, Request, Response, Server, StatusCode};
use hyper::service::{make_service_fn, service_fn};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use crate::config::ServerConfig;
use crate::handlers::{index, ws, sse, lb};

pub async fn run_server(config: Arc<ServerConfig>) -> Result<(), Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    
    println!("Server bound to: {}", addr);
    
    let make_svc = make_service_fn(move |conn: &hyper::server::conn::AddrStream| {
        let client_addr = conn.remote_addr();
        let server_addr = conn.local_addr();
        let config = config.clone();
        
        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                handle_request(req, client_addr, server_addr, config.clone())
            }))
        }
    });
    
    let server = Server::bind(&addr)
        .http1_title_case_headers(true)
        .http2_initial_stream_window_size(65535)
        .http2_initial_connection_window_size(1048576)
        .serve(make_svc);
    
    println!("HTTP/1.1 and HTTP/2 (h2c) enabled");
    
    server.await?;
    
    Ok(())
}

async fn handle_request(
    req: Request<Body>,
    client_addr: SocketAddr,
    server_addr: SocketAddr,
    config: Arc<ServerConfig>,
) -> Result<Response<Body>, Infallible> {
    let path = req.uri().path();
    let headers = req.headers().clone();
    let protocol = format!("{:?}", req.version());
    
    let response = match path {
        "/" => index::handle_index(req, client_addr, server_addr, config).await,
        "/ws" => ws::handle_ws_upgrade(req, client_addr, server_addr, config).await,
        "/sse" => sse::handle_sse(req, client_addr, server_addr, config).await,
        "/lb" => lb::handle_lb(req, headers, config, client_addr, server_addr, protocol).await.unwrap(),
        _ => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not Found"))
            .unwrap(),
    };
    
    Ok(response)
}
