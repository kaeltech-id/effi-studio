use std::env;
use std::io::{self, Read};

mod filters;

fn main() {
    let cmd: Vec<String> = env::args().skip(1).collect();
    let cmd_str = cmd.join(" ");

    let mut input = String::new();
    io::stdin().read_to_string(&mut input).unwrap_or(0);

    if input.trim().is_empty() {
        return;
    }

    let original_len = input.len();
    let output = filters::process(&cmd_str, &input);
    let output_len = output.len();

    if output_len < original_len {
        let saved_pct = 100 - (output_len * 100 / original_len);
        eprintln!("[etok: {}→{} chars (-{}%)]", original_len, output_len, saved_pct);
    }

    print!("{}", output);
}
