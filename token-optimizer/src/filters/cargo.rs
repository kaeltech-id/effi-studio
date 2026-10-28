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

fn is_status(trimmed: &str) -> bool {
    trimmed.starts_with("error") || trimmed.starts_with("warning") || trimmed.starts_with("Compiling") || trimmed.starts_with("Finished") || trimmed.starts_with("Blocking")
}

fn build(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    let mut out: Vec<String> = Vec::new();
    let mut seen: Vec<(String, String)> = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let trimmed = lines[i].trim();
        if !is_status(trimmed) {
            i += 1;
            continue;
        }
        if !trimmed.ends_with("at:") {
            out.push(truncate_line(trimmed, 120));
            i += 1;
            continue;
        }

        // The paths under "Finished N bundle(s) at:" are the whole point of a bundle
        // build, so they are kept verbatim - a truncated path is useless.
        let header = truncate_line(trimmed, 120);
        let mut paths: Vec<String> = Vec::new();
        let mut j = i + 1;
        while let Some(next) = lines.get(j).map(|l| l.trim()) {
            if next.is_empty() || is_status(next) {
                break;
            }
            let pair = (header.clone(), next.to_string());
            if !seen.contains(&pair) {
                seen.push(pair);
                paths.push(next.to_string());
            }
            j += 1;
        }
        if !paths.is_empty() || j == i + 1 {
            out.push(header);
            out.extend(paths);
        }
        i = j;
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
        result.dedup();
        result.join("\n")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_keeps_the_artefact_path_after_finished_at() {
        let input = "Compiling app v0.1.0\nFinished 1 bundle at:\n/Users/me/app/target/release/bundle/dmg/App_1.0.0_aarch64.dmg\n";
        let out = build(input);
        assert!(out.contains("Finished 1 bundle at:"), "{out}");
        assert!(
            out.contains("/Users/me/app/target/release/bundle/dmg/App_1.0.0_aarch64.dmg"),
            "{out}"
        );
    }

    #[test]
    fn build_does_not_absorb_the_line_after_an_ordinary_finished() {
        let input = "Finished `release` profile [optimized] target(s) in 0.41s\nstray-noise-line-that-must-not-survive\n";
        let out = build(input);
        assert!(out.contains("Finished `release` profile"), "{out}");
        assert!(!out.contains("stray-noise-line-that-must-not-survive"), "{out}");
    }

    #[test]
    fn build_trailing_finished_at_with_no_following_line_does_not_panic() {
        let input = "Compiling app v0.1.0\nFinished 1 bundle at:";
        let out = build(input);
        assert!(out.contains("Finished 1 bundle at:"), "{out}");
        assert!(out.contains("Compiling app v0.1.0"), "{out}");
    }

    #[test]
    fn build_keeps_distinct_paths_and_collapses_a_repeated_pair() {
        let input = "Compiling app v0.1.0\nFinished 2 bundles at:\n/t/a.dmg\n/t/b.app\nFinished 2 bundles at:\n/t/a.dmg\n";
        let out = build(input);
        assert_eq!(out.matches("/t/a.dmg").count(), 1, "{out}");
        assert_eq!(out.matches("/t/b.app").count(), 1, "{out}");
        assert_eq!(out.matches("Finished 2 bundles at:").count(), 1, "{out}");
    }

    #[test]
    fn build_does_not_truncate_a_long_path() {
        let long = format!("/Users/me/{}/bundle/App_1.0.0_aarch64.dmg", "deeply/nested".repeat(10));
        assert!(long.len() > 120, "fixture too short: {}", long.len());
        let input = format!("Finished 1 bundle at:\n{}\n", long);
        let out = build(&input);
        assert!(out.contains(&long), "{out}");
        assert!(!out.contains('\u{2026}'), "{out}");
    }

    #[test]
    fn build_stops_absorbing_at_an_empty_line() {
        let input = "Finished 1 bundle at:\n/t/a.dmg\n\nnot-a-path\n";
        let out = build(input);
        assert!(out.contains("/t/a.dmg"), "{out}");
        assert!(!out.contains("not-a-path"), "{out}");
    }

    #[test]
    fn build_groups_warnings() {
        let input = "Compiling app v0.1.0\nwarning: unused variable: `x`\nwarning: unused variable: `y`\nFinished `dev` profile [unoptimized] target(s) in 0.41s\n";
        let out = build(input);
        assert!(out.contains("2 warning(s) emitted"), "{out}");
        assert!(!out.contains("unused variable"), "{out}");
        assert!(out.contains("Compiling app v0.1.0"), "{out}");
    }

    #[test]
    fn build_without_status_lines_falls_through_to_generic() {
        let input = "just some output\nand more of it\n";
        let out = build(input);
        assert!(out.contains("just some output"), "{out}");
        assert!(out.contains("and more of it"), "{out}");
    }

    #[test]
    fn is_status_recognises_the_cargo_prefixes() {
        assert!(is_status("error[E0308]: mismatched types"));
        assert!(is_status("warning: unused import"));
        assert!(is_status("Compiling etok v0.1.0"));
        assert!(is_status("Finished 1 bundle at:"));
        assert!(is_status("Blocking waiting for file lock"));
        assert!(!is_status("/t/a.dmg"));
        assert!(!is_status(""));
    }

    #[test]
    fn test_keeps_summary_and_failures() {
        let input = "running 2 tests\ntest a ... ok\ntest b ... FAILED\n\nfailures:\n    b\n\ntest result: FAILED. 1 passed; 1 failed; 0 ignored\n";
        let out = test(input);
        assert!(out.contains("test result: FAILED. 1 passed; 1 failed"), "{out}");
        assert!(out.contains("Failures:"), "{out}");
    }
}
