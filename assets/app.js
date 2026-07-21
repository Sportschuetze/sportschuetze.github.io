// Schiesskompass – Katalog-Ansicht (read-only)
// Lädt den publizierten Katalog direkt aus dem öffentlichen Repo (Raw-URL,
// dieselbe Quelle wie der OTA-Pull der App) und rendert Programme + Scheiben.

const RAW_BASE = "https://raw.githubusercontent.com/Sportschuetze/Schiesskompass/main/";

const state = { catalog: null, tab: "programs", query: "", discipline: "" };

document.getElementById("year").textContent = new Date().getFullYear();

init();
loadSources();

async function init() {
    try {
        const res = await fetch(RAW_BASE + "catalog.json", { cache: "no-cache" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        state.catalog = await res.json();
        setupControls();
        document.getElementById("status").hidden = true;
        render();
    } catch (e) {
        const s = document.getElementById("status");
        s.className = "status err";
        s.textContent = "Katalog konnte nicht geladen werden (" + e.message + ").";
    }
}

// Quellen-Abschnitt mit Dokumentanzahl + Abrufdatum aus dem Manifest anreichern.
// Nur öffentliche, offizielle Quellen; scheitert still (statischer Text bleibt).
async function loadSources() {
    const year = new Date().getFullYear();
    for (const y of [year, year - 1, 2026]) {
        try {
            const res = await fetch(RAW_BASE + "manifest/manifest-" + y + ".json", { cache: "no-cache" });
            if (!res.ok) continue;
            const m = await res.json();
            const n = (m.eintraege || []).length;
            const src = (m.quelle && m.quelle.name) || "Schweizer Schiesssportverband (SSV)";
            const date = m.abgerufen ? new Date(m.abgerufen).toLocaleDateString("de-CH") : null;
            const el = document.getElementById("sources-text");
            if (el && n) {
                el.innerHTML = `Der Katalog ${m.jahr || y} beruht auf <strong>${n}</strong> offiziellen `
                    + `Dokumenten des <a href="https://www.swissshooting.ch">${esc(src)}</a>`
                    + (date ? `, ausgewertet am ${esc(date)}` : "")
                    + `. Massgebend bleiben stets die offiziellen Dokumente der Verbände und Vereine.`;
            }
            return;
        } catch (e) { /* still weiter */ }
    }
}

function setupControls() {
    const c = state.catalog;
    document.getElementById("version-label").textContent =
        "Version " + (c.catalogLabel || c.catalogVersion || "?");

    // Disziplin-Filter aus den Disziplin-Codes befüllen.
    const sel = document.getElementById("filter-discipline");
    const byCode = disciplineMap();
    [...new Set([...(c.programs || []).map(p => p.disciplineCode),
                 ...(c.targets || []).map(t => t.disciplineCode)])]
        .filter(Boolean).sort()
        .forEach(code => {
            const o = document.createElement("option");
            o.value = code;
            o.textContent = byCode[code] || code;
            sel.appendChild(o);
        });

    document.getElementById("q").addEventListener("input", e => { state.query = e.target.value.toLowerCase(); render(); });
    sel.addEventListener("change", e => { state.discipline = e.target.value; render(); });
    document.querySelectorAll(".tabbar button").forEach(btn => {
        btn.addEventListener("click", () => {
            state.tab = btn.dataset.tab;
            document.querySelectorAll(".tabbar button").forEach(b => b.classList.toggle("active", b === btn));
            render();
        });
    });
}

function disciplineMap() {
    const m = {};
    (state.catalog.disciplines || []).forEach(d => { m[d.code] = d.name; });
    return m;
}

function render() {
    const showPrograms = state.tab === "programs";
    document.getElementById("view-programs").hidden = !showPrograms;
    document.getElementById("view-targets").hidden = showPrograms;
    if (showPrograms) renderPrograms(); else renderTargets();
}

function matches(text) {
    return !state.query || (text || "").toLowerCase().includes(state.query);
}

function renderPrograms() {
    const c = state.catalog;
    const byCode = disciplineMap();
    const el = document.getElementById("view-programs");
    el.innerHTML = "";

    const programs = (c.programs || [])
        .filter(p => !state.discipline || p.disciplineCode === state.discipline)
        .filter(p => matches(p.name) || matches(p.programType) || matches(byCode[p.disciplineCode]))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

    if (!programs.length) { el.innerHTML = emptyMsg(); return; }

    programs.forEach(p => {
        const parts = (c.programParts || [])
            .filter(pp => pp.programExternalId === p.externalId)
            .sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0));
        const kranz = (c.kranzRequirements || []).filter(k => k.programExternalId === p.externalId);

        const div = document.createElement("div");
        div.className = "prog";
        div.innerHTML = `
            <header>
                <h3>${esc(p.name)}</h3>
                <span class="badge accent">${esc(byCode[p.disciplineCode] || p.disciplineCode || "")}</span>
            </header>
            <div class="meta">
                ${p.programType ? `<span class="badge">${esc(p.programType)}</span>` : ""}
                ${p.programLevel ? `<span class="badge">${esc(p.programLevel)}</span>` : ""}
                ${p.ammunitionDefault ? `<span class="badge">${esc(p.ammunitionDefault)}</span>` : ""}
            </div>
            ${parts.length ? `<ul class="parts">${parts.map(partRow).join("")}</ul>` : ""}
            ${kranz.length ? kranzTable(kranz) : ""}
        `;
        el.appendChild(div);
    });
}

