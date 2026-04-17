use super::truncate_line;

pub fn process(cmd: &str, input: &str) -> String {
    let sub = cmd.strip_prefix("cargo ").unwrap_or("").trim();

    match sub {
        s if s.starts_with("test") => test(input),
        s if s.starts_with("build") || s.starts_with("check") => build(input),
        _ => super::generic::process(input),
    }
}

fn test(input: &str) -> String {
    let mut failures: Vec<String> = Vec::new();
    let mut summary = String::new();
    let mut in_failure = false;

    for line in input.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("failures:") || trimmed.starts_with("FAILED") {
            in_failure = true;
        }
        if trimmed.starts_with("test result:") {
            summary = truncate_line(trimmed, 120);
            in_failure = false;
        }
        if in_failure && !trimmed.is_empty() {
            failures.push(truncate_line(trimmed, 120));
        }
    }

    let mut out: Vec<String> = Vec::new();
    if !summary.is_empty() {
        out.push(summary);
    }
    if !failures.is_empty() {
        out.push(String::new());
        out.push("Failures:".to_string());
        out.extend(failures);
    }

    if out.is_empty() {
        super::generic::process(input)
    } else {
        out.join("\n")
    }
}

fn build(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("error") || trimmed.starts_with("warning") || trimmed.starts_with("Compiling") || trimmed.starts_with("Finished") || trimmed.starts_with("Blocking") {
            out.push(truncate_line(trimmed, 120));
        }
    }
    if out.is_empty() {
        super::generic::process(input)
    } else {
        // Group warnings
        let warning_count = out.iter().filter(|l| l.starts_with("warning")).count();
        let other: Vec<String> = out.into_iter().filter(|l| !l.starts_with("warning")).collect();
        let mut result = other;
        if warning_count > 0 {
            result.push(format!("{} warning(s) emitted", warning_count));
        }
        result.join("\n")
    }
}
