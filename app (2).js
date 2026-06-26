/* ============================================================
   婚活 すり合わせ – app.js
   ============================================================ */

const LIFF_ID   = "YOUR_LIFF_ID"; /* ← LIFFコンソールで発行したIDに差し替えてください */
const DRAFT_KEY = "konkatsu_suriawase_draft_v1";

/* 送信＆共有完了後にトーク画面へ送信するメッセージ */
const NEXT_PART_MESSAGE =
  "すり合わせアンケートへの回答ありがとうございます！\nお互いの回答を見比べながら話し合いましょう。";

/* ============================================================
   URLセーフ Base64（pako 圧縮対応）
   ============================================================ */
function uint8ToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlToUint8(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad    = padded.length % 4;
  const fixed  = pad ? padded + "=".repeat(4 - pad) : padded;
  const binary = atob(fixed);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlEncode(str) {
  try {
    if (typeof pako !== "undefined") {
      return "z" + uint8ToBase64Url(pako.deflate(str));
    }
  } catch (e) {
    console.warn("pako compress failed, fallback", e);
  }
  return "p" + btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64UrlDecode(str) {
  const flag = str.charAt(0);
  const body = str.slice(1);
  if (flag === "z") {
    return pako.inflate(base64UrlToUint8(body), { to: "string" });
  }
  const target = flag === "p" ? body : str;
  const padded = target.replace(/-/g, "+").replace(/_/g, "/");
  const pad    = padded.length % 4;
  const fixed  = pad ? padded + "=".repeat(4 - pad) : padded;
  return decodeURIComponent(escape(atob(fixed)));
}

function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ============================================================
   スライダービジュアル（ビューモード表示用 SVG）
   ============================================================ */
function sliderVisualHTML(value, leftLabel, rightLabel, max = 5) {
  const v       = Math.min(Math.max(parseInt(value, 10) || 3, 1), max);
  const width   = 320;
  const padding = 12;
  const usable  = width - padding * 2;
  const step    = usable / (max - 1);
  const cx      = padding + step * (v - 1);
  const y       = 20;
  let ticks = "";
  for (let i = 0; i < max; i++) {
    const x = padding + step * i;
    ticks += `<line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="#f48ca0" stroke-width="2"/>`;
  }
  return `
    <div class="slider-visual">
      <div class="slider-visual-labels" style="display:flex;justify-content:space-between;font-size:13px;font-weight:700;color:#d96c7d;margin-bottom:4px;">
        <span>${escapeHTML(leftLabel)}</span><span>${escapeHTML(rightLabel)}</span>
      </div>
      <svg viewBox="0 0 ${width} 40" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:32px;display:block;">
        <line x1="${padding}" y1="${y}" x2="${width-padding}" y2="${y}" stroke="#f48ca0" stroke-width="2"/>
        ${ticks}
        <circle cx="${cx}" cy="${y}" r="9" fill="#222"/>
      </svg>
    </div>`;
}

/* ============================================================
   順位付けUI
   ============================================================ */
const rankingState = { q19: [], q38: [] };

const RANKING_ID_MAP = {
  q19Ranking: "q19",
  q38Ranking: "q38",
};

const Q19_OPTIONS = ["料理","洗い物","掃除機をかける","水回りの掃除","片付け","洗濯機をまわしてから干すまで","干したものの取り込み","ゴミ捨て"];
const Q38_OPTIONS = ["仕事","趣味","家族との時間","家事の質","お金の貯蓄"];

function setupRankingGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const key = RANKING_ID_MAP[groupId];
  group.querySelectorAll(".rank-option").forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.value;
      const arr   = rankingState[key];
      const idx   = arr.indexOf(value);
      if (idx === -1) arr.push(value); else arr.splice(idx, 1);
      renderRankingGroup(groupId);
    });
  });
}

function renderRankingGroup(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const arr = rankingState[RANKING_ID_MAP[groupId]];
  group.querySelectorAll(".rank-option").forEach(btn => {
    const order = arr.indexOf(btn.dataset.value);
    const numEl = btn.querySelector(".rank-number");
    if (order === -1) {
      btn.classList.remove("selected");
      if (numEl) numEl.textContent = "";
    } else {
      btn.classList.add("selected");
      if (numEl) numEl.textContent = String(order + 1);
    }
  });
}

