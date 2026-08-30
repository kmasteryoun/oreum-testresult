/* [오름] 국어 · 독서 복습시험 — 조교 채점 입력 엔진
   paper.js(build_paper.py 가 생성)를 그대로 읽는다. 시험지 번호 = 여기 번호. */

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbywXRJdVLbGUu5E_yuQ2xgAVlCcKdIdAX3zq8as_nVskM5j4Bi4dCFcb-xkKH_fQ50D/exec";   // ← Apps Script 웹 앱 URL (index.html 과 같은 주소를 쓰면 됩니다)

/* 조교 전용 암호. 바꾸려면 이 줄만 고치면 됩니다.
   ※ 화면을 가리는 정도이지 진짜 자물쇠는 아닙니다. 소스를 열면 보입니다.
      주소를 학생에게 알리지 않는 것이 여전히 가장 중요합니다. */
const PASSCODE = "74527697";

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const PARTS = ["1부", "2부", "3부", "4부", "5부"];
const PART_NAME = { "1부": "구조 복원", "2부": "핵심 문장 복원", "3부": "선지 판별",
                    "4부": "〈보기〉 적용", "5부": "어휘 / 지시어" };

const S = { school: null, work: null, wrong: {} };   // wrong[n] = true | {j:bool, g:bool}
const done = [];

/* ---------- 초기화 ---------- */
function schools() {
  const set = new Set();
  Object.values(PAPER).forEach(w => w.schools.forEach(s => set.add(s)));
  return Array.from(set).sort();
}
function worksOf(school) {
  return Object.entries(PAPER).filter(([, w]) => w.schools.includes(school));
}

function init() {
  $("#schoolSel").innerHTML = schools().map(s => `<option>${s}</option>`).join("");
  $("#schoolSel").onchange = () => { S.school = $("#schoolSel").value; fillWorks(); };
  $("#workSel").onchange = () => { S.work = $("#workSel").value; reset(); render(); };
  $("#nameIn").oninput = () => $("#whoLbl").textContent = $("#nameIn").value.trim();
  $("#allOk").onclick = () => { S.wrong = {}; render(); };
  $("#allNo").onclick = () => {
    cur().units.forEach(u => S.wrong[u.n] = u.kind === "ox" ? { j: true, g: true } : true);
    render();
  };
  $("#resetBtn").onclick = () => { reset(); render(); };
  $("#saveBtn").onclick = save;
  $("#quickBtn").onclick = applyQuick;
  $("#quick").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); applyQuick(); } };
  S.school = schools()[0];
  fillWorks();
}
function fillWorks() {
  const list = worksOf(S.school);
  $("#workSel").innerHTML = list.map(([id, w], i) =>
    `<option value="${id}">${i + 1}주차 · ${w.title}</option>`).join("");
  S.work = list.length ? list[0][0] : null;
  reset(); render();
}
const cur = () => PAPER[S.work];
function reset() { S.wrong = {}; }

/* ---------- 빠른 입력 ---------- */
function applyQuick() {
  const raw = $("#quick").value.trim();
  if (!raw) return;
  const byN = {}; cur().units.forEach(u => byN[u.n] = u);
  let bad = [];
  raw.split(/[\s,]+/).filter(Boolean).forEach(tok => {
    const m = tok.match(/^(\d+)\s*([ㄱㄴㅁgbGB근둘]?)$/);
    if (!m) { bad.push(tok); return; }
    const n = +m[1], sfx = m[2], u = byN[n];
    if (!u) { bad.push(tok); return; }
    if (u.kind !== "ox") { S.wrong[n] = true; return; }
    const w = S.wrong[n] && typeof S.wrong[n] === "object" ? S.wrong[n] : { j: false, g: false };
    if (sfx === "ㄱ" || sfx === "g" || sfx === "근") w.g = true;
    else if (sfx === "ㅁ" || sfx === "b" || sfx === "둘") { w.j = true; w.g = true; }
    else w.j = true;
    S.wrong[n] = w;
  });
  $("#quick").value = "";
  render();
  if (bad.length) toast("인식하지 못한 입력: " + bad.join(", "), 3000);
}

