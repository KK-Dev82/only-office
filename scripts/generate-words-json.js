#!/usr/bin/env node
/**
 * Generate words.json from Hunspell .dic files for spellcheck-then plugin
 *
 * Usage: node generate-words-json.js
 * Or:    node only-office/scripts/generate-words-json.js
 *
 * Reads: only-office/dict/th_TH/th_TH.dic, only-office/dict/en_US/en_US.dic
 * Writes: only-office/dict/th_TH/words.json, only-office/dict/en_US/words.json
 */

const fs = require("fs");
const path = require("path");

const SCRIPT_DIR = __dirname;
const DICT_ROOT = path.resolve(SCRIPT_DIR, "../dict");

function parseDicFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn("[generate-words-json] File not found:", filePath);
    return [];
  }
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const words = [];
  const seen = Object.create(null);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // First line may be word count (numeric only)
    if (i === 0 && /^\d+$/.test(line)) continue;
    // Hunspell format: "word" or "word/flags" — strip flags for simple whitelist
    const word = line.split("/")[0].trim();
    if (!word) continue;
    const key = word.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    words.push(word);
  }
  return words;
}

function main() {
  const thPath = path.join(DICT_ROOT, "th_TH", "th_TH.dic");
  const enPath = path.join(DICT_ROOT, "en_US", "en_US.dic");

  const thWords = parseDicFile(thPath);
  const enWords = parseDicFile(enPath);

  const thOut = path.join(DICT_ROOT, "th_TH", "words.json");
  const enOut = path.join(DICT_ROOT, "en_US", "words.json");

  fs.writeFileSync(thOut, JSON.stringify(thWords), "utf-8");
  fs.writeFileSync(enOut, JSON.stringify(enWords), "utf-8");

  console.log("[generate-words-json] Generated:");
  console.log("  th_TH/words.json:", thWords.length, "words");
  console.log("  en_US/words.json:", enWords.length, "words");
}

main();
