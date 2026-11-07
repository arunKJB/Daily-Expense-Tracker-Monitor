/* ============================================================
   EXPENSE.JS  -  View / filter / edit / delete / PDF
============================================================ */
let allExpenses = [], filtered = [];
let page = 1, rowsPerPage = 10;
let activeRange = "all", editingId = null;
const F = { creator: "ALL", type: "ALL", from: "", to: "", q: "" };

document.addEventListener("DOMContentLoaded", async () => {
    fillSelect($("editCategory"), CATEGORIES, "Select category");
    bindFilters();
    await loadExpenses();
});

/* ---------------- load ---------------- */
async function loadExpenses() {
    $("expenseTableBody").innerHTML =
        `<tr><td colspan="9" class="text-center py-5 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading expenses...</td></tr>`;
    try {
        const [{ data, error }, types, creators] = await Promise.all([
            db.from("expenses").select("*").order("expense_date", { ascending: false }).order("id", { ascending: false }),
            fetchExpenseTypes().catch(() => []),
            fetchCreators()
        ]);
        if (error) throw error;
        allExpenses = data || [];

        const usedCreators = allExpenses.map(e => (e.creator || "").trim()).filter(Boolean);
        const usedTypes = allExpenses.map(e => (e.expense_type || "").trim()).filter(Boolean);
        const creatorList = [...new Set([...creators, ...usedCreators])].sort((a, b) => a.localeCompare(b));
        const typeList = [...new Set([...types, ...usedTypes])].sort((a, b) => a.localeCompare(b));

        fillSelect($("creatorFilter"), creatorList, "All creators"); $("creatorFilter").options[0].value = "ALL";
        fillSelect($("typeFilter"), typeList, "All types"); $("typeFilter").options[0].value = "ALL";
        fillSelect($("editCreator"), creatorList, "Select creator");
        fillSelect($("editExpenseType"), typeList, "Select type");
        applyFilters();
    } catch (e) {
        console.error(e);
        $("expenseTableBody").innerHTML =
            `<tr><td colspan="9" class="text-center text-danger py-4"><i class="fa-solid fa-circle-exclamation me-2"></i>Unable to load expenses.</td></tr>`;
        showError(e.message || "Unable to load expenses.");
    }
}

/* ---------------- filters ---------------- */
function rangeDates(key) {
    const now = new Date(), t = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const add = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    switch (key) {
        case "today": return [ymd(t), ymd(t)];
        case "yesterday": return [ymd(add(t, -1)), ymd(add(t, -1))];
        case "week": { const dow = (t.getDay() + 6) % 7; return [ymd(add(t, -dow)), ymd(t)]; }
        case "month": return [ymd(new Date(t.getFullYear(), t.getMonth(), 1)), ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0))];
        case "lastmonth": return [ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ymd(new Date(t.getFullYear(), t.getMonth(), 0))];
        default: return ["", ""];
    }
}
function setRange(key) {
    activeRange = key;
    document.querySelectorAll("#rangeChips .chip").forEach(c => c.classList.toggle("active", c.dataset.range === key));
    if (key !== "custom") {
        [F.from, F.to] = rangeDates(key);
        $("fromDate").value = F.from; $("toDate").value = F.to;
    }
    page = 1; applyFilters();
}
function bindFilters() {
    $("rangeChips").addEventListener("click", (e) => {
        const chip = e.target.closest(".chip"); if (!chip) return;
        if (chip.dataset.range === "custom") { setRange("custom"); $("fromDate").focus(); }
        else setRange(chip.dataset.range);
    });
    const customChange = () => {
        F.from = $("fromDate").value; F.to = $("toDate").value;
        if (F.from && F.to && F.from > F.to) { [F.from, F.to] = [F.to, F.from]; $("fromDate").value = F.from; $("toDate").value = F.to; }
        activeRange = F.from || F.to ? "custom" : "all";
        document.querySelectorAll("#rangeChips .chip").forEach(c => c.classList.toggle("active", c.dataset.range === activeRange));
        page = 1; applyFilters();
    };
    $("fromDate").addEventListener("change", customChange);
    $("toDate").addEventListener("change", customChange);
    $("creatorFilter").addEventListener("change", (e) => { F.creator = e.target.value; page = 1; applyFilters(); });
    $("typeFilter").addEventListener("change", (e) => { F.type = e.target.value; page = 1; applyFilters(); });
    let timer;
    $("searchBox").addEventListener("input", (e) => { clearTimeout(timer); timer = setTimeout(() => { F.q = e.target.value.trim().toLowerCase(); page = 1; applyFilters(); }, 200); });
    $("rowsPerPage").addEventListener("change", (e) => { rowsPerPage = Number(e.target.value); page = 1; render(); });
    $("clearFilterBtn").addEventListener("click", () => {
        Object.assign(F, { creator: "ALL", type: "ALL", from: "", to: "", q: "" });
        $("creatorFilter").value = "ALL"; $("typeFilter").value = "ALL"; $("searchBox").value = "";
        setRange("all");
    });
    $("pdfBtn").addEventListener("click", downloadPDF);
    $("updateBtn").addEventListener("click", updateExpense);
}
function applyFilters() {
    filtered = allExpenses.filter(e => {
        const d = String(e.expense_date || "").slice(0, 10);
        if (F.from && d < F.from) return false;
        if (F.to && d > F.to) return false;
        if (F.creator !== "ALL" && (e.creator || "").trim() !== F.creator) return false;
        if (F.type !== "ALL" && (e.expense_type || "").trim() !== F.type) return false;
        if (F.q && !`${e.comment || ""} ${e.category || ""} ${e.expense_type || ""}`.toLowerCase().includes(F.q)) return false;
        return true;
    });
    render();
}