/* ---------- 채점 화면 ---------- */
function render() {
  const w = cur();
  if (!w) { $("#parts").innerHTML = ""; return; }
  let h = "";
  PARTS.forEach(p => {
    const us = w.units.filter(u => u.part === p);
    if (!us.length) return;
    h += `<div class="pgroup"><h3>${p} · ${PART_NAME[p]} <span style="color:var(--text-dim);font-weight:400">
          ${us.length}문항</span></h3><div class="grid">`;
    us.forEach(u => {
      if (u.kind === "ox") {
        const wr = S.wrong[u.n] || {};
        h += `<div class="ox"><div class="n">${u.n}</div><div class="pair">
              <div class="h ${wr.j ? "no" : ""}" data-n="${u.n}" data-f="j">판</div>
              <div class="h ${wr.g ? "no" : ""}" data-n="${u.n}" data-f="g">근</div></div></div>`;
      } else {
        h += `<div class="chip ${S.wrong[u.n] ? "no" : ""}" data-n="${u.n}">${u.n}
              <span class="k">${u.kind === "choice" ? "객관" : "빈칸"}</span></div>`;
      }
    });
    h += "</div></div>";
  });
  $("#parts").innerHTML = h;
  $$("#parts .chip").forEach(c => c.onclick = () => {
    const n = +c.dataset.n; S.wrong[n] ? delete S.wrong[n] : S.wrong[n] = true; render();
  });
  $$("#parts .ox .h").forEach(c => c.onclick = () => {
    const n = +c.dataset.n, f = c.dataset.f;
    const o = (S.wrong[n] && typeof S.wrong[n] === "object") ? S.wrong[n] : { j: false, g: false };
    o[f] = !o[f];
    if (!o.j && !o.g) delete S.wrong[n]; else S.wrong[n] = o;
    render();
  });
  summarize();
}

/* ---------- 집계 ---------- */
function score() {
  const w = cur();
  const byPart = {}, traps = {};
  let tot = 0, got = 0, evid = 0;
  w.units.forEach(u => {
    const p = u.part;
    byPart[p] = byPart[p] || { tot: 0, got: 0 };
    if (u.kind === "ox") {
      const wr = S.wrong[u.n] || {};
      tot += 2; byPart[p].tot += 2;
      if (!wr.j) { got++; byPart[p].got++; }
      else if (u.trap) traps[u.trap] = (traps[u.trap] || 0) + 1;
      if (!wr.g) { got++; byPart[p].got++; } else evid++;
    } else {
      tot++; byPart[p].tot++;
      if (!S.wrong[u.n]) { got++; byPart[p].got++; }
    }
  });
  const rate = tot ? Math.round(got / tot * 100) : 0;
  const grade = rate >= 90 ? "A" : rate >= 80 ? "B" : rate >= 70 ? "C" : rate >= 60 ? "D" : "F";
  return { tot, got, rate, grade, evid, byPart, traps };
}

function summarize() {
  const r = score();
  $("#sScore").textContent = r.got + " / " + r.tot;
  $("#sRate").textContent = r.rate + "%";
  $("#sGrade").textContent = r.grade;
  $("#sEvid").textContent = r.evid;
  $("#liveScore").textContent = r.got + " / " + r.tot;
  $("#liveRate").textContent = "· " + r.rate + "% · " + r.grade;

  let h = "<tr><th>파트</th><th>맞은 점수</th><th>배점</th><th>정답률</th></tr>";
  PARTS.forEach(p => {
    const b = r.byPart[p]; if (!b) return;
    const pr = b.tot ? Math.round(b.got / b.tot * 100) : 0;
    h += `<tr><td class="l">${p} · ${PART_NAME[p]}</td><td>${b.got}</td><td>${b.tot}</td><td>${pr}%</td></tr>`;
  });
  $("#partTbl").innerHTML = h;

  const ts = Object.entries(r.traps).sort((a, b) => b[1] - a[1]);
  $("#trapWrap").innerHTML = ts.length
    ? '<table class="t"><tr><th>놓친 함정 유형</th><th>횟수</th></tr>'
      + ts.map(([t, c]) => `<tr><td class="l">${t}</td><td>${c}</td></tr>`).join("") + "</table>"
    : '<div class="empty">틀린 O/X 문항이 없어 함정 유형 집계가 비어 있습니다.</div>';
}

