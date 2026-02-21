// Include build-time information
pub mod built_info {
    include!(concat!(env!("OUT_DIR"), "/built.rs"));
}

/// Cargo.toml version (e.g. "0.1.0")
pub fn version() -> &'static str {
    built_info::PKG_VERSION
}

/// UTC timestamp of this build
pub fn build_time() -> &'static str {
    built_info::BUILT_TIME_UTC
}

pub fn repository() -> &'static str {
    built_info::PKG_REPOSITORY
}

/// Short git commit hash, if available (e.g. "a1b2c3d")
pub fn git_commit() -> Option<&'static str> {
    match option_env!("SENSILLUM_GIT_COMMIT") {
        Some(s) if !s.is_empty() => Some(s),
        _ => None,
    }
}

/// The git tag pointing exactly at HEAD, if any (e.g. "v0.1.0")
pub fn git_tag() -> Option<&'static str> {
    match option_env!("SENSILLUM_GIT_TAG") {
        Some(s) if !s.is_empty() => Some(s),
        _ => None,
    }
}

/// Whether the working tree had uncommitted changes at build time
pub fn git_dirty() -> bool {
    matches!(option_env!("SENSILLUM_GIT_DIRTY"), Some("true"))
}

/// Full version string including git context.
///
/// Examples:
///   "0.1.0 @ v0.1.0 (built 2026-02-18T12:00:00Z)"
///   "0.1.0 @ a1b2c3d-dirty (built 2026-02-18T12:00:00Z)"
///   "0.1.0 (built 2026-02-18T12:00:00Z)"  ← no git info
pub fn full_version() -> String {
    let git_part = match (git_tag(), git_commit()) {
        // Exact tag takes priority
        (Some(tag), _) => {
            let dirty = if git_dirty() { "-dirty" } else { "" };
            format!(" @ {tag}{dirty}")
        }
        // Fallback: short hash
        (None, Some(hash)) => {
            let dirty = if git_dirty() { "-dirty" } else { "" };
            format!(" @ {hash}{dirty}")
        }
        (None, None) => String::new(),
    };
    format!("{}{git_part} (built {})", version(), build_time())
}