function partRow(pp) {
    const detail = [
        pp.totalShots ? pp.totalShots + " Schuss" : null,
        pp.distanceMeters ? pp.distanceMeters + " m" : null,
        pp.fireMode || null,
        pp.timeLimitSeconds ? pp.timeLimitSeconds + " s" : null
    ].filter(Boolean).join(" · ");
    return `<li><span>${esc(pp.name)}</span><span class="pdetail">${esc(detail)}</span></li>`;
}

function kranzTable(rows) {
    const label = { kranz: "Kranz", anerkennung: "Anerkennung", auszeichnung: "Auszeichnung" };
    const body = rows
        .sort((a, b) => (a.ageCategoryRaw || "").localeCompare(b.ageCategoryRaw || ""))
        .map(k => `<tr>
            <td>${esc(cap(k.ageCategoryRaw))}</td>
            <td>${esc(label[k.kindRaw] || cap(k.kindRaw))}</td>
            <td>${k.requiredPoints ?? "–"}</td>
        </tr>`).join("");
    return `<details class="kranz"><summary>Kranz-Anforderungen (${rows.length})</summary>
        <table><thead><tr><th>Kategorie</th><th>Art</th><th>Punkte</th></tr></thead>
        <tbody>${body}</tbody></table></details>`;
}

function renderTargets() {
    const c = state.catalog;
    const byCode = disciplineMap();
    const el = document.getElementById("view-targets");
    el.innerHTML = "";

    const targets = (c.targets || [])
        .filter(t => !state.discipline || t.disciplineCode === state.discipline)
        .filter(t => matches(t.name) || matches(t.descriptionText) || matches(byCode[t.disciplineCode]))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));

    if (!targets.length) { el.innerHTML = emptyMsg(); return; }

    const grid = document.createElement("div");
    grid.className = "targets-grid";
    targets.forEach(t => {
        const dist = (t.distanceOptionsMeters && t.distanceOptionsMeters.length
            ? t.distanceOptionsMeters.join("/") : t.distanceMeters) || "";
        const card = document.createElement("div");
        card.className = "tcard";
        card.innerHTML = `
            <div class="imgbox">
                ${t.imagePath ? `<img loading="lazy" alt="${esc(t.name)}" src="${RAW_BASE}${esc(t.imagePath)}">` : "—"}
            </div>
            <div class="tbody">
                <h4>${esc(t.name)}</h4>
                <div class="tmeta">
                    ${esc(byCode[t.disciplineCode] || t.disciplineCode || "")}${dist ? " · " + esc(String(dist)) + " m" : ""}
                </div>
            </div>`;
        grid.appendChild(card);
    });
    el.appendChild(grid);
}

function emptyMsg() { return `<div class="status">Keine Einträge für die aktuelle Auswahl.</div>`; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
