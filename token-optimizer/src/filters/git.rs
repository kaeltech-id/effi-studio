use super::{collapse_empty_lines, truncate_line};

pub fn process(cmd: &str, input: &str) -> String {
    let sub = cmd.strip_prefix("git ").unwrap_or("").trim();

    match sub {
        s if s.starts_with("status") => status(input),
        s if s.starts_with("log") => log(input),
        s if s.starts_with("diff") => diff(input),
        s if s.starts_with("branch") => branch(input),
        s if s.starts_with("stash list") => stash_list(input),
        _ => super::generic::process(input),
    }
}

fn status(input: &str) -> String {
    let mut staged: Vec<String> = Vec::new();
    let mut unstaged: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    let mut header = String::new();

    for line in input.lines() {
        if line.starts_with("On branch") || line.starts_with("HEAD detached") {
            header = line.to_string();
        } else if line.starts_with('\t') {
            let trimmed = line.trim();
            if trimmed.starts_with("new file:") || trimmed.starts_with("modified:") || trimmed.starts_with("deleted:") || trimmed.starts_with("renamed:") {
                staged.push(truncate_line(trimmed, 120));
            } else if trimmed.starts_with("modified:") || trimmed.starts_with("deleted:") {
                unstaged.push(truncate_line(trimmed, 120));
            } else {
                untracked.push(truncate_line(trimmed, 80));
            }
        } else if line.contains("nothing to commit") || line.contains("working tree clean") {
            return format!("{}\nNothing to commit, working tree clean.", header);
        }
    }

    let mut out = Vec::new();
    if !header.is_empty() {
        out.push(header);
    }
    if !staged.is_empty() {
        out.push(format!("Staged ({}):", staged.len()));
        out.extend(staged.iter().map(|s| format!("  {}", s)));
    }
    if !unstaged.is_empty() {
        out.push(format!("Unstaged ({}):", unstaged.len()));
        out.extend(unstaged.iter().map(|s| format!("  {}", s)));
    }
    if !untracked.is_empty() {
        if untracked.len() <= 5 {
            out.push(format!("Untracked ({}):", untracked.len()));
            out.extend(untracked.iter().map(|s| format!("  {}", s)));
        } else {
            out.push(format!("Untracked: {} files (showing first 5)", untracked.len()));
            for f in untracked.iter().take(5) {
                out.push(format!("  {}", f));
            }
        }
    }

    if out.is_empty() {
        super::generic::process(input)
    } else {
        out.join("\n")
    }
}

fn log(input: &str) -> String {
    let mut commits: Vec<String> = Vec::new();
    let mut current: Vec<String> = Vec::new();

    for line in input.lines() {
        if line.starts_with("commit ") {
            if !current.is_empty() {
                commits.push(format_commit(&current));
                current.clear();
            }
        }
        current.push(line.to_string());
    }
    if !current.is_empty() {
        commits.push(format_commit(&current));
    }

    if commits.len() > 20 {
        let shown = &commits[..20];
        let mut out = shown.join("\n");
        out.push_str(&format!("\n... ({} more commits)", commits.len() - 20));
        out
    } else {
        commits.join("\n")
    }
}

fn format_commit(lines: &[String]) -> String {
    let hash = lines.first()
        .and_then(|l| l.strip_prefix("commit "))
        .map(|h| &h[..8.min(h.len())])
        .unwrap_or("?");

    let author = lines.iter()
        .find(|l| l.starts_with("Author:"))
        .map(|l| l.replace("Author:", "").trim().to_string())
        .unwrap_or_default();

    let date = lines.iter()
        .find(|l| l.starts_with("Date:"))
        .map(|l| l.replace("Date:", "").trim().to_string())
        .unwrap_or_default();

    let message = lines.iter()
        .skip_while(|l| !l.trim().is_empty() || l.starts_with("commit") || l.starts_with("Author") || l.starts_with("Date") || l.starts_with("Merge"))
        .find(|l| !l.trim().is_empty())
        .map(|l| truncate_line(l.trim(), 72))
        .unwrap_or_default();

    format!("{} {} | {} | {}", hash, message, author, date)
}

fn diff(input: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut context_skipped = 0usize;

    for line in input.lines() {
        if line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("@@")
        {
            if context_skipped > 0 {
                out.push(format!("  ... ({} context lines)", context_skipped));
                context_skipped = 0;
            }
            out.push(truncate_line(line, 120));
        } else if line.starts_with('+') || line.starts_with('-') {
            if context_skipped > 0 {
                out.push(format!("  ... ({} context lines)", context_skipped));
                context_skipped = 0;
            }
            out.push(truncate_line(line, 160));
        } else {
            context_skipped += 1;
        }
    }
    if context_skipped > 0 {
        out.push(format!("  ... ({} context lines)", context_skipped));
    }

    let owned: Vec<String> = out;
    let collapsed = collapse_empty_lines(&owned);
    collapsed.join("\n")
}

fn branch(input: &str) -> String {
    let branches: Vec<&str> = input.lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    if branches.len() > 15 {
        let mut out: Vec<String> = branches[..15].iter().map(|l| l.to_string()).collect();
        out.push(format!("... ({} more branches)", branches.len() - 15));
        out.join("\n")
    } else {
        input.trim().to_string()
    }
}

fn stash_list(input: &str) -> String {
    let entries: Vec<&str> = input.lines().filter(|l| !l.trim().is_empty()).collect();
    if entries.len() > 10 {
        let mut out: Vec<String> = entries[..10].iter().map(|l| truncate_line(l, 100)).collect();
        out.push(format!("... ({} more stash entries)", entries.len() - 10));
        out.join("\n")
    } else {
        entries.iter().map(|l| truncate_line(l, 100)).collect::<Vec<_>>().join("\n")
    }
}
