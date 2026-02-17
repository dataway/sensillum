mod config;
mod handlers;
mod server;
mod build_info;

use std::sync::Arc;
use config::parse_config;
use server::run_server;

#[tokio::main]
async fn main() {
    println!("Sensillum {}", build_info::full_version());
    
    let config = Arc::new(parse_config());
    
    if let Err(e) = run_server(config).await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }
}
