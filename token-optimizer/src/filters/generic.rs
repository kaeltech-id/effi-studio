use super::{collapse_empty_lines, dedup_lines, truncate_line};

pub fn process(input: &str) -> String {
    let lines: Vec<&str> = input.lines().collect();
    let truncated: Vec<&str> = lines
        .iter()
        .map(|l| l.as_ref())
        .collect::<Vec<_>>();

    let owned: Vec<String> = truncated
        .iter()
        .map(|l| truncate_line(l, 200))
        .collect();

    let refs: Vec<&str> = owned.iter().map(|s| s.as_str()).collect();
    let deduped = dedup_lines(&refs);
    let collapsed = collapse_empty_lines(&deduped);
    collapsed.join("\n")
}
