mod generic;
mod git;
mod npm;
mod docker;
mod cargo;

pub fn process(cmd: &str, input: &str) -> String {
    let clean = strip_ansi(input);

    if cmd.starts_with("git ") || cmd == "git" {
        git::process(cmd, &clean)
    } else if cmd.starts_with("npm ") || cmd.starts_with("yarn ") || cmd.starts_with("pnpm ") {
        npm::process(cmd, &clean)
    } else if cmd.starts_with("docker ") {
        docker::process(cmd, &clean)
    } else if cmd.starts_with("cargo ") {
        cargo::process(cmd, &clean)
    } else {
        generic::process(&clean)
    }
}

pub fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                for ch in chars.by_ref() {
                    if ch.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

pub fn dedup_lines(lines: &[&str]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    let mut prev: Option<String> = None;
    let mut count = 1usize;

    for line in lines {
        let line = line.trim_end();
        if line.is_empty() {
            if let Some(p) = prev.take() {
                push_with_count(&mut result, &p, count);
                count = 1;
            }
            if result.last().map(|l: &String| !l.is_empty()).unwrap_or(false) {
                result.push(String::new());
            }
            continue;
        }
        match &prev {
            Some(p) if p == line => {
                count += 1;
            }
            Some(p) => {
                let p = p.clone();
                push_with_count(&mut result, &p, count);
                count = 1;
                prev = Some(line.to_string());
            }
            None => {
                prev = Some(line.to_string());
            }
        }
    }
    if let Some(p) = prev {
        push_with_count(&mut result, &p, count);
    }
    result
}

fn push_with_count(result: &mut Vec<String>, line: &str, count: usize) {
    if count > 1 {
        result.push(format!("{} [×{}]", line, count));
    } else {
        result.push(line.to_string());
    }
}

pub fn truncate_line(line: &str, max: usize) -> String {
    if line.len() <= max {
        line.to_string()
    } else {
        format!("{}…", &line[..max])
    }
}

pub fn collapse_empty_lines(lines: &[String]) -> Vec<String> {
    let mut result = Vec::new();
    let mut empty_count = 0usize;
    for line in lines {
        if line.is_empty() {
            empty_count += 1;
            if empty_count <= 1 {
                result.push(String::new());
            }
        } else {
            empty_count = 0;
            result.push(line.clone());
        }
    }
    result
}
