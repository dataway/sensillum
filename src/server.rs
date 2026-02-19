use hyper::{Body, Request, Response, Server, StatusCode};
use hyper::service::{make_service_fn, service_fn};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use crate::config::ServerConfig;
use crate::handlers::{index, ws, sse, lb, echo, waf, cookie, hdr};
use crate::handlers::common::OrInternalError;

// Decrement the active-connection counter when the per-connection service is dropped.
struct ConnectionGuard(Arc<AtomicUsize>);
impl Drop for ConnectionGuard {
    fn drop(&mut self) { self.0.fetch_sub(1, Ordering::Relaxed); }
}

pub async fn run_server(config: Arc<ServerConfig>) -> Result<(), Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));

    println!("Server bound to: {}", addr);

    let active = Arc::new(AtomicUsize::new(0));
    let peak   = Arc::new(AtomicUsize::new(0));

    // Log peak concurrent connections every 60 s, then reset the counter.
    let peak_log = peak.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(60));
        interval.tick().await; // skip the immediate first tick
        loop {
            interval.tick().await;
            println!("Peak concurrent connections (last 60s): {}", peak_log.swap(0, Ordering::Relaxed));
        }
    });

    let make_svc = make_service_fn(move |conn: &hyper::server::conn::AddrStream| {
        let client_addr = conn.remote_addr();
        let server_addr = conn.local_addr();
        let config = config.clone();

        // Track connection count; ConnectionGuard decrements on drop.
        let cur = active.fetch_add(1, Ordering::Relaxed) + 1;
        peak.fetch_max(cur, Ordering::Relaxed);
        let _guard = ConnectionGuard(active.clone());

        async move {
            Ok::<_, Infallible>(service_fn(move |req| {
                let _guard = &_guard; // keep guard alive for the connection lifetime
                handle_request(req, client_addr, server_addr, config.clone())
            }))
        }
    });
    
    let server = Server::bind(&addr)
        .http1_title_case_headers(true)
        .http1_max_buf_size(16 * 1024 * 1024)  // 16 MiB — raise URL and header limits
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
    let mut path = req.uri().path();
    let headers = req.headers().clone();
    let protocol = format!("{:?}", req.version());

    // Health check — always available, regardless of url_prefix.
    if path == "/healthz" {
        return Ok(Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", "text/plain")
            .body(Body::from("OK"))
            .or_500());
    }

    // Strip URL prefix if configured
    if let Some(prefix) = &config.url_prefix {
        path = path.strip_prefix(prefix)
            .map(|p| if p.is_empty() { "/" } else { p })
            .unwrap_or(""); // Empty string won't match any route
    }
    
    let response = match path {
        "/" => index::handle_index(req, client_addr, server_addr, config).await,
        "/ws" => ws::handle_ws_upgrade(req, client_addr, server_addr, config).await,
        "/sse" => sse::handle_sse(req, client_addr, server_addr, config).await,
        "/lb" => lb::handle_lb(req, headers, config, client_addr, server_addr, protocol).await.unwrap(),
        "/waf" => waf::handle_waf(req).await,
        "/delete-cookie" => cookie::handle_delete_cookie(req).await,
        "/hdr" => hdr::handle_response_headers_test(req).await,
        p if p == "/echo" || p.starts_with("/echo/") => {
            let uri = req.uri();
            let echo_path = uri.path().to_string();
            let echo_query = uri.query().map(str::to_string);
            echo::handle_echo(req, headers, config, client_addr, server_addr, protocol, echo_path, echo_query).await.unwrap()
        }
        _ => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not Found"))
            .or_500(),
    };
    
    Ok(response)
}
