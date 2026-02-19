mod config;
mod handlers;
mod server;
mod build_info;

use std::sync::Arc;
use config::parse_config;
use server::run_server;

#[tokio::main]
async fn main() {
    println!(r"
   _____ _______   _______ ______    __    __  ____  ___
  / ___// ____/ | / / ___//  _/ /   / /   / / / /  |/  /
  \__ \/ __/ /  |/ /\__ \ / // /   / /   / / / / /|_/ /
 ___/ / /___/ /|  /___/ // // /___/ /___/ /_/ / /  / /
/____/_____/_/ |_//____/___/_____/_____/\____/_/  /_/
");

    println!("Sensillum {}", build_info::full_version());
    println!("{}", build_info::repository());
    
    let config = Arc::new(parse_config());
    
    if let Err(e) = run_server(config).await {
        eprintln!("Server error: {}", e);
        std::process::exit(1);
    }
}