/* ---------------- render ---------------- */
function totalPages() { return Math.max(1, Math.ceil(filtered.length / rowsPerPage)); }
function render() {
    page = Math.min(page, totalPages());
    const start = (page - 1) * rowsPerPage;
    const rows = filtered.slice(start, start + rowsPerPage);
    const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
    const pageTotal = rows.reduce((s, e) => s + Number(e.amount || 0), 0);

    $("totalEntries").textContent = filtered.length;
    $("todayEntries").textContent = allExpenses.filter(e => String(e.expense_date).slice(0, 10) === todayStr()).length;
    $("totalAmount").textContent = money(total);
    $("tableGrandTotal").textContent = money(total);
    $("pageGrandTotal").textContent = money(pageTotal);

    const parts = [];
    if (F.from || F.to) parts.push(`<b>${F.from ? fmtDate(F.from) : "Start"}</b> → <b>${F.to ? fmtDate(F.to) : "Today"}</b>`);
    if (F.creator !== "ALL") parts.push(`Creator: <b>${esc(F.creator)}</b>`);
    if (F.type !== "ALL") parts.push(`Type: <b>${esc(F.type)}</b>`);
    if (F.q) parts.push(`Search: <b>${esc(F.q)}</b>`);
    $("filterSummary").innerHTML = parts.length ? "Showing " + parts.join(" • ") : "Showing all expenses";
    $("rangeText").textContent = F.from || F.to ? `${F.from ? fmtDate(F.from) : "Start"} to ${F.to ? fmtDate(F.to) : "Today"}` : "All submitted expenses";

    $("emptyMessage").style.display = filtered.length ? "none" : "block";
    $("expenseTable").style.display = filtered.length ? "" : "none";

    $("expenseTableBody").innerHTML = rows.map((e, i) => `
        <tr>
            <td data-label="#"><strong>${start + i + 1}</strong></td>
            <td data-label="Creator"><span class="d-inline-flex align-items-center gap-2"><span class="avatar" style="width:28px;height:28px;font-size:.75rem">${esc(initial(e.creator))}</span>${esc(e.creator)}</span></td>
            <td data-label="Date">${fmtDate(e.expense_date)}</td>
            <td data-label="Time">${fmtTime(e.expense_time)}</td>
            <td data-label="Type"><span class="tag">${esc(e.expense_type)}</span></td>
            <td data-label="Category"><span class="tag gray">${esc(e.category)}</span></td>
            <td data-label="Description" class="description-cell">${esc(e.comment)}</td>
            <td data-label="Amount" class="amount-cell">${money(e.amount)}</td>
            <td class="action-cell text-center">
                <button class="btn btn-sm btn-soft btn-icon" onclick="openEdit(${e.id})" title="Edit"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-sm btn-icon btn-outline-danger" onclick="deleteExpense(${e.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`).join("");

    renderPager(start, rows.length);
}
function renderPager(start, count) {
    const tp = totalPages();
    if (!filtered.length) { $("pager").innerHTML = ""; return; }
    let nums = [];
    for (let p = 1; p <= tp; p++) if (p === 1 || p === tp || Math.abs(p - page) <= 1) nums.push(p);
    let html = "", prev = 0;
    nums.forEach(p => {
        if (p - prev > 1) html += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        html += `<li class="page-item ${p === page ? "active" : ""}"><a class="page-link" href="#" data-p="${p}">${p}</a></li>`; prev = p;
    });
    $("pager").innerHTML = `
        <div>Showing ${start + 1}–${start + count} of ${filtered.length}</div>
        <ul class="pagination">
            <li class="page-item ${page === 1 ? "disabled" : ""}"><a class="page-link" href="#" data-p="${page - 1}"><i class="fa-solid fa-chevron-left"></i></a></li>
            ${html}
            <li class="page-item ${page === tp ? "disabled" : ""}"><a class="page-link" href="#" data-p="${page + 1}"><i class="fa-solid fa-chevron-right"></i></a></li>
        </ul>`;
    $("pager").querySelectorAll("[data-p]").forEach(a => a.addEventListener("click", (ev) => {
        ev.preventDefault(); const p = Number(a.dataset.p);
        if (p >= 1 && p <= tp && p !== page) { page = p; render(); $("expenseTable").scrollIntoView({ behavior: "smooth", block: "start" }); }
    }));
}

