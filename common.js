/* ============================================================
   COMMON.JS  -  shared by every page
   Supabase client, navbar, toast, confirm dialog, helpers,
   creators (Arun / Joy / add new)
============================================================ */

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CATEGORIES = [
    "Electric Things", "Plumbing Things", "Mesthiry", "Breakfast",
    "Lunch", "Dinner", "Transport", "Accommodation", "Other"
];
const DEFAULT_CREATORS = ["Arun", "Joy"];

/* ---------- small helpers ---------- */
const $ = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function money(n) {
    return "₹" + Number(n || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
    });
}
function pad(n) { return String(n).padStart(2, "0"); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function todayStr() { return ymd(new Date()); }
function nowTimeStr() { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(s) {
    if (!s) return "-";
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(s) {
    if (!s) return "-";
    const [h, m] = String(s).split(":").map(Number);
    const d = new Date(); d.setHours(h, m || 0);
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}
function initial(name) { return (String(name || "?").trim()[0] || "?").toUpperCase(); }
function fillSelect(select, items, placeholder, selected) {
    if (!select) return;
    const keep = selected ?? select.value;
    select.innerHTML = (placeholder !== null ? `<option value="">${esc(placeholder)}</option>` : "") +
        items.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (keep && items.includes(keep)) select.value = keep;
}
function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) {
        btn.dataset.html = btn.innerHTML; btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${text || "Please wait..."}`;
    } else {
        btn.disabled = false;
        if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
    }
}

/* ---------- toast ---------- */
function toast(message, type = "success") {
    let wrap = $("toastWrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.id = "toastWrap"; wrap.className = "toast-wrap"; document.body.appendChild(wrap); }
    const icon = { success: "fa-circle-check", error: "fa-circle-exclamation", info: "fa-circle-info" }[type] || "fa-circle-info";
    const el = document.createElement("div");
    el.className = `app-toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icon}"></i><span>${esc(message)}</span>`;
    wrap.appendChild(el);
    setTimeout(() => { el.classList.add("hide"); setTimeout(() => el.remove(), 320); }, 3200);
}
const showSuccess = (m) => toast(m, "success");
const showError = (m) => toast(m, "error");

/* ---------- confirm dialog (returns Promise<boolean>) ---------- */
function confirmDialog(message, okText = "Delete", variant = "danger") {
    return new Promise((resolve) => {
        let el = $("confirmModal");
        if (!el) {
            el = document.createElement("div");
            el.className = "modal fade"; el.id = "confirmModal"; el.tabIndex = -1;
            el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-sm"><div class="modal-content">
              <div class="modal-body text-center p-4">
                <div id="confirmIcon" class="stat-icon mx-auto mb-3" style="width:58px;height:58px"><i class="fa-solid fa-triangle-exclamation fa-lg"></i></div>
                <p id="confirmMsg" class="mb-4 fw-semibold"></p>
                <div class="d-flex gap-2"><button class="btn btn-soft flex-fill" data-bs-dismiss="modal">Cancel</button>
                <button class="btn flex-fill" id="confirmOk"></button></div>
              </div></div></div>`;
            document.body.appendChild(el);
        }
        $("confirmMsg").textContent = message;
        $("confirmOk").textContent = okText;
        $("confirmOk").className = `btn flex-fill ${variant === "danger" ? "btn-danger" : "btn-primary"}`;
        $("confirmIcon").className = `stat-icon mx-auto mb-3 ${variant === "danger" ? "red" : "green"}`;
        $("confirmIcon").innerHTML = `<i class="fa-solid ${variant === "danger" ? "fa-triangle-exclamation" : "fa-circle-check"} fa-lg"></i>`;
        const modal = bootstrap.Modal.getOrCreateInstance(el);
        let result = false;
        $("confirmOk").onclick = () => { result = true; modal.hide(); };
        el.addEventListener("hidden.bs.modal", () => resolve(result), { once: true });
        modal.show();
    });
}

/* ============================================================
   NAVBAR  (one place - appears on every page)
============================================================ */
const NAV_ITEMS = [
    { page: "index",     href: "index.html",           icon: "fa-circle-plus",        label: "Add Expense",    short: "Add" },
    { page: "expense",   href: "expense.html",         icon: "fa-table-list",         label: "View Expenses",  short: "Expenses" },
    { page: "dashboard", href: "dashboard.html",       icon: "fa-chart-column",       label: "Dashboard",      short: "Dashboard" },
    { page: "shared",    href: "shared-expenses.html", icon: "fa-hand-holding-dollar", label: "Shared Expenses", short: "Shared" }
];
function renderNavbar() {
    const current = document.body.dataset.page;
    const links = (cls) => NAV_ITEMS.map(i =>
        `<a href="${i.href}" class="${i.page === current ? "active" : ""}"><i class="fa-solid ${i.icon}"></i>${cls === "tab" ? i.short : i.label}</a>`).join("");
    const html = `
    <nav class="app-nav"><div class="container inner">
        <a class="brand" href="index.html">
            <span class="brand-badge"><i class="fa-solid fa-indian-rupee-sign"></i></span>
            <span>Daily Expense</span>
        </a>
        <div class="nav-links">${links("top")}</div>
        <div class="date-pill show-mobile"><i class="fa-regular fa-calendar"></i><span id="currentDate"></span></div>
    </div></nav>
    <div class="tabbar">${links("tab")}</div>`;
    document.body.insertAdjacentHTML("afterbegin", html);
    const d = $("currentDate");
    if (d) d.textContent = new Date().toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}
document.addEventListener("DOMContentLoaded", renderNavbar);

/* ============================================================
   CREATORS  (Arun, Joy + anything added with the Add button)
   Stored in Supabase table "creators". If that table does not
   exist yet, the app falls back to Arun/Joy + this browser's
   local list so nothing breaks.
============================================================ */
async function fetchCreators() {
    try {
        const { data, error } = await db.from("creators").select("name").order("id");
        if (error) throw error;
        const names = (data || []).map(r => r.name);
        return names.length ? names : [...DEFAULT_CREATORS];
    } catch (e) {
        console.warn("creators table not available, using local list:", e.message || e);
        const extra = JSON.parse(localStorage.getItem("creators_local") || "[]");
        return [...new Set([...DEFAULT_CREATORS, ...extra])];
    }
}
async function insertCreator(name) {
    name = name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error("Please enter a name.");
    const existing = await fetchCreators();
    if (existing.some(n => n.toLowerCase() === name.toLowerCase()))
        throw new Error("This creator already exists.");
    const { error } = await db.from("creators").insert({ name });
    if (error) {
        if (["PGRST205", "42P01"].includes(error.code)) {      // table missing -> local fallback
            const extra = JSON.parse(localStorage.getItem("creators_local") || "[]");
            localStorage.setItem("creators_local", JSON.stringify([...extra, name]));
            return name;
        }
        throw error;
    }
    return name;
}

/* wires up a "Creator" <select> + its Add button + modal */
async function setupCreatorDropdown({ selectId, addBtnId, modalId, inputId, saveBtnId, remember = true }) {
    const select = $(selectId);
    async function refresh(selected) {
        const list = await fetchCreators();
        fillSelect(select, list, "Select creator", selected ?? (remember ? localStorage.getItem("last_creator") : null) ?? select.value);
    }
    await refresh();
    if (remember) select.addEventListener("change", () => localStorage.setItem("last_creator", select.value));

    const modalEl = $(modalId), input = $(inputId), saveBtn = $(saveBtnId);
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    $(addBtnId).addEventListener("click", () => { input.value = ""; modal.show(); setTimeout(() => input.focus(), 350); });
    async function save() {
        setBusy(saveBtn, true, "Saving...");
        try {
            const name = await insertCreator(input.value);
            await refresh(name);
            if (remember) localStorage.setItem("last_creator", name);
            modal.hide();
            showSuccess(`Creator "${name}" added.`);
        } catch (e) { showError(e.message || "Unable to add creator."); }
        finally { setBusy(saveBtn, false); }
    }
    saveBtn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
    return refresh;
}

/* ---------- expense types (shared by index + expense pages) ---------- */
async function fetchExpenseTypes() {
    const { data, error } = await db.from("expense_types").select("name").order("name");
    if (error) throw error;
    return (data || []).map(r => r.name);
}
