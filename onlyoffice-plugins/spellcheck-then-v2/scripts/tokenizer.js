/* Pre-tokenizer: แยก document text เป็น chunks ตามประเภทอักษร
 *
 * Output chunks:
 *   - { type: "thai",   text, start } → ส่งให้ Trie FMM ของ TH
 *   - { type: "latin",  text, start } → ส่งให้ Trie FMM ของ EN (หรือ split-by-space)
 *   - { type: "digit",  text, start } → skip (ไม่ตรวจ)
 *   - { type: "punct",  text, start } → skip
 *
 * เหตุผล: Trie ภาษาไทยและอังกฤษแยก dict กัน ตัวเลข/punct ไม่ควรเข้า trie เลย
 */
(function (window) {
  // Char classification
  // Returns: 'thai' | 'latin' | 'digit' | 'punct'
  function classifyChar(ch) {
    if (!ch) return "punct";
    var code = ch.charCodeAt(0);

    // Thai digits (0E50-0E59) → digit
    if (code >= 0x0e50 && code <= 0x0e59) return "digit";
    // Thai punctuation/abbreviation marks → punct
    //   0E2F PAIYANNOI (ฯ), 0E46 MAIYAMOK (ๆ), 0E4F FONGMAN (๏),
    //   0E5A ANGKHANKHU (๚), 0E5B KHOMUT (๛)
    if (code === 0x0e2f || code === 0x0e46 || code === 0x0e4f ||
        code === 0x0e5a || code === 0x0e5b) return "punct";
    // Thai letters/vowels/tone marks → thai
    if (code >= 0x0e00 && code <= 0x0e7f) return "thai";

    // Latin letters
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return "latin";

    // ASCII digits
    if (code >= 0x30 && code <= 0x39) return "digit";

    // Latin extended (accented chars) — treat as latin
    if (code >= 0xc0 && code <= 0xff) return "latin";

    return "punct";
  }

  /**
   * แยก text เป็น chunks ตาม char type
   * - merge consecutive chars ของประเภทเดียวกันเป็น chunk เดียว
   * - punct ใช้แยก chunk แต่ไม่ emit (skip)
   * - digit emit ออกมาแต่ผู้เรียกควร skip
   *
   * @param {string} text
   * @returns {Array<{type: string, text: string, start: number}>}
   */
  function pretokenize(text) {
    var t = String(text || "");
    var n = t.length;
    var chunks = [];
    if (!n) return chunks;

    var i = 0;
    while (i < n) {
      var ch = t.charAt(i);
      var type = classifyChar(ch);

      if (type === "punct") {
        i++;
        continue;
      }

      // Greedy: collect chars ของ type เดียวกัน
      // ยกเว้น Thai ที่อนุญาต tone marks/vowels ทุกตัวใน range
      var start = i;
      var end = i + 1;
      while (end < n) {
        var nextCh = t.charAt(end);
        var nextType = classifyChar(nextCh);
        if (nextType !== type) break;
        end++;
      }

      var chunkText = t.substring(start, end);
      chunks.push({ type: type, text: chunkText, start: start });
      i = end;
    }

    return chunks;
  }

  /**
   * Helper: split English chunk เป็น tokens แบบง่าย (split by whitespace ภายใน chunk)
   * — แต่จริง ๆ pretokenize แบ่ง latin chunk ที่เจอ punct/space แล้ว
   * — chunk latin จึงเป็นคำเดี่ยวอยู่แล้ว ไม่ต้อง split อีก
   * คืน array of { word, start, end }
   */
  function chunkToEnglishToken(chunk) {
    return [{
      word: chunk.text,
      start: chunk.start,
      end: chunk.start + chunk.text.length
    }];
  }

  // Export
  window.SpellcheckTokenizerV2 = {
    classifyChar: classifyChar,
    pretokenize: pretokenize,
    chunkToEnglishToken: chunkToEnglishToken
  };
})(window);