/* ---------------- edit / delete ---------------- */
function openEdit(id) {
    const e = allExpenses.find(x => x.id === id); if (!e) return;
    editingId = id;
    $("editCreator").value = e.creator || "";
    $("editDate").value = String(e.expense_date || "").slice(0, 10);
    $("editTime").value = e.expense_time ? String(e.expense_time).slice(0, 5) : "";
    $("editExpenseType").value = e.expense_type || "";
    $("editCategory").value = e.category || "";
    $("editComment").value = e.comment || "";
    $("editAmount").value = e.amount;
    bootstrap.Modal.getOrCreateInstance($("editModal")).show();
}
async function updateExpense() {
    const v = {
        creator: $("editCreator").value, expense_date: $("editDate").value,
        expense_time: $("editTime").value || null, expense_type: $("editExpenseType").value,
        category: $("editCategory").value, comment: $("editComment").value.trim(), amount: Number($("editAmount").value)
    };
    if (!v.creator || !v.expense_date || !v.expense_type || !v.category || !v.comment) return showError("Please fill all required fields.");
    if (!Number.isFinite(v.amount) || v.amount <= 0) return showError("Please enter a valid amount.");
    const btn = $("updateBtn"); setBusy(btn, true, "Updating...");
    try {
        const { error } = await db.from("expenses").update(v).eq("id", editingId);
        if (error) throw error;
        bootstrap.Modal.getInstance($("editModal")).hide();
        showSuccess("Expense updated.");
        await loadExpenses();
    } catch (e) { showError(e.message || "Unable to update."); }
    finally { setBusy(btn, false); }
}
async function deleteExpense(id) {
    if (!(await confirmDialog("Delete this expense? This cannot be undone."))) return;
    try {
        const { error } = await db.from("expenses").delete().eq("id", id);
        if (error) throw error;
        showSuccess("Expense deleted.");
        await loadExpenses();
    } catch (e) { showError(e.message || "Unable to delete."); }
}

/* ---------------- PDF (respects current filters) ---------------- */
function downloadPDF() {
    if (!filtered.length) return showError("No expenses to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const rs = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFontSize(18); doc.text("Daily Expense Report", 40, 42);
    doc.setFontSize(10); doc.setTextColor(100);
    const range = F.from || F.to ? `${F.from ? fmtDate(F.from) : "Start"} to ${F.to ? fmtDate(F.to) : "Today"}` : "All dates";
    doc.text(`Range: ${range}   |   Creator: ${F.creator === "ALL" ? "All" : F.creator}   |   Type: ${F.type === "ALL" ? "All" : F.type}   |   Generated: ${fmtDate(todayStr())}`, 40, 60);
    const total = filtered.reduce((s, e) => s + Number(e.amount || 0), 0);
    doc.autoTable({
        startY: 76,
        head: [["#", "Creator", "Date", "Time", "Type", "Category", "Description", "Amount"]],
        body: filtered.map((e, i) => [i + 1, e.creator || "", fmtDate(e.expense_date), fmtTime(e.expense_time), e.expense_type || "", e.category || "", e.comment || "", rs(e.amount)]),
        foot: [[{ content: "Grand Total", colSpan: 7, styles: { halign: "right" } }, rs(total)]],
        styles: { fontSize: 9, cellPadding: 5 },
        headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [238, 240, 251], textColor: 30 },
        columnStyles: { 6: { cellWidth: 220 }, 7: { halign: "right" } }
    });
    doc.save(`expenses-${todayStr()}.pdf`);
}
