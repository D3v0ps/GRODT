/* GRODT – appbeteende (ren JS, ingen byggkedja) */
(function () {
  const D = window.GRODT_DATA;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- Toast ---------- */
  function toast(msg, kind) {
    const stack = $(".toast-stack");
    const el = document.createElement("div");
    el.className = "toast " + (kind || "ok");
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="t-dot"></span><span>' + msg + '</span><button class="t-close" aria-label="Stäng">✕</button>';
    el.querySelector(".t-close").addEventListener("click", () => el.remove());
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  }
  window.grodtToast = toast;

  /* ---------- Routing ---------- */
  const VIEWS = ["dashboard", "bolag", "detalj", "pipeline", "synk", "admin", "installningar", "designsystem"];
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, "");
    return h || "login";
  }
  function navigate(route) {
    location.hash = "#/" + route;
  }
  function renderRoute() {
    const route = currentRoute();
    const isLogin = route === "login";
    $("#login").style.display = isLogin ? "flex" : "none";
    $("#app").style.display = isLogin ? "none" : "grid";
    if (isLogin) return;
    const name = VIEWS.includes(route) ? route : "dashboard";
    $$(".view").forEach((v) => v.classList.toggle("active", v.dataset.view === name));
    $$(".nav a[data-route]").forEach((a) => a.classList.toggle("active", a.dataset.route === name || (name === "detalj" && a.dataset.route === "bolag")));
    closeMobileNav();
    document.querySelector(".main").scrollTop = 0;
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", renderRoute);

  /* ---------- Login ---------- */
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#login-email");
    const pass = $("#login-pass");
    const err = $("#login-error");
    let ok = true;
    if (!email.value.trim() || !email.value.includes("@")) { ok = false; }
    if (!pass.value) { ok = false; }
    if (!ok) {
      err.style.display = "block";
      email.setAttribute("aria-invalid", "true");
      pass.setAttribute("aria-invalid", "true");
      return;
    }
    err.style.display = "none";
    email.removeAttribute("aria-invalid");
    pass.removeAttribute("aria-invalid");
    const btn = $("#login-btn");
    btn.classList.add("loading");
    setTimeout(() => {
      btn.classList.remove("loading");
      navigate("dashboard");
      toast("Inloggad som Anna Lindqvist", "ok");
    }, 700);
  });
  $("#logout-btn").addEventListener("click", () => {
    navigate("login");
  });

  /* ---------- Mobilmeny ---------- */
  function closeMobileNav() {
    $(".sidebar").classList.remove("open");
    $(".scrim").classList.remove("show");
  }
  $("#menu-btn") && $("#menu-btn").addEventListener("click", () => {
    $(".sidebar").classList.add("open");
    $(".scrim").classList.add("show");
  });
  $(".scrim").addEventListener("click", closeMobileNav);

  /* ---------- Bolagslista ---------- */
  const state = {
    sok: "",
    status: "",
    ort: "",
    ansvarig: "",
    omsMin: "",
    sortKey: "namn",
    sortDir: 1,
    page: 1,
    pageSize: 10,
  };

  function filteredBolag() {
    let rows = D.BOLAG.slice();
    if (state.sok) {
      const q = state.sok.toLowerCase();
      rows = rows.filter((b) => b.namn.toLowerCase().includes(q) || b.orgnr.includes(q) || b.ort.toLowerCase().includes(q));
    }
    if (state.status) rows = rows.filter((b) => b.status === state.status);
    if (state.ort) rows = rows.filter((b) => b.ort === state.ort);
    if (state.ansvarig) rows = rows.filter((b) => b.ansvarig === state.ansvarig);
    if (state.omsMin) {
      const min = Number(state.omsMin) * 1000000;
      rows = rows.filter((b) => Math.max(b.oms1, b.oms2) >= min);
    }
    const k = state.sortKey, dir = state.sortDir;
    rows.sort((a, b) => {
      let va = a[k], vb = b[k];
      if (va === null) va = "";
      if (vb === null) vb = "";
      if (typeof va === "string") return va.localeCompare(vb, "sv") * dir;
      return (va - vb) * dir;
    });
    return rows;
  }

  function renderTable() {
    const rows = filteredBolag();
    const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const pageRows = rows.slice(start, start + state.pageSize);
    const tbody = $("#bolag-tbody");

    if (rows.length === 0) {
      tbody.innerHTML =
        '<tr class="empty-row"><td colspan="9" style="height:auto;white-space:normal;">' +
        '<div class="empty">' +
        '<div class="empty-icon">' + radarSvg(36, false) + "</div>" +
        "<h3>Inga bolag matchar filtren</h3>" +
        "<p>Prova att bredda sökningen eller rensa ett filter – radarn hittar inget i det här svepet.</p>" +
        '<button class="btn btn-sm" id="clear-filters">Rensa alla filter</button>' +
        "</div></td></tr>";
      $("#clear-filters").addEventListener("click", clearFilters);
    } else {
      tbody.innerHTML = pageRows
        .map((b) => {
          const u1 = b.oms1 < D.TROSKEL, u2 = b.oms2 < D.TROSKEL;
          /* kvalificerar via endast ett av åren → markera det kvalificerande året */
          const mark1 = !u1 && u2 ? '<span class="qual-mark" title="Kvalificerande år (≥ 5 mkr)"></span>' : "";
          const mark2 = !u2 && u1 ? '<span class="qual-mark" title="Kvalificerande år (≥ 5 mkr)"></span>' : "";
          return (
            '<tr data-id="' + b.id + '" tabindex="0">' +
            '<td class="namn">' + b.namn + "</td>" +
            '<td class="org mono">' + b.orgnr + "</td>" +
            "<td>" + b.ort + "</td>" +
            '<td class="num' + (u1 ? " under" : "") + '" title="' + (u1 ? "Under tröskel 5 000 000 kr" : "") + '">' + D.fmtKr(b.oms1) + mark1 + "</td>" +
            '<td class="num' + (u2 ? " under" : "") + '" title="' + (u2 ? "Under tröskel 5 000 000 kr" : "") + '">' + D.fmtKr(b.oms2) + mark2 + "</td>" +
            '<td class="num">' + b.anst + "</td>" +
            "<td>" + D.badgeHtml(b.status) + "</td>" +
            '<td><span class="ansvarig-cell">' + (b.ansvarig ? D.avatarHtml(b.ansvarig, true) : '<span class="faint small">Ej tilldelad</span>') + "</span></td>" +
            "</tr>"
          );
        })
        .join("");
      $$("#bolag-tbody tr[data-id]").forEach((tr) => {
        tr.addEventListener("click", () => openDetail(Number(tr.dataset.id)));
        tr.addEventListener("keydown", (e) => { if (e.key === "Enter") openDetail(Number(tr.dataset.id)); });
      });
    }

    $("#result-count").textContent = rows.length + " av " + D.TOTALT_ANTAL.toLocaleString("sv-SE") + " bolag (urval i mockup)";
    /* paginering */
    const pages = $("#pages");
    let html = "";
    for (let p = 1; p <= totalPages; p++) {
      html += '<button class="' + (p === state.page ? "current" : "") + '" data-page="' + p + '" aria-label="Sida ' + p + '">' + p + "</button>";
    }
    pages.innerHTML = html;
    $$("#pages button").forEach((btn) => btn.addEventListener("click", () => { state.page = Number(btn.dataset.page); renderTable(); }));
    $("#page-info").textContent = rows.length === 0 ? "" : "Visar " + (start + 1) + "–" + Math.min(start + state.pageSize, rows.length) + " av " + rows.length;
    /* sorteringspilar */
    $$("th.sortable").forEach((th) => {
      const arrow = th.querySelector(".sort-arrow");
      if (th.dataset.key === state.sortKey) {
        arrow.textContent = state.sortDir === 1 ? "▲" : "▼";
        th.setAttribute("aria-sort", state.sortDir === 1 ? "ascending" : "descending");
      } else {
        arrow.textContent = "";
        th.removeAttribute("aria-sort");
      }
    });
  }

  function clearFilters() {
    state.sok = ""; state.status = ""; state.ort = ""; state.ansvarig = ""; state.omsMin = ""; state.page = 1;
    $("#f-sok").value = ""; $("#f-status").value = ""; $("#f-ort").value = ""; $("#f-ansvarig").value = ""; $("#f-oms").value = "";
    renderTable();
  }

  $("#f-sok").addEventListener("input", (e) => { state.sok = e.target.value; state.page = 1; renderTable(); });
  $("#f-status").addEventListener("change", (e) => { state.status = e.target.value; state.page = 1; renderTable(); });
  $("#f-ort").addEventListener("change", (e) => { state.ort = e.target.value; state.page = 1; renderTable(); });
  $("#f-ansvarig").addEventListener("change", (e) => { state.ansvarig = e.target.value; state.page = 1; renderTable(); });
  $("#f-oms").addEventListener("change", (e) => { state.omsMin = e.target.value; state.page = 1; renderTable(); });
  $$("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const k = th.dataset.key;
      if (state.sortKey === k) state.sortDir *= -1;
      else { state.sortKey = k; state.sortDir = 1; }
      renderTable();
    });
  });
  $("#csv-btn").addEventListener("click", () => {
    toast("CSV-export startad – " + filteredBolag().length + " rader", "info");
  });

  /* fyll filterselect med orter/ansvariga */
  (function initFilters() {
    const orter = Array.from(new Set(D.BOLAG.map((b) => b.ort))).sort((a, b) => a.localeCompare(b, "sv"));
    $("#f-ort").innerHTML = '<option value="">Alla orter</option>' + orter.map((o) => "<option>" + o + "</option>").join("");
    $("#f-ansvarig").innerHTML = '<option value="">Alla ansvariga</option>' + D.ANVANDARE.map((u) => '<option value="' + u.id + '">' + u.namn + "</option>").join("");
    $("#f-status").innerHTML = '<option value="">Alla statusar</option>' + D.STATUSAR.map((s) => '<option value="' + s.key + '">' + s.label + "</option>").join("");
  })();

  /* ---------- Bolagsdetalj ---------- */
  let currentBolag = null;
  function openDetail(id) {
    const b = D.BOLAG.find((x) => x.id === id);
    if (!b) return;
    currentBolag = b;
    $("#d-namn").textContent = b.namn;
    $("#d-orgnr").textContent = b.orgnr;
    $("#d-ort").textContent = b.ort;
    $("#d-anst").textContent = b.anst + " st";
    $("#d-sni").textContent = "78.100 – Arbetsförmedling och rekrytering";
    $("#d-oms1").textContent = D.fmtKr(b.oms1);
    $("#d-oms2").textContent = D.fmtKr(b.oms2);
    $("#d-status").innerHTML = D.badgeHtml(b.status);
    $("#d-status-select").value = b.status;
    $("#d-ansvarig-select").value = b.ansvarig || "";
    /* trenddiagram */
    const years = [2021, 2022, 2023, 2024];
    const max = Math.max(...b.trend, D.TROSKEL) * 1.15;
    $("#d-trend").innerHTML =
      '<div class="threshold" style="bottom:' + (D.TROSKEL / max) * 100 + '%"><span class="t-label">5,0 mkr</span></div>' +
      b.trend
        .map((v, i) => {
          const h = Math.max(3, (v / max) * 100);
          return '<div class="bar-col"><span class="val">' + D.fmtMkr(v) + '</span><div class="bar' + (v < D.TROSKEL ? " under-bar" : "") + '" style="height:' + h + '%"></div><span class="yr">' + years[i] + "</span></div>";
        })
        .join("");
    /* historik */
    $("#d-historik").innerHTML = D.HISTORIK_DEMO
      .map((h) => '<div class="t-item"><span class="t-dot"></span><div><div class="t-body">' + h.txt + '</div><div class="t-meta">' + h.meta + "</div></div></div>")
      .join("");
    navigate("detalj");
  }
  window.grodtOpenDetail = openDetail;

  $("#d-back").addEventListener("click", () => navigate("bolag"));
  $("#d-status-select").addEventListener("change", (e) => {
    if (!currentBolag) return;
    currentBolag.status = e.target.value;
    $("#d-status").innerHTML = D.badgeHtml(currentBolag.status);
    prependHistorik("Status ändrad till " + D.statusLabel(currentBolag.status));
    toast("Status ändrad till " + D.statusLabel(currentBolag.status), "ok");
    renderTable();
    renderKanban();
  });
  $("#d-ansvarig-select").addEventListener("change", (e) => {
    if (!currentBolag) return;
    currentBolag.ansvarig = e.target.value || null;
    const u = D.userById(currentBolag.ansvarig);
    prependHistorik(u ? "Tilldelad " + u.namn : "Tilldelning borttagen");
    toast(u ? "Tilldelad " + u.namn : "Tilldelning borttagen", "ok");
    renderTable();
    renderKanban();
  });
  function prependHistorik(txt) {
    const now = new Date();
    const meta = now.toISOString().slice(0, 16).replace("T", " ") + " · Anna Lindqvist";
    $("#d-historik").insertAdjacentHTML("afterbegin", '<div class="t-item"><span class="t-dot" style="background:var(--accent)"></span><div><div class="t-body">' + txt + '</div><div class="t-meta">' + meta + "</div></div></div>");
  }
  $("#note-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const inp = $("#note-input");
    const txt = inp.value.trim();
    if (!txt) return;
    const now = new Date().toISOString().slice(0, 16).replace("T", " ");
    $("#d-notes").insertAdjacentHTML("afterbegin", '<div class="note"><div>' + txt + '</div><div class="n-meta">' + now + " · Anna Lindqvist</div></div>");
    inp.value = "";
    prependHistorik("Anteckning tillagd");
    toast("Anteckning sparad", "ok");
  });

  /* ---------- Pipeline / Kanban ---------- */
  function renderKanban() {
    const board = $("#kanban");
    board.innerHTML = D.STATUSAR
      .map((s) => {
        const cards = D.BOLAG.filter((b) => b.status === s.key);
        return (
          '<div class="kcol" data-status="' + s.key + '">' +
          '<div class="kcol-head"><span class="dot" style="background:var(--st-' + s.key + '-dot)"></span>' + s.label +
          '<span class="count">' + cards.length + "</span></div>" +
          '<div class="kcards">' +
          cards
            .map(
              (b) =>
                '<div class="kcard" draggable="true" data-id="' + b.id + '" tabindex="0">' +
                '<div class="k-namn">' + b.namn + "</div>" +
                '<div class="k-meta"><span>' + b.ort + '</span><span class="k-oms">' + D.fmtMkr(Math.max(b.oms1, b.oms2)) + "</span></div>" +
                '<div class="k-foot">' + (b.ansvarig ? D.avatarHtml(b.ansvarig) : '<span class="faint small">Ej tilldelad</span>') + '<span class="days">' + b.dagar + " d</span></div>" +
                "</div>"
            )
            .join("") +
          "</div></div>"
        );
      })
      .join("");

    $$("#kanban .kcard").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        card.classList.add("dragging");
        e.dataTransfer.setData("text/plain", card.dataset.id);
        e.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("dblclick", () => openDetail(Number(card.dataset.id)));
    });
    $$("#kanban .kcol").forEach((col) => {
      col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("dragover"); });
      col.addEventListener("dragleave", () => col.classList.remove("dragover"));
      col.addEventListener("drop", (e) => {
        e.preventDefault();
        col.classList.remove("dragover");
        const id = Number(e.dataTransfer.getData("text/plain"));
        const b = D.BOLAG.find((x) => x.id === id);
        if (!b || b.status === col.dataset.status) return;
        b.status = col.dataset.status;
        renderKanban();
        renderTable();
        toast(b.namn + " flyttad till " + D.statusLabel(b.status), "ok");
      });
    });
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    /* pipelinefördelning av mockupens urval, skalad mot totalsiffror */
    const counts = { ny: 412, kontaktad: 318, dialog: 196, mote: 88, kund: 154, forlorad: 79 };
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    $("#pipe-bar").innerHTML = D.STATUSAR
      .map((s) => '<span style="width:' + (counts[s.key] / total) * 100 + '%;background:var(--st-' + s.key + '-dot)" title="' + s.label + ": " + counts[s.key] + '"></span>')
      .join("");
    $("#pipe-legend").innerHTML = D.STATUSAR
      .map((s) => '<div class="row"><span class="dot" style="background:var(--st-' + s.key + '-dot)"></span>' + s.label + '<span class="count">' + counts[s.key].toLocaleString("sv-SE") + "</span></div>")
      .join("");
    $("#dash-activity").innerHTML = D.AKTIVITETER
      .map((a) => {
        const u = D.userById(a.vem);
        return '<div class="item"><span class="avatar ' + u.cls + '">' + u.id + '</span><span class="txt">' + u.namn.split(" ")[0] + " " + a.txt + '</span><span class="when">' + a.when.slice(5, 16) + "</span></div>";
      })
      .join("");
  }

  /* ---------- Synk ---------- */
  function renderSynk() {
    $("#synk-tbody").innerHTML = D.SYNK_HISTORIK
      .map((r) => {
        const st = r.status === "ok"
          ? '<span class="badge st-kund"><span class="dot"></span>Slutförd</span>'
          : '<span class="badge st-forlorad" style="background:var(--error-bg);color:var(--error)"><span class="dot" style="background:var(--error)"></span>Fel</span>';
        return (
          "<tr>" +
          '<td class="mono">' + r.when + "</td>" +
          "<td>" + r.vem + "</td>" +
          '<td class="num">' + r.hamtade.toLocaleString("sv-SE") + "</td>" +
          '<td class="num">' + r.nya + "</td>" +
          '<td class="num">' + r.uppdaterade + "</td>" +
          '<td class="num">' + r.fel + "</td>" +
          "<td>" + st + "</td>" +
          "</tr>" +
          (r.felmsg ? '<tr><td colspan="7" style="height:auto;padding:0 12px 10px;white-space:normal;"><div class="banner error" style="margin:0"><svg class="icon" viewBox="0 0 16 16" fill="none"><path d="M8 5v4M8 11.5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5"/></svg><span><strong>Synkfel:</strong> ' + r.felmsg + "</span></div></td></tr>" : "")
        );
      })
      .join("");
  }
  $("#sync-btn").addEventListener("click", () => {
    const btn = $("#sync-btn");
    btn.classList.add("loading");
    btn.disabled = true;
    $("#sync-status").textContent = "Hämtar bolag från API …";
    setTimeout(() => {
      btn.classList.remove("loading");
      btn.disabled = false;
      $("#sync-status").textContent = "";
      const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      D.SYNK_HISTORIK.unshift({ when: now, vem: "Anna Lindqvist", hamtade: 1251, nya: 4, uppdaterade: 23, fel: 0, status: "ok" });
      renderSynk();
      toast("Synk slutförd – 4 nya bolag, 23 uppdaterade", "ok");
    }, 2200);
  });

  /* ---------- Admin ---------- */
  function renderAdmin() {
    $("#admin-users").innerHTML = D.ANVANDARE
      .map(
        (u, i) =>
          "<tr>" +
          '<td><span class="ansvarig-cell"><span class="avatar ' + u.cls + '">' + u.id + "</span><span>" + u.namn + "</span></span></td>" +
          '<td class="mono small">' + u.namn.toLowerCase().replace(" ", ".").replace("ö", "o").replace("å", "a").replace("ä", "a").replace("ü", "u").replace("é", "e").replace("ý", "y").replace("ø", "o") + "@grodt.se</td>" +
          "<td>" + u.roll + "</td>" +
          '<td><span class="pill ok"><span class="dot"></span>Aktiv</span></td>' +
          '<td style="text-align:right"><button class="btn btn-sm btn-danger" data-user="' + u.namn + '">Inaktivera</button></td>' +
          "</tr>"
      )
      .join("");
    $$("#admin-users .btn-danger").forEach((btn) =>
      btn.addEventListener("click", () => confirmDialog(
        "Inaktivera konto?",
        btn.dataset.user + " förlorar åtkomst direkt. Kontot kan återaktiveras senare och all historik behålls.",
        "Inaktivera",
        () => toast(btn.dataset.user + " inaktiverad", "info")
      ))
    );
    $("#audit-tbody").innerHTML = D.AUDIT_LOG
      .map((r) => "<tr><td class='mono'>" + r.when + "</td><td>" + r.vem + "</td><td><span class='pill'>" + r.handling + "</span></td><td style='white-space:normal'>" + r.detalj + "</td></tr>")
      .join("");
  }
  $("#new-user-btn").addEventListener("click", () => openModal("#modal-user"));
  $("#modal-user form").addEventListener("submit", (e) => {
    e.preventDefault();
    closeModals();
    toast("Konto skapat – inbjudan skickad till " + $("#nu-email").value, "ok");
    e.target.reset();
  });

  /* ---------- Modal & bekräftelsedialog ---------- */
  function openModal(sel) {
    $(sel).classList.add("open");
    const f = $(sel).querySelector("input, select, button.btn-primary, button.btn-accent");
    if (f) f.focus();
  }
  function closeModals() {
    $$(".modal-backdrop").forEach((m) => m.classList.remove("open"));
  }
  $$(".modal-backdrop").forEach((m) => {
    m.addEventListener("click", (e) => { if (e.target === m) closeModals(); });
  });
  $$("[data-close-modal]").forEach((b) => b.addEventListener("click", closeModals));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

  let confirmCb = null;
  function confirmDialog(title, body, actionLabel, cb) {
    $("#confirm-title").textContent = title;
    $("#confirm-body").textContent = body;
    $("#confirm-action").textContent = actionLabel;
    confirmCb = cb;
    openModal("#modal-confirm");
  }
  $("#confirm-action").addEventListener("click", () => {
    closeModals();
    if (confirmCb) confirmCb();
    confirmCb = null;
  });
  window.grodtConfirm = confirmDialog;

  /* ---------- Designsystemvy: demoknappar ---------- */
  $$("[data-demo-toast]").forEach((b) =>
    b.addEventListener("click", () => toast(b.dataset.demoToast, b.dataset.demoKind || "ok"))
  );
  $("#demo-confirm-btn").addEventListener("click", () =>
    confirmDialog("Ta bort anteckning?", "Anteckningen tas bort permanent. Detta loggas i aktivitetsloggen.", "Ta bort", () => toast("Anteckning borttagen", "info"))
  );
  $("#demo-skeleton-btn").addEventListener("click", () => {
    const wrap = $("#demo-skeleton");
    wrap.style.display = wrap.style.display === "none" ? "block" : "none";
  });

  /* ---------- Radar-SVG ---------- */
  function radarSvg(size, live) {
    return (
      '<svg class="radar-glyph' + (live ? " live" : "") + '" width="' + size + '" height="' + size + '" viewBox="0 0 40 40" fill="none" aria-hidden="true">' +
      '<circle cx="20" cy="20" r="18" stroke="currentColor" stroke-opacity="0.35" stroke-width="1.5"/>' +
      '<circle cx="20" cy="20" r="11" stroke="currentColor" stroke-opacity="0.25" stroke-width="1"/>' +
      '<circle cx="20" cy="20" r="2" fill="currentColor"/>' +
      '<g class="sweep"><path d="M20 20 L20 2 A18 18 0 0 1 32.7 7.3 Z" fill="currentColor" fill-opacity="0.18"/><line x1="20" y1="20" x2="20" y2="2" stroke="currentColor" stroke-width="1.5"/></g>' +
      '<circle class="blip" cx="28" cy="12" r="2.2" fill="#FF0C01"/>' +
      "</svg>"
    );
  }
  window.grodtRadarSvg = radarSvg;
  $$("[data-radar]").forEach((el) => {
    el.innerHTML = radarSvg(Number(el.dataset.size || 40), el.dataset.radar === "live");
  });

  /* ---------- Init ---------- */
  renderTable();
  renderKanban();
  renderDashboard();
  renderSynk();
  renderAdmin();
  renderRoute();
})();
