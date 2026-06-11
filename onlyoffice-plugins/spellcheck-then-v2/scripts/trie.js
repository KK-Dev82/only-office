/* Trie + Forward Maximum Matching for Thai tokenization
 * - buildTrie(words): สร้าง Trie จาก dict array
 * - forwardMaxMatch(text, trie): ตัดคำแบบ longest-match จาก dict
 *   คืน array ของ { word, start, end, inDict }
 *
 * Memory model: nested object { [char]: { ..., __end: true } }
 * - 50K Thai words → ~180K nodes → ~10-12MB
 */
(function (window) {
  var END_FLAG = "__end";

  /**
   * สร้าง Trie จาก dict words
   * @param {Array<string>} words
   * @param {Object} [opts]
   * @param {number} [opts.minLength=1] ข้ามคำที่สั้นกว่า minLength
   *   - Thai: ตั้ง 2 — เพราะ Hunspell affix expansion สร้าง 1-char พยัญชนะ (ม, พ, ส, ฟ, ...)
   *     ที่ "กลืน" คำผิดให้ดูเหมือนถูก ทำให้ตัดผิด เช่น "ฟาม" → "ฟา"+"ม" แทนที่จะเป็น MISS
   *     ภาษาไทยไม่มีคำ 1-char ที่เป็นความหมายอยู่จริง
   *   - English: ปล่อย default 1 — เพราะ "I", "a" เป็นคำจริง
   * @returns {Object} root node
   */
  function buildTrie(words, opts) {
    var root = Object.create(null);
    if (!Array.isArray(words)) return root;
    var minLen = (opts && typeof opts.minLength === "number") ? opts.minLength : 1;
    for (var i = 0; i < words.length; i++) {
      var w = String(words[i] || "");
      if (!w || w.length < minLen) continue;
      var node = root;
      for (var j = 0; j < w.length; j++) {
        var c = w.charAt(j);
        if (!node[c]) node[c] = Object.create(null);
        node = node[c];
      }
      node[END_FLAG] = true;
    }
    return root;
  }

  /**
   * เพิ่มคำลง trie ที่มีอยู่ (สำหรับ "Add word" feature)
   */
  function trieAdd(trie, word) {
    var w = String(word || "");
    if (!w || !trie) return;
    var node = trie;
    for (var j = 0; j < w.length; j++) {
      var c = w.charAt(j);
      if (!node[c]) node[c] = Object.create(null);
      node = node[c];
    }
    node[END_FLAG] = true;
  }

  /**
   * เช็คว่า word ทั้งคำอยู่ใน trie ไหม (exact match)
   */
  function trieHas(trie, word) {
    var w = String(word || "");
    if (!w || !trie) return false;
    var node = trie;
    for (var j = 0; j < w.length; j++) {
      var c = w.charAt(j);
      if (!node[c]) return false;
      node = node[c];
    }
    return node[END_FLAG] === true;
  }

  /**
   * เช็คว่า char นี้ "ตามหลัง" พยัญชนะ (vowel/tone mark/garan) — ห้ามเป็น boundary
   *   0E30-0E3A: ะ ั า ิ ี ึ ื ุ ู ฺ ฻ etc.
   *   0E47-0E4E: ็ ่ ้ ๊ ๋ ์ ํ ๎
   * ถ้าคำใน trie จบที่จุดที่ตามด้วย char เหล่านี้ = ตัดกลางพยางค์ → invalid match
   */
  function isFollowingMark(ch) {
    if (!ch) return false;
    var c = ch.charCodeAt(0);
    return (c >= 0x0e30 && c <= 0x0e3a) || (c >= 0x0e47 && c <= 0x0e4e);
  }

  /**
   * จากตำแหน่ง pos หาคำที่ "ยาวสุด" ที่ match ใน trie + ผ่าน boundary check
   * คืน { length, isWord } — length=0 หมายถึงไม่ match อะไรเลย
   *
   * Boundary check: คำที่จบแล้ว char ถัดไปเป็น vowel/tone mark = ตัดกลางพยางค์ → reject
   * ตัวอย่าง: dict มี "ก" และ "การ" — text "การ" — ที่ pos=0 พบ "ก" ก่อน
   *   แต่ char ถัดไป "า" คือ following mark → reject "ก"
   *   เดินต่อ → พบ "การ" → char ถัดไปไม่มี (end of text) → accept
   */
  function findLongestMatch(trie, text, pos) {
    if (!trie) return { length: 0, isWord: false };
    var node = trie;
    var longest = 0;
    var n = text.length;
    for (var i = pos; i < n; i++) {
      var c = text.charAt(i);
      var next = node[c];
      if (!next) break;
      node = next;
      if (node[END_FLAG] === true) {
        // Validate boundary: char ถัดไปต้องไม่เป็น following vowel/tone mark
        var afterEnd = i + 1;
        if (afterEnd >= n || !isFollowingMark(text.charAt(afterEnd))) {
          longest = i - pos + 1;
        }
        // ถ้าเป็น following mark → ไม่บันทึก (เดินลึกใน trie ต่อ เผื่อเจอคำที่ยาวกว่า)
      }
    }
    return { length: longest, isWord: longest > 0 };
  }

  /**
   * ตรวจว่า char นี้ "เริ่ม" ของคำในไทยได้ไหม (ไม่ใช่ vowel/tone mark)
   * Thai range:
   *   consonants: 0E01–0E2E
   *   leading vowels (เ แ โ ใ ไ): 0E40–0E44
   *   following vowels & tone marks: 0E30–0E3A, 0E47–0E4E (ไม่ควรเป็นตัวเริ่มคำ)
   */
  function isWordStartChar(ch) {
    if (!ch) return false;
    var code = ch.charCodeAt(0);
    // ASCII letter
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) return true;
    // Thai consonants
    if (code >= 0x0e01 && code <= 0x0e2e) return true;
    // Thai leading vowels
    if (code >= 0x0e40 && code <= 0x0e44) return true;
    return false;
  }

  /**
   * Forward Maximum Matching tokenizer สำหรับภาษาไทย (และอักษรที่ไม่มี space)
   *
   * Algorithm:
   * 1. ที่ตำแหน่ง pos: หา longest match ใน trie
   * 2. ถ้าเจอ: emit token (inDict=true), ขยับ pos ตาม length
   * 3. ถ้าไม่เจอ: collect chars จนกว่าจะเจอ word-start ที่ trie match ได้
   *    → emit เป็น token (inDict=false) สำหรับ fuzzy spellcheck
   *
   * @param {string} text
   * @param {Object} trie
   * @param {number} baseOffset - offset เริ่มต้นของ chunk นี้ใน document text
   * @returns {Array<{word: string, start: number, end: number, inDict: boolean}>}
   */
  function forwardMaxMatch(text, trie, baseOffset) {
    var tokens = [];
    var t = String(text || "");
    var n = t.length;
    if (!n || !trie) return tokens;
    baseOffset = baseOffset || 0;

    var pos = 0;
    while (pos < n) {
      var match = findLongestMatch(trie, t, pos);
      if (match.isWord) {
        tokens.push({
          word: t.substring(pos, pos + match.length),
          start: baseOffset + pos,
          end: baseOffset + pos + match.length,
          inDict: true
        });
        pos += match.length;
      } else {
        // ไม่ match — collect chars จนกว่าจะถึงตำแหน่งใหม่ที่ match ได้
        var unkStart = pos;
        pos++;
        while (pos < n) {
          // ถ้าเจอ char ที่เริ่มคำได้ + match trie อย่างน้อย 1 คำ → break
          if (isWordStartChar(t.charAt(pos))) {
            var probe = findLongestMatch(trie, t, pos);
            if (probe.isWord) break;
          }
          pos++;
        }
        tokens.push({
          word: t.substring(unkStart, pos),
          start: baseOffset + unkStart,
          end: baseOffset + pos,
          inDict: false
        });
      }
    }
    return tokens;
  }

  /**
   * Backward Maximum Matching (BMM) — ตัดคำจากขวาไปซ้าย
   * บางครั้งให้ผลที่ "ตรงกับเจตนาจริง" มากกว่า FMM โดยเฉพาะคำผิด
   * เช่น "ข้อฟามผิดพลาส":
   *   FMM (greedy left-right) จะกิน "ฟา"[OK] เหลือ "ม"[MISS] ที่ดู confusing
   *   BMM (greedy right-left) จะ "ฟาม"[MISS] เป็นคำเดียว ตรงกว่า
   *
   * Algorithm คล้าย FMM แต่กลับทิศ: ไล่จาก end → start
   *   ที่ pos (end exclusive): หา longest suffix ของ text[0..pos] ที่อยู่ใน trie
   *   ถ้าไม่มี → backtrack 1 char เป็น unknown
   */
  function backwardMaxMatch(text, trie, baseOffset) {
    var tokens = [];
    var t = String(text || "");
    var n = t.length;
    if (!n || !trie) return tokens;
    baseOffset = baseOffset || 0;

    var pos = n; // exclusive end pointer; we consume from pos backward
    while (pos > 0) {
      // หา longest suffix ของ text[0..pos] ที่ match ใน trie
      // โดยลอง start = pos-1, pos-2, ... down to 0
      var bestStart = -1;
      for (var start = 0; start < pos; start++) {
        var match = findLongestMatch(trie, t, start);
        if (match.isWord && (start + match.length) === pos) {
          // match ที่จบพอดีที่ pos — keep ตัวที่ start น้อยที่สุด (= word ยาวสุด)
          bestStart = start;
          break;
        }
      }

      if (bestStart >= 0) {
        tokens.unshift({
          word: t.substring(bestStart, pos),
          start: baseOffset + bestStart,
          end: baseOffset + pos,
          inDict: true
        });
        pos = bestStart;
      } else {
        // ไม่มี match จบที่ pos — collect unknown ไปทางซ้าย
        var unkEnd = pos;
        pos--;
        while (pos > 0) {
          // ถ้า char ที่ pos-1 เริ่มคำได้ + มี match ที่จบที่ pos (ตำแหน่งถัดไปของ unknown chunk)
          var found = false;
          for (var s = 0; s < pos; s++) {
            var m = findLongestMatch(trie, t, s);
            if (m.isWord && (s + m.length) === pos) {
              found = true;
              break;
            }
          }
          if (found) break;
          pos--;
        }
        tokens.unshift({
          word: t.substring(pos, unkEnd),
          start: baseOffset + pos,
          end: baseOffset + unkEnd,
          inDict: false
        });
      }
    }
    return tokens;
  }

  /**
   * Score a tokenization — ใช้สำหรับเปรียบเทียบ FMM vs BMM
   * Strategy: prefer fewer MISS tokens, then prefer fewer total tokens
   * (= "longer average token length" indirectly)
   */
  function scoreTokens(tokens) {
    var miss = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (!tokens[i].inDict) miss++;
    }
    // Lower = better. Primary: miss count. Secondary: total count.
    return miss * 1000 + tokens.length;
  }

  /**
   * Bidirectional Maximum Matching:
   * รัน FMM และ BMM แล้วเลือก result ที่ดีกว่า (น้อย miss + น้อย token)
   */
  function bidirectionalMaxMatch(text, trie, baseOffset) {
    var fmm = forwardMaxMatch(text, trie, baseOffset);
    var bmm = backwardMaxMatch(text, trie, baseOffset);
    var fmmScore = scoreTokens(fmm);
    var bmmScore = scoreTokens(bmm);
    // ถ้าเสมอ → ใช้ FMM (เร็วกว่าเพราะคำนวณก่อน + behavior คาดเดาง่าย)
    return bmmScore < fmmScore ? bmm : fmm;
  }

  /**
   * DP Maximum Matching — ตัดคำทั้งสตริงพร้อมกันด้วย dynamic programming
   *
   * ปัญหาของ FMM (งับคำยาวสุดจากซ้าย): ถ้า dict มีคำขยะ เช่น "อนุกร"
   *   FMM งับ "อนุกร" ก่อน → "อนุกรรมาธิการ" เพี้ยนเป็น อนุกร|รมาธิ|การ
   * DP มองทั้งสตริง หา segmentation ที่ "ครอบคลุม dict มากสุด (unknown น้อยสุด)
   *   แล้วจำนวน token น้อยสุด" → ได้ อนุ|กรรมาธิการ โดยไม่ติดกับดัก
   *
   * Objective (lexicographic, น้อย=ดี): (1) จำนวนตัวอักษร unknown  (2) จำนวน token
   *   เข้ารหัสเป็น cost เดียว: unknownChar = BIG+1, word = 1 ต่อ token
   *
   * Complexity: O(n × ความยาวคำสูงสุด) — เร็วกว่า bidirectional (O(n³)) มาก
   *
   * @returns {Array<{word, start, end, inDict}>} (unknown ติดกัน merge เป็น token เดียว)
   */
  function dpMaxMatch(text, trie, baseOffset) {
    var t = String(text || "");
    var n = t.length;
    if (!n || !trie) return [];
    baseOffset = baseOffset || 0;
    var BIG = 100000;

    var dp = new Array(n + 1);
    var back = new Array(n + 1);
    for (var i = 0; i <= n; i++) { dp[i] = Infinity; back[i] = null; }
    dp[0] = 0;

    for (var j = 0; j < n; j++) {
      if (dp[j] === Infinity) continue;
      // 1) ลองทุกคำใน trie ที่เริ่มต้นที่ตำแหน่ง j
      var node = trie;
      for (var k = j; k < n; k++) {
        node = node[t.charAt(k)];
        if (!node) break;
        if (node[END_FLAG] === true) {
          // boundary: char ถัดไปต้องไม่ใช่ vowel/tone mark (กันตัดกลางพยางค์)
          var after = k + 1;
          if (after >= n || !isFollowingMark(t.charAt(after))) {
            var wc = dp[j] + 1;
            if (wc < dp[k + 1]) { dp[k + 1] = wc; back[k + 1] = { from: j, word: true }; }
          }
        }
      }
      // 2) unknown 1 ตัวอักษร (fallback เสมอ — ให้ dp ถึงปลายทางได้แน่นอน)
      var uc = dp[j] + BIG + 1;
      if (uc < dp[j + 1]) { dp[j + 1] = uc; back[j + 1] = { from: j, word: false }; }
    }

    // reconstruct segments จากท้ายไปหน้า
    var segs = [];
    for (var p = n; p > 0;) {
      var b = back[p];
      segs.unshift({ s: b.from, e: p, word: b.word });
      p = b.from;
    }

    // merge ตัวอักษร unknown ที่ติดกัน → token เดียว (เป็นคำผิดก้อนเดียว)
    var out = [];
    for (var x = 0; x < segs.length; x++) {
      var sg = segs[x];
      var prev = out[out.length - 1];
      if (!sg.word && prev && !prev.inDict && prev.end === baseOffset + sg.s) {
        prev.end = baseOffset + sg.e;
        prev.word = t.substring(prev.start - baseOffset, sg.e);
      } else {
        out.push({
          word: t.substring(sg.s, sg.e),
          start: baseOffset + sg.s,
          end: baseOffset + sg.e,
          inDict: sg.word
        });
      }
    }
    return out;
  }

  // Export
  window.SpellcheckTrieV2 = {
    buildTrie: buildTrie,
    trieAdd: trieAdd,
    trieHas: trieHas,
    findLongestMatch: findLongestMatch,
    forwardMaxMatch: forwardMaxMatch,
    backwardMaxMatch: backwardMaxMatch,
    bidirectionalMaxMatch: bidirectionalMaxMatch,
    dpMaxMatch: dpMaxMatch,
    scoreTokens: scoreTokens,
    isWordStartChar: isWordStartChar
  };
})(window);
