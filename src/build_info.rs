// Include build-time information
pub mod built_info {
    include!(concat!(env!("OUT_DIR"), "/built.rs"));
}

/// Get version string
pub fn version() -> &'static str {
    built_info::PKG_VERSION
}

/// Get build timestamp
pub fn build_time() -> &'static str {
    built_info::BUILT_TIME_UTC
}

/// Get full version info for display
pub fn full_version() -> String {
    format!(
        "{} (built {})",
        version(),
        build_time()
    )
}
