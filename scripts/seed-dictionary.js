#!/usr/bin/env node
/**
 * Bulk seed words to Spellcheck Dictionary (Global scope).
 *
 * Posts to: POST {server}/api/word-management/spellcheck/add-words
 *   body: { words: [...], language: "auto" }
 *
 * Backend behavior:
 *   - Auto-detects per-word language (TH/EN char range)
 *   - Skips duplicates (returns in skipped[])
 *   - Persists to WordEntry + DictionaryWord tables (Global scope)
 *   - Syncs to PyThaiNLP for new entries
 *
 * Usage:
 *   node seed-dictionary.js --server <url> --file <words.json> [--dry-run] [--batch <n>]
 *
 * Examples:
 *   node seed-dictionary.js --server http://localhost:5000 --file seed-words.json --dry-run
 *   node seed-dictionary.js --server https://senate.example.com --file seed-words.json
 */

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = { server: null, file: null, dryRun: false, batch: 200 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--server") args.server = argv[++i];
    else if (a === "--file") args.file = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--batch") args.batch = parseInt(argv[++i], 10);
    else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return args;
}

function printUsage() {
  console.log(
    "Usage: node seed-dictionary.js --server <url> --file <words.json> [--dry-run] [--batch <n>]"
  );
  console.log("");
  console.log("Args:");
  console.log("  --server   Backend base URL (e.g. http://localhost:5000)");
  console.log("  --file     JSON file with words to seed (see schema below)");
  console.log("  --dry-run  Print what would be sent without POSTing");
  console.log("  --batch    Words per HTTP request (default 200)");
  console.log("");
  console.log("seed-words.json schema:");
  console.log('  { "groups": [ { "name": "...", "words": ["..."] } ] }');
  console.log("  OR a flat array: [\"word1\", \"word2\", ...]");
}

function loadWords(file) {
  const raw = fs.readFileSync(file, "utf8");
  const data = JSON.parse(raw);
  let groups = [];

  if (Array.isArray(data)) {
    groups = [{ name: "(flat)", words: data }];
  } else if (data && Array.isArray(data.groups)) {
    groups = data.groups;
  } else if (data && Array.isArray(data.words)) {
    groups = [{ name: "(default)", words: data.words }];
  } else {
    throw new Error("seed-words.json must contain 'groups[]' or 'words[]' or be a flat array");
  }

  // Flatten + dedupe (case-insensitive)
  const seen = new Set();
  const flat = [];
  for (const g of groups) {
    for (const w of g.words || []) {
      const trimmed = String(w || "").trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      flat.push({ word: trimmed, group: g.name });
    }
  }
  return { groups, flat };
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function postBatch(serverUrl, words) {
  const url = serverUrl.replace(/\/$/, "") + "/api/word-management/spellcheck/add-words";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ words, language: "auto" }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return await res.json();
}

function printSummary(results) {
  console.log("\n=== Summary ===");
  console.log(`Requested:  ${results.totalRequested}`);
  console.log(`Added:      ${results.totalAdded}`);
  console.log(`Skipped:    ${results.totalSkipped}  (already in dict)`);
  console.log(`Failed:     ${results.totalFailed}`);

  if (results.allAdded.length > 0) {
    console.log("\n--- Added (first 30) ---");
    for (const w of results.allAdded.slice(0, 30)) {
      console.log(`  + ${w.word} [${w.language}]`);
    }
    if (results.allAdded.length > 30) {
      console.log(`  ... and ${results.allAdded.length - 30} more`);
    }
  }

  if (results.allSkipped.length > 0) {
    console.log("\n--- Skipped (already exist) ---");
    for (const w of results.allSkipped.slice(0, 50)) {
      console.log(`  = ${w.word} [${w.language}]`);
    }
    if (results.allSkipped.length > 50) {
      console.log(`  ... and ${results.allSkipped.length - 50} more`);
    }
  }

  if (results.allFailed.length > 0) {
    console.log("\n--- Failed ---");
    for (const w of results.allFailed) {
      console.log(`  ! ${w.word} [${w.language}]: ${w.error}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.server || !args.file) {
    printUsage();
    process.exit(1);
  }

  const filePath = path.resolve(args.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const { groups, flat } = loadWords(filePath);
  console.log(`Loaded ${flat.length} unique words from ${groups.length} group(s):`);
  for (const g of groups) {
    console.log(`  - ${g.name}: ${(g.words || []).length} words`);
  }

  if (args.dryRun) {
    console.log("\n[DRY RUN] would POST these words to:");
    console.log(`  ${args.server}/api/word-management/spellcheck/add-words`);
    console.log(`  in batches of ${args.batch}`);
    console.log(`  total batches: ${Math.ceil(flat.length / args.batch)}`);
    console.log("\nFirst 10 words:");
    for (const item of flat.slice(0, 10)) {
      console.log(`  - ${item.word} (group: ${item.group})`);
    }
    process.exit(0);
  }

  const wordList = flat.map((f) => f.word);
  const batches = chunkArray(wordList, args.batch);
  console.log(`\nPosting in ${batches.length} batch(es) of ${args.batch}...`);

  const results = {
    totalRequested: 0,
    totalAdded: 0,
    totalSkipped: 0,
    totalFailed: 0,
    allAdded: [],
    allSkipped: [],
    allFailed: [],
  };

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    process.stdout.write(`  Batch ${i + 1}/${batches.length} (${batch.length} words)... `);
    try {
      const res = await postBatch(args.server, batch);
      results.totalRequested += res.requestedCount || 0;
      results.totalAdded += res.addedCount || 0;
      results.totalSkipped += res.skippedCount || 0;
      results.totalFailed += res.failedCount || 0;
      if (res.added) results.allAdded.push(...res.added);
      if (res.skipped) results.allSkipped.push(...res.skipped);
      if (res.failed) results.allFailed.push(...res.failed);
      console.log(
        `OK (added=${res.addedCount}, skipped=${res.skippedCount}, failed=${res.failedCount})`
      );
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      // Mark all words in this batch as failed
      for (const w of batch) {
        results.allFailed.push({ word: w, language: "?", error: err.message });
        results.totalFailed++;
      }
    }
  }

  printSummary(results);

  // Exit code: 0 if all OK, 2 if any failed
  process.exit(results.totalFailed > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
