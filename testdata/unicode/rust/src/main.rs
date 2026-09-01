use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use unicode_normalization::UnicodeNormalization;

fn decode_hex(text: &str) -> Vec<u8> {
    (0..text.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&text[index..index + 2], 16).expect("hex"))
        .collect()
}

fn main() {
    let path = env::args().nth(1).expect("vectors.tsv path");
    let body = fs::read_to_string(path).expect("read vectors");
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let mut parts = trimmed.split('\t');
        let id = parts.next().expect("id");
        let hex = parts.next().expect("hex");
        let raw = decode_hex(hex);
        let text = String::from_utf8(raw).expect("utf-8");
        let nfc: String = text.nfc().collect();
        let digest = Sha256::digest(nfc.as_bytes());
        println!("{id} {digest:x}");
    }
}
