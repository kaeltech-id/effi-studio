use super::truncate_line;

pub fn process(cmd: &str, input: &str) -> String {
    let is_install = cmd.contains("install") || cmd.contains("add") || cmd.contains("i ");

    if is_install {
        install(input)
    } else {
        super::generic::process(input)
    }
}

fn install(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for line in input.lines() {
        let trimmed = line.trim();

        // Skip noise
        if trimmed.is_empty()
            || trimmed.starts_with('⠋') || trimmed.starts_with('⠙') || trimmed.starts_with('⠹')
            || trimmed.starts_with('⠸') || trimmed.starts_with('⠼') || trimmed.starts_with('⠴')
            || trimmed.contains("npm timing")
            || trimmed.contains("npm http")
            || trimmed.contains("npm sill")
            || trimmed.contains("npm silly")
            || trimmed.starts_with("Progress:")
            || trimmed.contains("packages are looking for funding")
        {
            continue;
        }

        if trimmed.starts_with("npm warn") || trimmed.starts_with("WARN") || trimmed.to_lowercase().starts_with("warning") {
            warnings.push(truncate_line(trimmed, 120));
        } else if trimmed.starts_with("npm error") || trimmed.starts_with("ERR!") || trimmed.to_lowercase().starts_with("error") {
            errors.push(truncate_line(trimmed, 120));
        } else if trimmed.contains("added ") || trimmed.contains("removed ") || trimmed.contains("changed ") || trimmed.contains("audited ") {
            out.push(trimmed.to_string());
        } else if trimmed.starts_with("+ ") || trimmed.starts_with("added ") {
            out.push(truncate_line(trimmed, 80));
        }
    }

    let mut result: Vec<String> = Vec::new();

    if !errors.is_empty() {
        result.push(format!("Errors ({}):", errors.len()));
        result.extend(errors);
    }
    if !out.is_empty() {
        result.extend(out);
    }
    if !warnings.is_empty() {
        if warnings.len() <= 3 {
            result.push(format!("Warnings ({}):", warnings.len()));
            result.extend(warnings);
        } else {
            result.push(format!("{} warnings (use npm install --verbose to see all)", warnings.len()));
        }
    }

    if result.is_empty() {
        super::generic::process(input)
    } else {
        result.join("\n")
    }
}
