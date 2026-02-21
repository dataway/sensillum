mod build_info;
mod config;
mod handlers;
mod server;

use config::parse_config;
use server::run_server;
use std::sync::Arc;

#[tokio::main]
async fn main() {
    println!(
        r"
        |            |          /                 /
   _____|_______   __|____ ____/_    __    __  __/_  ___
  / ___// ____/ | / / ___//  _/ /   / /   / / / /  |/  /
  \__ \/ __/ /  |/ /\__ \ / // /   / /   / / / / /|_/ /
 ___/ / /___/ /|  /___/ // // /___/ /___/ /_/ / /  / /
/____/_____/_/ |_//____/___/_____/_____/\____/_/  /_/______________________

Sensillum {}
{}

",
        build_info::full_version(),
        build_info::repository()
    );

    let config = Arc::new(parse_config());

    if config.privacy_mode {
        println!("Privacy mode enabled: server_addr, hostname, build_time and url_prefix will not be sent to clients.");
    }

    if let Err(e) = run_server(config).await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }
}