function resetRankingGroup(groupId) {
  rankingState[RANKING_ID_MAP[groupId]] = [];
  renderRankingGroup(groupId);
}

function restoreRankingGroup(groupId, savedOrder) {
  const group = document.getElementById(groupId);
  const key   = RANKING_ID_MAP[groupId];
  const validValues = group
    ? Array.from(group.querySelectorAll(".rank-option")).map(b => b.dataset.value)
    : [];
  rankingState[key] = Array.isArray(savedOrder)
    ? savedOrder.filter(v => validValues.includes(v))
    : [];
  renderRankingGroup(groupId);
}

function rankingListHTML(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "未回答";
  return arr.map((item, i) => `${i+1}位：${escapeHTML(item)}`).join("<br>");
}

/* ============================================================
   チェックボックス収集ヘルパー
   ============================================================ */
function getChecked(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`))
    .map(el => el.value || el.closest("label").textContent.trim());
}

function getRadio(name) {
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? (el.value || el.closest("label").textContent.trim()) : "";
}

function checkedListHTML(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return "未回答";
  return arr.map(v => `・${escapeHTML(v)}`).join("<br>");
}

/* ============================================================
   フォーム値の収集
   ============================================================ */
function collectFormData() {
  return {
    q1:         document.getElementById("q1").value,
    q2:         document.getElementById("q2").value,
    q3:         getRadio("q3"),
    q4:         getRadio("q4"),
    q5:         getRadio("q5"),
    q6:         getRadio("q6"),
    q7:         getRadio("q7"),
    q8:         getRadio("q8"),
    q8_other:   document.getElementById("q8_other").value,
    q9:         getRadio("q9"),
    q10_1_val:  document.getElementById("q10_1").value,
    q10_1_chk:  getChecked("q10_1"),
    q10_2_val:  document.getElementById("q10_2").value,
    q10_2_chk:  getChecked("q10_2"),
    q10_3_val:  document.getElementById("q10_3").value,
    q10_3_chk:  getChecked("q10_3"),
    q10_4_val:  document.getElementById("q10_4").value,
    q10_4_chk:  getChecked("q10_4"),
    q11:        getRadio("q11"),
    q12:        getRadio("q12"),
    q12_other:  document.getElementById("q12_other").value,
    q13:        getRadio("q13"),
    q13_other:  document.getElementById("q13_other").value,
    q14:        getRadio("q14"),
    q14_other:  document.getElementById("q14_other").value,
    q15:        getRadio("q15"),
    q15_other:  document.getElementById("q15_other").value,
    q16:        getRadio("q16"),
    q16_other:  document.getElementById("q16_other").value,
    q17:        getRadio("q17"),
    q17_other:  document.getElementById("q17_other").value,
    q18:        getRadio("q18"),
    q18_other:  document.getElementById("q18_other").value,
    q19:        rankingState.q19.slice(),
    q20:        document.getElementById("q20").value,
    q21:        getRadio("q21"),
    q22:        getRadio("q22"),
    q23:        getRadio("q23"),
    q24:        getRadio("q24"),
    q25:        getRadio("q25"),
    q26:        getRadio("q26"),
    q27:        getRadio("q27"),
    q28:        getChecked("q28"),
    q29:        getChecked("q29"),
    q30_budget: document.getElementById("q30_budget").value,
    q30_area:   document.getElementById("q30_area").value,
    q31:        getRadio("q31"),
    q32:        document.getElementById("q32").value,
    q32_pet:    document.getElementById("q32_pet").value,
    q33:        getRadio("q33"),
    q34:        getRadio("q34"),
    q35:        getRadio("q35"),
    q36:        getRadio("q36"),
    q37:        getRadio("q37"),
    q38:        getRadio("q38"),
  };
}

/* ============================================================
   フォームへの値の復元
   ============================================================ */
function restoreFormData(data) {
  if (!data) return;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined) el.value = val;
  };
  const setRadio = (name, val) => {
    if (!val) return;
    // value属性で探す
    let r = document.querySelector(`input[name="${name}"][value="${val}"]`);
    // value属性がなくlabelテキストで保存されている場合
    if (!r) {
      document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
        if ((el.closest("label") || {}).textContent && el.closest("label").textContent.trim() === val) r = el;
      });
    }
    if (r) r.checked = true;
  };
  const setCheckboxes = (name, vals) => {
    if (!Array.isArray(vals)) return;
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
      const label = el.closest("label");
      const text  = label ? label.textContent.trim() : "";
      if (vals.includes(el.value) || vals.includes(text)) el.checked = true;
    });
  };

  setText("q1", data.q1);
  setText("q2", data.q2);
  setText("q8_other",   data.q8_other);
  setText("q12_other",  data.q12_other);
  setText("q13_other",  data.q13_other);
  setText("q14_other",  data.q14_other);
  setText("q15_other",  data.q15_other);
  setText("q16_other",  data.q16_other);
  setText("q17_other",  data.q17_other);
  setText("q18_other",  data.q18_other);
  setText("q30_budget", data.q30_budget);
  setText("q30_area",   data.q30_area);
  setText("q32_pet",    data.q32_pet);

  // スライダー
  ["q10_1","q10_2","q10_3","q10_4","q20","q32"].forEach(id => {
    const key = id + (id.startsWith("q10") ? "_val" : "");
    setText(id, data[key] !== undefined ? data[key] : data[id]);
  });

  // ラジオ
  ["q3","q4","q5","q6","q7","q8","q9","q11","q12","q13","q14","q15","q16","q17","q18","q21","q22","q23","q24","q25","q26","q27","q31","q33","q34","q35","q36","q37","q38"]
    .forEach(name => setRadio(name, data[name]));

  // チェックボックス
  ["q10_1","q10_2","q10_3","q10_4"].forEach(name => setCheckboxes(name, data[name + "_chk"]));
  setCheckboxes("q28", data.q28);
  setCheckboxes("q29", data.q29);

  // ランキング
  restoreRankingGroup("q19Ranking", data.q19);
  restoreRankingGroup("q38Ranking", data.q38);
}

/* ============================================================
   バリデーション
   ============================================================ */
function validate(data) {
  const errors = [];
  if (!data.q1.trim())  errors.push("Q1: 結婚したい理由を入力してください。");
  if (!data.q2.trim())  errors.push("Q2: 理想の夫婦像を入力してください。");
  if (!data.q3)         errors.push("Q3: 前科について選択してください。");
  if (!data.q4)         errors.push("Q4: 借金について選択してください。");
  if (!data.q5)         errors.push("Q5: 保証人について選択してください。");
  if (!data.q6)         errors.push("Q6: 健康上のことについて選択してください。");
  if (!data.q7)         errors.push("Q7: 宗教事情について選択してください。");
  if (!data.q8)         errors.push("Q8: 初婚・再婚について選択してください。");
  if (!data.q9)         errors.push("Q9: 転勤・転職・起業について選択してください。");
  if (!data.q11)        errors.push("Q11: ブライダルチェックについて選択してください。");
  if (!data.q12)        errors.push("Q12: 結婚後の働き方を選択してください。");
  if (!data.q13)        errors.push("Q13: 家事の分担について選択してください。");
  if (!data.q14)        errors.push("Q14: 結婚後の支出割合を選択してください。");
  if (!data.q15)        errors.push("Q15: 子ども後の働き方を選択してください。");
  if (!data.q16)        errors.push("Q16: 育児の分担について選択してください。");
  if (!data.q17)        errors.push("Q17: 育休について選択してください。");
  if (!data.q18)        errors.push("Q18: 子ども後の支出割合を選択してください。");
  if (!data.q21)        errors.push("Q21: 洗濯頻度を選択してください。");
  if (!data.q22)        errors.push("Q22: 掃除頻度を選択してください。");
  if (!data.q23)        errors.push("Q23: 自炊・外食について選択してください。");
  if (!data.q24)        errors.push("Q24: 食器を洗うタイミングを選択してください。");
  if (!data.q25)        errors.push("Q25: 便利家電・惣菜について選択してください。");
  if (!data.q26)        errors.push("Q26: 飲み会の頻度を選択してください。");
  if (!data.q27)        errors.push("Q27: 晩酌について選択してください。");
  if (!data.q28 || data.q28.length === 0) errors.push("Q28: 家について選択してください。");
  if (!data.q33)        errors.push("Q33: 両親・兄弟との面会頻度（現在）を選択してください。");
  if (!data.q34)        errors.push("Q34: 親戚との面会頻度（現在）を選択してください。");
  if (!data.q35)        errors.push("Q35: 結婚後の両親・兄弟との面会頻度を選択してください。");
  if (!data.q36)        errors.push("Q36: パートナーの同行について選択してください。");
  if (!data.q37)        errors.push("Q37: 義両親との面会頻度を選択してください。");
  if (!data.q38)        errors.push("Q38: 結婚費用について選択してください。");
  return errors;
}

/* ============================================================
   共有URL エンコード／デコード
   ============================================================ */

/* キー短縮マップ（URLを短くするため1〜2文字に変換） */
const SHARE_KEY_MAP = {
  q1:"a", q2:"b", q3:"c", q4:"d", q5:"e", q6:"f", q7:"g", q8:"h",
  q8_other:"h2", q9:"i",
  q10_1_val:"j1", q10_1_chk:"j2",
  q10_2_val:"k1", q10_2_chk:"k2",
  q10_3_val:"l1", q10_3_chk:"l2",
  q10_4_val:"m1", q10_4_chk:"m2",
  q11:"n", q12:"o", q12_other:"o2",
  q13:"p", q13_other:"p2",
  q14:"q", q14_other:"q2",
  q15:"r", q15_other:"r2",
  q16:"s", q16_other:"s2",
  q17:"t", q17_other:"t2",
  q18:"u", q18_other:"u2",
  q19:"v", q20:"w",
  q21:"x", q22:"y", q23:"z", q24:"A", q25:"B", q26:"C", q27:"D",
  q28:"E", q29:"F",
  q30_budget:"G", q30_area:"H",
  q31:"I", q32:"J", q32_pet:"J2",
  q33:"K", q34:"L", q35:"M", q36:"N", q37:"O", q38:"P",
  _shareName:"Z",
};
const SHARE_KEY_MAP_REVERSE = Object.fromEntries(
  Object.entries(SHARE_KEY_MAP).map(([k, v]) => [v, k])
);

function encodeDataToURL(data) {
  /* Q19はオプション文字列をインデックス化して短縮 */
  const compact = {
    ...data,
    q19: data.q19.map(v => Q19_OPTIONS.indexOf(v)),
  };
  const shortData = {};
  Object.keys(compact).forEach(key => {
    shortData[SHARE_KEY_MAP[key] || key] = compact[key];
  });
  const encoded = base64UrlEncode(JSON.stringify(shortData));
  const base    = location.href.split("?")[0].split("#")[0];
  return `${base}?share=${encoded}`;
}

function decodeDataFromURL() {
  const params = new URLSearchParams(location.search);
  const raw    = params.get("share");
  if (!raw) return null;
  try {
    const shortData = JSON.parse(base64UrlDecode(raw));
    const data = {};
    Object.keys(shortData).forEach(key => {
      data[SHARE_KEY_MAP_REVERSE[key] || key] = shortData[key];
    });
    if (Array.isArray(data.q19)) {
      data.q19 = data.q19.map(i => Q19_OPTIONS[i]).filter(Boolean);
    }
    return data;
  } catch (e) {
    console.error("URL decode error", e);
    return null;
  }
}

/* ============================================================
   ビューモード：回答をカード表示
   ============================================================ */
function renderViewMode(data, options = {}) {
  const { selfPreview = false, onShare = null } = options;

  const r = (val) => val || "未回答";
  const radioWithOther = (val, other) => {
    if (!val) return "未回答";
    if (val === "その他" && other && other.trim()) return `その他：${other.trim()}`;
    return val;
  };

  const q10Section = (label, sliderVal, chkArr) => {
    const slider = sliderVisualHTML(sliderVal || 3, "ほしくない", "ほしい");
    const checks = (Array.isArray(chkArr) && chkArr.length > 0)
      ? chkArr.map(v => `・${escapeHTML(v)}`).join("<br>")
      : "（未選択）";
    return `<strong>${escapeHTML(label)}</strong><br>${slider}${checks}`;
  };

  const rows = [
    { q: "Q1 結婚したい理由は何ですか？",               a: r(data.q1) },
    { q: "Q2 どんな夫婦になりたいですか？",              a: r(data.q2) },
    { q: "Q3 前科はありますか？",                       a: r(data.q3) },
    { q: "Q4 借金はありますか？",                       a: r(data.q4) },
    { q: "Q5 他人の借金の保証人になっていますか？",        a: r(data.q5) },
    { q: "Q6 健康上のことで伝えておくことはありますか？",   a: r(data.q6) },
    { q: "Q7 宗教事情で伝えておくことはありますか？",      a: r(data.q7) },
    { q: "Q8 再婚の場合、離婚理由を教えてください。",
      html: (() => {
        const base = r(data.q8);
        return base === "再婚以上" && data.q8_other && data.q8_other.trim()
          ? `${escapeHTML(base)}<br>離婚理由：${escapeHTML(data.q8_other)}`
          : escapeHTML(base);
      })() },
    { q: "Q9 転勤や転職、起業の予定はありますか？",        a: r(data.q9) },
    { q: "Q10 子どもはほしいですか？不妊治療・養子について",
      html: [
        q10Section("1人目",   data.q10_1_val, data.q10_1_chk),
        q10Section("2人目",   data.q10_2_val, data.q10_2_chk),
        q10Section("3人目",   data.q10_3_val, data.q10_3_chk),
        q10Section("4人目以上", data.q10_4_val, data.q10_4_chk),
      ].join("<br><br>") },
    { q: "Q11 1年以内にブライダルチェックを受けましたか？",  a: r(data.q11) },
    { q: "Q12 結婚後の働き方はどうしたいですか？",          a: radioWithOther(data.q12, data.q12_other) },
    { q: "Q13 家事はどう分担したいですか？",               a: radioWithOther(data.q13, data.q13_other) },
    { q: "Q14 結婚後の支出割合はどうしたいですか？",         a: radioWithOther(data.q14, data.q14_other) },
    { q: "Q15 子どもが生まれた後の働き方は？",             a: radioWithOther(data.q15, data.q15_other) },
    { q: "Q16 育児はどう分担したいですか？",               a: radioWithOther(data.q16, data.q16_other) },
    { q: "Q17 育休は何ヶ月ぐらい取りたいですか？",          a: radioWithOther(data.q17, data.q17_other) },
    { q: "Q18 子どもが生まれた後の支出割合は？",            a: radioWithOther(data.q18, data.q18_other) },
    { q: "Q19 家事の中で好きな順",                       html: rankingListHTML(data.q19) },
    { q: "Q20 部屋や水回りの清潔感はどのくらい気になりますか？",
      html: sliderVisualHTML(data.q20 || 3, "気にしない", "気になる") },
    { q: "Q21 洗濯頻度は普段どのくらいですか？",            a: r(data.q21) },
    { q: "Q22 掃除頻度は普段どのくらいですか？",            a: r(data.q22) },
    { q: "Q23 自炊派ですか？外食はしますか？",             a: r(data.q23) },
    { q: "Q24 食器を洗うタイミングは？",                   a: r(data.q24) },
    { q: "Q25 便利家電や惣菜へのこだわりは？",             a: r(data.q25) },
    { q: "Q26 飲み会の頻度",                             a: r(data.q26) },
    { q: "Q27 家で晩酌はしますか？",                      a: r(data.q27) },
    { q: "Q28 家は買いたいですか？",                      html: checkedListHTML(data.q28) },
    { q: "Q29 戸建て・マンション、どれが良いですか？",       html: checkedListHTML(data.q29) },
    { q: "Q30 家の予算・住みたいエリア",
      html: (() => {
        const budget = data.q30_budget ? `予算：${escapeHTML(data.q30_budget)}` : "";
        const area   = data.q30_area   ? `エリア：${escapeHTML(data.q30_area)}` : "";
        return [budget, area].filter(Boolean).join("<br>") || "未回答";
      })() },
    { q: "Q31 車は買いたいですか？",                      a: r(data.q31) },
    { q: "Q32 ペットは飼いたいですか？",
      html: (() => {
        const slider = sliderVisualHTML(data.q32 || 3, "飼いたくない", "飼いたい");
        return slider + (data.q32_pet && data.q32_pet.trim()
          ? `飼いたいペット：${escapeHTML(data.q32_pet)}`
          : "");
      })() },
    { q: "Q33 両親・兄弟との面会頻度（現在）",              a: r(data.q33) },
    { q: "Q34 家族以外の親戚との面会頻度（現在）",           a: r(data.q34) },
    { q: "Q35 結婚後、両親・兄弟と何回ぐらい会いたいですか？", a: r(data.q35) },
    { q: "Q36 両親・兄弟と会う時、パートナーにもついてきてほしいですか？", a: r(data.q36) },
    { q: "Q37 結婚後、義両親・義兄弟と何回ぐらい会いたいですか？", a: r(data.q37) },
    { q: "Q38 結婚費用についてどう考えていますか？",         a: r(data.q38) },
  ];

  /* フォーム要素を非表示 */
  document.querySelectorAll(
    ".container > label, .container > input, .container > textarea, " +
    ".container > div.slider-labels, .container > div.ranking-group, " +
    ".container > div.button-group, .container > div#shareModal, " +
    ".container > #submitBtn"
  ).forEach(el => (el.style.display = "none"));

  const formURL = location.href.split("?")[0].split("#")[0];

  const descEl = document.querySelector(".form-header .form-description");
  if (descEl) {
    descEl.innerHTML =
      "回答を共有してお互いのことを知りましょう。<br>" +
      "回答内容だけじゃなく、なぜそう思ってるのか、この場合はどう変わるかなども質問し合ってみましょう。";
  }

  /* viewMode div がなければ動的に生成 */
  let container = document.getElementById("viewMode");
  if (!container) {
    container = document.createElement("div");
    container.id = "viewMode";
    document.querySelector(".container").prepend(container);
  }
  container.style.display = "block";

  container.innerHTML = `
    ${selfPreview ? `
    <div class="cta-card share-confirm-card">
      <div class="cta-content" style="text-align:center;">
        <h3 class="cta-title">この内容を共有します</h3>
        <p class="cta-text">内容を確認したら、共有先を選んでください。</p>
        <button type="button" id="goShareBtn" class="cta-button">
          共有先を選ぶ <span class="cta-arrow">›</span>
        </button>
      </div>
    </div>
    ` : `
    <div class="view-header">
      <p class="view-label">回答内容</p>
      ${data._shareName ? `<p class="view-name">${escapeHTML(data._shareName)} さんの回答</p>` : ""}
    </div>
    `}

    ${rows.map(({ q, a, html }) => `
      <div class="view-item">
        <p class="view-question">${escapeHTML(q)}</p>
        <p class="view-answer">${html !== undefined ? html : escapeHTML(a).replace(/\n/g, "<br>")}</p>
      </div>
    `).join("")}

    ${!selfPreview ? `
    <div class="cta-card">
      <img src="image1.PNG" class="cta-image-left" alt="">
      <div class="cta-content">
        <h3 class="cta-title">あなたの価値観も共有してみませんか？</h3>
        <p class="cta-text">
          婚活・交際前の自己開示は、<br>
          お互いを知る大切なきっかけになります。<br>
          あなたの考えや価値観をアンケートで伝えてみましょう。
        </p>
        <button type="button" id="ctaButton" class="cta-button" data-href="${formURL}">
          私も回答する <span class="cta-arrow">›</span>
        </button>
      </div>
    </div>
    ` : ""}
  `;

  if (selfPreview) {
    const goShareBtn = document.getElementById("goShareBtn");
    if (goShareBtn && typeof onShare === "function") {
      goShareBtn.addEventListener("click", onShare);
    }
    return;
  }

  const ctaButton = document.getElementById("ctaButton");
  if (ctaButton) {
    ctaButton.addEventListener("click", () => {
      if (confirm("婚活 すり合わせフォームを開く")) {
        window.location.href = ctaButton.dataset.href;
      }
    });
  }
}

/* ============================================================
   LINEメッセージ送信
   ============================================================ */
async function sendShareMessageToSelf(previewMsg) {
  try {
    if (liff.isInClient() && liff.isApiAvailable("sendMessages")) {
      await liff.sendMessages([{ type: "text", text: previewMsg }]);
    }
  } catch (e) {
    console.warn("sendMessages (self) skipped:", e);
  }
}

async function sendNextPartMessage() {
  try {
    if (liff.isInClient() && liff.isApiAvailable("sendMessages")) {
      await liff.sendMessages([{ type: "text", text: NEXT_PART_MESSAGE }]);
    }
  } catch (e) {
    console.warn("sendMessages skipped:", e);
  }
}

/* ============================================================
   メイン処理
   ============================================================ */
(async () => {

  /* ----- ビューモード判定（LIFFログイン不要） ----- */
  const sharedData = decodeDataFromURL();
  if (sharedData) {
    renderViewMode(sharedData);
    return;
  }

  /* ----- LIFF 初期化 ----- */
  try {
    await liff.init({ liffId: LIFF_ID });
  } catch (e) {
    console.error("LIFF init failed", e);
    alert("LIFFの初期化に失敗しました。");
    return;
  }

  if (!liff.isLoggedIn()) {
    liff.login();
    return;
  }

  /* ----- ランキングUIの初期化 ----- */
  setupRankingGroup("q19Ranking");
  setupRankingGroup("q38Ranking");

  /* ----- localStorage から下書き復元 ----- */
  try {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) restoreFormData(JSON.parse(saved));
  } catch (_) {}

  /* ----- 下書き保存 ----- */
  document.getElementById("draftBtn") &&
  document.getElementById("draftBtn").addEventListener("click", () => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(collectFormData()));
      alert("下書きを保存しました。");
    } catch (_) {
      alert("下書きの保存に失敗しました。");
    }
  });

  /* ----- フォームクリア ----- */
  document.getElementById("clearBtn") &&
  document.getElementById("clearBtn").addEventListener("click", () => {
    if (!confirm("入力内容をすべてクリアしますか？")) return;

    ["q1","q2","q8_other","q12_other","q13_other","q14_other","q15_other",
     "q16_other","q17_other","q18_other","q30_budget","q30_area","q32_pet"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });

    document.querySelectorAll('input[type="radio"], input[type="checkbox"]')
      .forEach(el => (el.checked = false));

    ["q10_1","q10_2","q10_3","q10_4","q20","q32"]
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = 3; });

    resetRankingGroup("q19Ranking");
    resetRankingGroup("q38Ranking");

    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  });

  /* ----- 送信ボタン ----- */
  document.getElementById("submitBtn").addEventListener("click", () => {
    const data   = collectFormData();
    const errors = validate(data);

    if (errors.length > 0) {
      alert("以下の項目を入力・選択してください。\n\n" + errors.join("\n"));
      return;
    }

    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); } catch (_) {}

    /* モーダルがあれば表示、なければ直接共有フローへ */
    const modal = document.getElementById("shareModal");
    if (modal) {
      modal.classList.remove("hidden");
      modal.classList.add("show");
      document.getElementById("submitBtn").disabled = true;
    } else {
      /* モーダルなし：名前なしで共有処理を直接実行 */
      handleShare(data, "");
    }
  });

  /* ----- 共有ボタン（モーダルあり） ----- */
  const shareBtn = document.getElementById("shareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const shareName = (document.getElementById("shareName") || {}).value || "";
      const data      = collectFormData();
      await handleShare(data, shareName.trim());

      const modal = document.getElementById("shareModal");
      if (modal) {
        modal.classList.remove("show");
        modal.classList.add("hidden");
      }
    });
  }

  /* ----- モーダル外クリックで閉じる ----- */
  const shareModal = document.getElementById("shareModal");
  if (shareModal) {
    shareModal.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove("show");
        e.currentTarget.classList.add("hidden");
        document.getElementById("submitBtn").disabled = false;
      }
    });
  }

})();

/* ============================================================
   共有処理（送信ボタン・共有ボタン共通）
   ============================================================ */
async function handleShare(data, shareName) {
  data._shareName = shareName;

  const shareURL   = encodeDataToURL(data);
  const previewMsg = shareName
    ? `${shareName}さんの婚活 すり合わせの回答が届きました。\n回答をみる→${shareURL}`
    : `婚活 すり合わせの回答が届きました。\n回答をみる→${shareURL}`;

  await sendShareMessageToSelf(previewMsg);
  await sendNextPartMessage();

  renderViewMode(data, {
    selfPreview: true,
    onShare: () => {
      const lineShareURL = `https://line.me/R/msg/text/?${encodeURIComponent(previewMsg)}`;
      if (liff.isInClient()) {
        window.location.href = lineShareURL;
      } else {
        window.open(lineShareURL, "_blank");
      }
    },
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}
