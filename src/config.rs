/// Headers to redact by default. Must be lower case.
const DEFAULT_REDACT_PREFIXES: &[&str] = &["x-origin-secret"];

#[derive(Clone)]
pub struct ServerConfig {
    pub port: u16,
    pub node_name: Option<String>,
    pub hostname: String,
    pub url_prefix: Option<String>,
    pub redact_prefixes: Vec<String>,
    pub privacy_mode: bool,
}

pub fn parse_config() -> ServerConfig {
    // Seed defaults from environment variables; CLI args override below.
    let mut port: u16 = std::env::var("SENSILLUM_PORT")
        .ok()
        .map(|v| {
            v.parse().unwrap_or_else(|_| {
                eprintln!("Error: SENSILLUM_PORT is not a valid port number");
                std::process::exit(1);
            })
        })
        .unwrap_or(3030);

    let mut node_name: Option<String> = std::env::var("SENSILLUM_NODE").ok();

    let mut url_prefix: Option<String> = std::env::var("SENSILLUM_PREFIX")
        .ok()
        .map(|v| parse_prefix(&v));

    let mut privacy_mode: bool = std::env::var("SENSILLUM_PRIVACY").is_ok_and(|v| !v.is_empty());

    let mut redact_prefixes: Vec<String> = std::env::var("SENSILLUM_REDACT")
        .map(|v| {
            v.split(|c| c == ',' || c == ' ')
                .map(|s| s.trim().to_lowercase())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_else(|_| {
            DEFAULT_REDACT_PREFIXES
                .iter()
                .map(|s| s.to_string())
                .collect()
        });
    let mut redact_from_cli: Vec<String> = Vec::new();

    // Now parse CLI args, which override environment variables.
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-p" | "--port" => {
                if let Some(port_str) = args.next() {
                    port = port_str.parse().unwrap_or_else(|_| {
                        eprintln!("Error: Invalid port number '{port_str}'");
                        std::process::exit(1);
                    });
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
                    url_prefix = Some(parse_prefix(&prefix));
                } else {
                    eprintln!("Error: --prefix requires a value");
                    std::process::exit(1);
                }
            }
            "-P" | "--privacy" => {
                privacy_mode = true;
            }
            "-r" | "--redact" => {
                if let Some(prefix) = args.next() {
                    redact_from_cli.push(prefix.to_lowercase());
                } else {
                    eprintln!("Error: --redact requires a value");
                    std::process::exit(1);
                }
            }
            "-h" | "--help" => {
                println!("Usage: sensillum [OPTIONS]");
                println!("\nOptions:");
                println!("  -p, --port <PORT>      Port to listen on [default: 3030]");
                println!("  -n, --node <NAME>      Node name for identification");
                println!("  -x, --prefix <PATH>    URL prefix for reverse proxy [e.g., /api]");
                println!("  -r, --redact <PREFIX>  Header prefix to redact (repeatable) [default: x-origin-secret]");
                println!("  -P, --privacy          Suppress server-identifying fields from client responses");
                println!("  -h, --help             Print help");
                println!("\nEnvironment variables (overridden by CLI flags):");
                println!("  SENSILLUM_PORT         Same as --port");
                println!("  SENSILLUM_NODE         Same as --node");
                println!("  SENSILLUM_PREFIX       Same as --prefix");
                println!("  SENSILLUM_REDACT       Comma/space-separated list of prefixes, same as --redact");
                println!("  SENSILLUM_PRIVACY      Set to enable privacy mode");
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

    // CLI --redact flags replace the env-var/default list entirely.
    if !redact_from_cli.is_empty() {
        redact_prefixes = redact_from_cli;
    }

    ServerConfig {
        port,
        node_name,
        hostname,
        url_prefix,
        redact_prefixes,
        privacy_mode,
    }
}

/// Validate and normalise a URL prefix string: strip trailing slashes,
/// require a leading `/` (unless the result is empty, which maps to `None`).
fn parse_prefix(raw: &str) -> String {
    let prefix = raw.trim_end_matches('/');
    if !prefix.is_empty() && !prefix.starts_with('/') {
        eprintln!("Error: URL prefix must start with /");
        std::process::exit(1);
    }
    prefix.to_string()
}