/* ---------- 저장 ---------- */
function toast(msg, ms) {
  const t = $("#toast"); t.innerHTML = msg; t.style.display = "block";
  clearTimeout(t._t); t._t = setTimeout(() => t.style.display = "none", ms || 3000);
}

function save() {
  const name = $("#nameIn").value.trim();
  if (!name) { toast("학생 이름을 입력하세요."); $("#nameIn").focus(); return; }
  const w = cur(), r = score();
  const wrongList = w.units.filter(u => S.wrong[u.n]).map(u => {
    if (u.kind !== "ox") return String(u.n);
    const o = S.wrong[u.n];
    return u.n + (o.j && o.g ? "(판단·근거)" : o.j ? "(판단)" : "(근거)");
  });
  const payload = {
    studentName: name, school: S.school, work: w.title, source: "종이시험 · 조교입력",
    sections: PARTS.filter(p => r.byPart[p]).map(p => ({
      work: `${w.title} · ${p} ${PART_NAME[p]}`,
      total: r.byPart[p].tot, correct: r.byPart[p].got,
      rate: Math.round(r.byPart[p].got / r.byPart[p].tot * 100),
      wrongs: w.units.filter(u => u.part === p && S.wrong[u.n]).map(u => String(u.n))
    })),
    totalBlanks: r.tot, totalCorrect: r.got, totalRate: r.rate,
    grade: r.grade, evidenceMiss: r.evid,
    traps: Object.entries(r.traps).map(([t, c]) => `${t}×${c}`),
    wrongDetail: wrongList
  };

  if (SCRIPT_URL) {
    const f = $("#sendForm");
    f.action = SCRIPT_URL;
    $("#sendData").value = JSON.stringify(payload);
    f.submit();
    toast(`✅ <b>${name}</b> 저장 · ${r.got}/${r.tot} (${r.rate}%) ${r.grade}`);
  } else {
    toast(`채점 완료 · <b>${name}</b> ${r.got}/${r.tot} (${r.rate}%)<br>
      <span style="font-size:12px;color:var(--text-muted)">전송 주소(SCRIPT_URL)가 없어 기록은 저장되지 않았습니다.</span>`, 4500);
  }

  done.unshift({ name, rate: r.rate, grade: r.grade, got: r.got, tot: r.tot });
  $("#doneList").className = "";
  $("#doneList").innerHTML = '<table class="t"><tr><th>이름</th><th>점수</th><th>정답률</th><th>등급</th></tr>'
    + done.map(d => `<tr><td class="l">${d.name}</td><td>${d.got}/${d.tot}</td><td>${d.rate}%</td><td>${d.grade}</td></tr>`).join("")
    + "</table>";

  $("#nameIn").value = ""; $("#whoLbl").textContent = "";
  reset(); render();
  $("#nameIn").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- 암호 게이트 ---------- */
function gate() {
  const KEY = "oreum_grader_ok";
  try { if (sessionStorage.getItem(KEY) === PASSCODE) { start(); return; } } catch (e) {}
  const g = document.createElement("div");
  g.id = "gate";
  g.innerHTML = `<div class="gbox">
      <div class="glogo">[오름] 국어</div>
      <div class="gtitle">조교 채점 입력</div>
      <p class="ghint">강사·조교 전용 화면입니다. 암호를 입력하세요.</p>
      <input type="password" id="gpw" placeholder="암호" autocomplete="off">
      <button id="gbtn">들어가기</button>
      <div class="gerr" id="gerr"></div>
    </div>`;
  document.body.appendChild(g);
  const tryIn = () => {
    if (document.getElementById("gpw").value === PASSCODE) {
      try { sessionStorage.setItem(KEY, PASSCODE); } catch (e) {}
      g.remove(); start();
    } else {
      document.getElementById("gerr").textContent = "암호가 맞지 않습니다.";
      document.getElementById("gpw").value = "";
      document.getElementById("gpw").focus();
    }
  };
  document.getElementById("gbtn").onclick = tryIn;
  document.getElementById("gpw").onkeydown = e => { if (e.key === "Enter") tryIn(); };
  document.getElementById("gpw").focus();
}

function start() { init(); }

gate();
