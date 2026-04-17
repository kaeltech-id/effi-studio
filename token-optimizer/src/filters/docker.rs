use super::truncate_line;

pub fn process(cmd: &str, input: &str) -> String {
    let sub = cmd.strip_prefix("docker ").unwrap_or("").trim();

    match sub {
        s if s.starts_with("ps") => ps(input),
        s if s.starts_with("logs") => logs(input),
        s if s.starts_with("build") => build(input),
        _ => super::generic::process(input),
    }
}

fn ps(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    if lines.len() <= 20 {
        return input.trim().to_string();
    }
    let mut out: Vec<String> = lines[..1].iter().map(|l| l.to_string()).collect();
    out.extend(lines[1..20].iter().map(|l| truncate_line(l, 160)));
    out.push(format!("... ({} more containers)", lines.len() - 20));
    out.join("\n")
}

fn logs(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    if lines.len() <= 50 {
        return super::generic::process(input);
    }
    let tail: Vec<&str> = lines[lines.len() - 50..].to_vec();
    let mut out = vec![format!("... ({} lines omitted, showing last 50)", lines.len() - 50)];
    out.extend(tail.iter().map(|l| truncate_line(l, 200)));
    out.join("\n")
}

fn build(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for line in input.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Step ")
            || trimmed.starts_with("Successfully")
            || trimmed.starts_with("ERROR")
            || trimmed.starts_with("error")
            || trimmed.contains("---")
        {
            out.push(truncate_line(trimmed, 120));
        }
    }
    if out.is_empty() {
        super::generic::process(input)
    } else {
        out.join("\n")
    }
}
