#[derive(Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub node_name: Option<String>,
    pub hostname: String,
    pub url_prefix: Option<String>,
}

pub fn parse_config() -> ServerConfig {
    let mut args = std::env::args().skip(1);
    let mut port = 3030;
    let mut node_name = None;
    let mut url_prefix = None;
    
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-p" | "--port" => {
                if let Some(port_str) = args.next() {
                    port = port_str.parse().expect("Invalid port number");
                } else {
                    eprintln!("Error: --port requires a value");
                    std::process::exit(1);
                }
            }
            "-n" | "--node" => {
                if let Some(name) = args.next() {
                    node_name = Some(name);
                } else {
                    eprintln!("Error: --node requires a value");
                    std::process::exit(1);
                }
            }
            "-x" | "--prefix" => {
                if let Some(prefix) = args.next() {
                    let prefix = prefix.trim_end_matches('/');
                    if !prefix.is_empty() && !prefix.starts_with('/') {
                        eprintln!("Error: URL prefix must start with /");
                        std::process::exit(1);
                    }
                    url_prefix = if prefix.is_empty() { None } else { Some(prefix.to_string()) };
                } else {
                    eprintln!("Error: --prefix requires a value");
                    std::process::exit(1);
                }
            }
            "-h" | "--help" => {
                println!("Usage: sensillum [OPTIONS]");
                println!("\nOptions:");
                println!("  -p, --port <PORT>    Port to listen on [default: 3030]");
                println!("  -n, --node <NAME>    Node name for identification");
                println!("  -x, --prefix <PATH>  URL prefix for reverse proxy [e.g., /api]");
                println!("  -h, --help           Print help");
                std::process::exit(0);
            }
            _ => {
                eprintln!("Error: Unknown argument '{}'", arg);
                eprintln!("Try '--help' for more information");
                std::process::exit(1);
            }
        }
    }
    
    let hostname = hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "unknown".to_string());
    
    ServerConfig {
        port,
        node_name,
        hostname,
        url_prefix,
    }
}
