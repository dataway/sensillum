fn main() {
    built::write_built_file().expect("Failed to acquire build-time information");

    /////////////////////////////////////////////////////////////////////////////
    // Assemble public/index.html from the source parts under public/src/

    let src_dir = std::path::Path::new("public/src");

    // Collect subdirectories and sort alphanumerically
    let mut subdirs: Vec<std::path::PathBuf> = std::fs::read_dir(src_dir)
        .expect("Failed to read public/src/")
        .filter_map(|e| {
            let e = e.ok()?;
            e.file_type().ok()?.is_dir().then(|| e.path())
        })
        .collect();
    subdirs.sort();

    // Watch the directory itself so that adding/removing a subdir triggers rebuild
    println!("cargo:rerun-if-changed=public/src");

    let css = collect(&subdirs, "css", "/* ", " */");
    let body = collect(&subdirs, "html", "<!-- ", " -->");
    let js = collect(&subdirs, "js", "// ", "");

    let waf_payloads_js = process_waf_payloads();

    // Split the output around the server-info injection point so that
    // index.rs can sandwich the runtime-generated JSON between two static
    // byte slices without any string scanning at request time.
    let header = format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sensillum - Web Proxy Tester</title>
<style>{css}
</style>
<script>window.initialServerInfo = "#
    );

    let footer = format!(
        r#";</script>
</head>
<body>
{body}
<div class="footer">"#
    );

    let tail = format!(
        r#"</div>
<script>
{waf_payloads_js}
{js}
</script>
</body>
</html>
"#
    );

    std::fs::create_dir_all("generated").expect("Failed to create generated/");
    std::fs::write("generated/header.html", header).expect("Failed to write generated/header.html");
    std::fs::write("generated/footer.html", footer).expect("Failed to write generated/footer.html");
    std::fs::write("generated/tail.html", tail).expect("Failed to write generated/tail.html");
}

// Concatenate the contents of all files with the given extension found under
// subdirs (visited in order).  Emits cargo:rerun-if-changed for each file.
fn collect(
    subdirs: &[std::path::PathBuf],
    ext: &str,
    file_prefix: &str,
    file_suffix: &str,
) -> String {
    let mut out = String::new();
    for dir in subdirs {
        let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("Failed to read {}: {e}", dir.display()))
            .filter_map(|e| {
                let e = e.ok()?;
                let path = e.path();
                (path.extension()?.to_str()? == ext).then_some(path)
            })
            .collect();
        files.sort();
        for file in files {
            println!("cargo:rerun-if-changed={}", file.display());
            if cfg!(debug_assertions) {
                out.push_str(
                    format!("\n{}{}{}\n", file_prefix, file.display(), file_suffix).as_str(),
                );
            } else {
                out.push_str("\n");
            }
            out.push_str(
                &std::fs::read_to_string(&file)
                    .unwrap_or_else(|e| panic!("Failed to read {}: {e}", file.display())),
            );
        }
    }
    out
}

// Read public/src/waf-payloads.json once, then:
//  - return a JS snippet defining WAF_KEY and WAF_PAYLOADS (XOR-encoded) for the frontend
//  - write generated/waf_payloads.rs with a static Rust array for the /waf handler
fn process_waf_payloads() -> String {
    const KEY: u8 = 0x5A;
    let path = "public/src/waf-payloads.json";
    println!("cargo:rerun-if-changed={path}");
    let content =
        std::fs::read_to_string(path).unwrap_or_else(|e| panic!("Failed to read {path}: {e}"));
    let entries: Vec<serde_json::Map<String, serde_json::Value>> =
        serde_json::from_str(&content).expect("Invalid waf-payloads.json");

    // --- JS output (XOR-encoded) ---
    let mut js = format!("const WAF_KEY = {KEY};\nconst WAF_PAYLOADS = [\n");
    for entry in &entries {
        js.push_str("  {");
        for (k, v) in entry {
            if k == "payload" {
                let s = v.as_str().expect("payload must be a string");
                let data: Vec<String> = s.bytes().map(|b| (b ^ KEY).to_string()).collect();
                js.push_str(&format!(" data: [{}],", data.join(",")));
            } else {
                js.push_str(&format!(" {k}: {},", v));
            }
        }
        js.push_str(" },\n");
    }
    js.push_str("];\n");

    // --- Rust static array ---
    let mut rs = String::from(
        "pub struct WafEntry { pub name: &'static str, pub payload: &'static str }\n\
         pub static WAF_ENTRIES: &[WafEntry] = &[\n",
    );
    for entry in &entries {
        let name = entry
            .get("name")
            .and_then(|v| v.as_str())
            .expect("entry missing \"name\"");
        let payload = entry
            .get("payload")
            .and_then(|v| v.as_str())
            .expect("entry missing \"payload\"");
        rs.push_str(&format!(
            "    WafEntry {{ name: {:?}, payload: {:?} }},\n",
            name, payload
        ));
    }
    rs.push_str("];\n");

    std::fs::write("generated/waf_payloads.rs", rs).expect("Failed to write waf_payloads.rs");

    js
}
