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

enum Section {
    None,
    Staged,
    Unstaged,
    Untracked,
}

fn status(input: &str) -> String {
    let mut staged: Vec<String> = Vec::new();
    let mut unstaged: Vec<String> = Vec::new();
    let mut untracked: Vec<String> = Vec::new();
    let mut header = String::new();
    let mut section = Section::None;

    for line in input.lines() {
        if line.starts_with("On branch") || line.starts_with("HEAD detached") {
            header = line.to_string();
        } else if line.starts_with("Changes to be committed:") {
            section = Section::Staged;
        } else if line.starts_with("Changes not staged for commit:") || line.starts_with("Unmerged paths:") {
            section = Section::Unstaged;
        } else if line.starts_with("Untracked files:") {
            section = Section::Untracked;
        } else if line.starts_with('\t') {
            let trimmed = line.trim();
            match section {
                Section::Staged => staged.push(truncate_line(trimmed, 120)),
                Section::Unstaged => unstaged.push(truncate_line(trimmed, 120)),
                _ => untracked.push(truncate_line(trimmed, 80)),
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
    let first = match input.lines().find(|l| !l.trim().is_empty()) {
        Some(l) => l,
        None => return String::new(),
    };

    let commits = if first.starts_with("commit ") {
        verbose_commits(input)
    } else if is_oneline(first) {
        input.lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| truncate_line(l, 120))
            .collect()
    } else {
        Vec::new()
    };

    // A lossy transform that loses the structure it recognised costs the agent
    // more than it saves, so hand back the input rather than a near-empty table.
    if commits.is_empty() {
        return input.to_string();
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

fn is_oneline(line: &str) -> bool {
    let mut parts = line.splitn(2, ' ');
    match (parts.next(), parts.next()) {
        (Some(sha), Some(rest)) => {
            (7..=40).contains(&sha.len())
                && sha.chars().all(|c| c.is_ascii_hexdigit())
                && !rest.trim().is_empty()
        }
        _ => false,
    }
}

fn verbose_commits(input: &str) -> Vec<String> {
    let mut commits: Vec<String> = Vec::new();
    let mut current: Vec<String> = Vec::new();

    for line in input.lines() {
        if line.starts_with("commit ") && !current.is_empty() {
            commits.push(format_commit(&current));
            current.clear();
        }
        current.push(line.to_string());
    }
    if !current.is_empty() {
        commits.push(format_commit(&current));
    }
    commits
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
    let mut recognized = false;

    for line in input.lines() {
        if line.starts_with("diff --git")
            || line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("@@")
        {
            recognized = true;
            if context_skipped > 0 {
                out.push(format!("  ... ({} context lines)", context_skipped));
                context_skipped = 0;
            }
            out.push(truncate_line(line, 120));
        } else if line.starts_with('+') || line.starts_with('-') {
            recognized = true;
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

    if !recognized {
        return input.to_string();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn git_status_separates_staged_from_unstaged() {
        let input = "On branch main\nChanges to be committed:\n\tnew file:   a.txt\nChanges not staged for commit:\n\tmodified:   b.txt\n";
        let out = status(input);
        assert!(out.contains("Staged (1)"), "{out}");
        assert!(out.contains("Unstaged (1)"), "{out}");
    }

    #[test]
    fn git_status_shared_prefix_lands_in_the_right_section() {
        let input = "On branch main\nChanges to be committed:\n\tmodified:   c.txt\nChanges not staged for commit:\n\tmodified:   b.txt\n";
        let out = status(input);
        assert!(out.contains("Staged (1):\n  modified:   c.txt"), "{out}");
        assert!(out.contains("Unstaged (1):\n  modified:   b.txt"), "{out}");
        assert!(!out.contains("Staged (2)"), "{out}");
    }

    #[test]
    fn git_status_deleted_prefix_lands_in_the_right_section() {
        let input = "On branch main\nChanges to be committed:\n\tdeleted:    gone.txt\nChanges not staged for commit:\n\tdeleted:    vanished.txt\n";
        let out = status(input);
        let staged_at = out.find("Staged (1):").expect("staged section");
        let unstaged_at = out.find("Unstaged (1):").expect("unstaged section");
        let gone_at = out.find("gone.txt").expect("gone.txt");
        let vanished_at = out.find("vanished.txt").expect("vanished.txt");
        assert!(staged_at < gone_at && gone_at < unstaged_at, "{out}");
        assert!(unstaged_at < vanished_at, "{out}");
    }

    #[test]
    fn git_status_ignores_hint_lines() {
        let input = "On branch main\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n\tnew file:   a.txt\n";
        let out = status(input);
        assert!(out.contains("Staged (1)"), "{out}");
        assert!(!out.contains("git restore"), "{out}");
    }

    #[test]
    fn git_status_unmerged_paths_are_unstaged_not_untracked() {
        let input = "On branch main\nUnmerged paths:\n  (use \"git add <file>...\" to mark resolution)\n\tboth modified:   m.txt\n";
        let out = status(input);
        assert!(out.contains("Unstaged (1):\n  both modified:   m.txt"), "{out}");
        assert!(!out.contains("Untracked"), "{out}");
    }

    #[test]
    fn git_status_untracked_section_is_its_own() {
        let input = "On branch main\nUntracked files:\n\tnew.txt\n";
        let out = status(input);
        assert!(out.contains("Untracked (1):\n  new.txt"), "{out}");
        assert!(!out.contains("Staged"), "{out}");
    }

    #[test]
    fn git_status_short_form_falls_through_to_generic() {
        let input = " M b.txt\n?? c.txt\n";
        let out = status(input);
        assert!(out.contains("b.txt"), "{out}");
        assert!(out.contains("c.txt"), "{out}");
        assert!(!out.contains("Staged"), "{out}");
        assert!(!out.contains("Untracked ("), "{out}");
    }

    #[test]
    fn git_status_clean_tree_returns_early() {
        let input = "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean\n";
        let out = status(input);
        assert_eq!(out, "On branch main\nNothing to commit, working tree clean.");
    }

    #[test]
    fn git_log_oneline_is_not_destroyed() {
        let mut input = String::new();
        for i in 0..40 {
            input.push_str(&format!("abc{:04x} feat: synthetic subject {}\n", i, i));
        }
        let out = log(&input);
        assert!(out.len() > 8, "collapsed to {} bytes: {out}", out.len());
        assert!(out.contains("feat: synthetic subject 0"), "{out}");
        assert!(out.contains("feat: synthetic subject 19"), "{out}");
        assert!(out.contains("... (20 more commits)"), "{out}");
        assert_eq!(out.lines().count(), 21, "{out}");
    }

    #[test]
    fn git_log_oneline_under_limit_keeps_every_commit() {
        let input = "abc1234 first subject\ndef5678 second subject\n";
        let out = log(input);
        assert_eq!(out, "abc1234 first subject\ndef5678 second subject");
    }

    #[test]
    fn git_log_verbose_still_parses() {
        let input = "commit abcdef1234567890abcdef1234567890abcdef12\nAuthor: Jane Doe <jane@example.com>\nDate:   Mon Oct 27 10:00:00 2025 +0700\n\n    feat: add the thing\n";
        let out = log(input);
        assert!(out.starts_with("abcdef12 "), "{out}");
        assert!(out.contains("feat: add the thing"), "{out}");
        assert!(out.contains("Jane Doe <jane@example.com>"), "{out}");
    }

    #[test]
    fn git_log_unparseable_input_is_returned_unchanged() {
        let input = "some tool printed this\nand then this\n";
        assert_eq!(log(input), input);
    }

    #[test]
    fn git_log_empty_input_stays_empty() {
        assert_eq!(log(""), "");
        assert_eq!(log("\n\n"), "");
    }

    #[test]
    fn git_log_graph_input_is_returned_unchanged() {
        let input = "* abc1234 feat: tip\n|\\\n| * def5678 feat: side\n|/\n* 1234abc feat: base\n";
        assert_eq!(log(input), input);
    }

    #[test]
    fn is_oneline_sha_length_boundaries() {
        assert!(is_oneline("abcdef1 subject"));
        assert!(is_oneline(&format!("{} subject", "a".repeat(40))));
        assert!(!is_oneline("abcdef subject"));
        assert!(!is_oneline(&format!("{} subject", "a".repeat(41))));
        assert!(!is_oneline("zzzzzzz subject"));
        assert!(!is_oneline("abcdef1"));
        assert!(!is_oneline("abcdef1  "));
    }

    #[test]
    fn git_diff_unrecognised_input_is_returned_unchanged() {
        let input = "no diff markers here\njust prose\n";
        assert_eq!(diff(input), input);
    }

    #[test]
    fn git_diff_keeps_recognised_hunks() {
        let input = "diff --git a/x.rs b/x.rs\n@@ -1,2 +1,2 @@\n-old\n+new\n";
        let out = diff(input);
        assert!(out.contains("diff --git a/x.rs b/x.rs"), "{out}");
        assert!(out.contains("-old"), "{out}");
        assert!(out.contains("+new"), "{out}");
    }
}
