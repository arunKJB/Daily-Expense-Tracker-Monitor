/* ============================================================
   SHARED-EXPENSES.JS
   You pay a bill for a group -> each friend owes their share.
   Tables: shared_bills (1 row per bill)
           shared_bill_members (1 row per friend who owes)
============================================================ */
let bills = [];
let mode = "EQUAL";            // EQUAL | CUSTOM
let people = 2;
let friends = [{ name: "", amount: "" }];   // people - 1 rows
let statusFilter = "ALL";

document.addEventListener("DOMContentLoaded", async () => {
    $("billDate").value = todayStr();
    await setupPaidBy();
    renderFriendRows();
    bindForm();
    await loadBills();
});

async function setupPaidBy() {
    const list = await fetchCreators();
    fillSelect($("paidBy"), list, null, localStorage.getItem("last_creator") || list[0]);
}

/* ============================================================
   FORM
============================================================ */
function bindForm() {
    $("billForm").addEventListener("submit", (e) => { e.preventDefault(); saveBill(); });
    $("billTotal").addEventListener("input", refreshSplit);
    $("peopleCount").addEventListener("change", () => setPeople(Number($("peopleCount").value)));
    $("minusBtn").addEventListener("click", () => setPeople(people - 1));
    $("plusBtn").addEventListener("click", () => setPeople(people + 1));
    $("modeSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        mode = b.dataset.mode;
        document.querySelectorAll("#modeSeg button").forEach(x => x.classList.toggle("active", x === b));
        renderFriendRows();
    });
    $("billSearch").addEventListener("input", renderBills);
    $("billFrom").addEventListener("change", renderBills);
    $("billTo").addEventListener("change", renderBills);
    $("statusSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        statusFilter = b.dataset.status;
        document.querySelectorAll("#statusSeg button").forEach(x => x.classList.toggle("active", x === b));
        renderBills();
    });
    $("pdfBtn").addEventListener("click", downloadPDF);
}

function setPeople(n) {
    people = Math.min(20, Math.max(2, Number.isFinite(n) ? Math.round(n) : 2));
    $("peopleCount").value = people;
    while (friends.length < people - 1) friends.push({ name: "", amount: "" });
    friends.length = people - 1;
    renderFriendRows();
}

function equalShare() {
    const total = Number($("billTotal").value) || 0;
    return Math.floor((total / people) * 100) / 100;      // each friend pays this
}

function renderFriendRows() {
    const share = equalShare();
    $("friendRows").innerHTML = friends.map((f, i) => `
        <div class="friend-row">
            <span class="avatar">${i + 1}</span>
            <input type="text" class="form-control" list="friendNames" data-i="${i}" data-f="name"
                   placeholder="Friend ${i + 1} name" maxlength="60" value="${esc(f.name)}" autocomplete="off">
            <div class="amount-input amt"><span>₹</span>
                <input type="number" class="form-control" data-i="${i}" data-f="amount" inputmode="decimal" min="0" step="0.01"
                       ${mode === "EQUAL" ? "readonly" : ""} value="${mode === "EQUAL" ? (share || "") : esc(f.amount)}" placeholder="0"></div>
        </div>`).join("");
    $("friendRows").querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
        friends[inp.dataset.i][inp.dataset.f] = inp.value;
        if (inp.dataset.f === "amount") refreshSplit();
    }));
    refreshSplit();
}

function friendAmounts() {
    if (mode === "EQUAL") { const s = equalShare(); return friends.map(() => s); }
    return friends.map(f => Number(f.amount) || 0);
}

function refreshSplit() {
    const total = Number($("billTotal").value) || 0;
    if (mode === "EQUAL") {
        const s = equalShare();
        $("friendRows").querySelectorAll('input[data-f="amount"]').forEach(i => i.value = s || "");
    }
    const get = friendAmounts().reduce((a, b) => a + b, 0);
    const mine = total - get;
    $("pvTotal").textContent = money(total);
    $("pvGet").textContent = money(get);
    $("pvMine").textContent = money(mine);
    $("pvMine").className = mine < 0 ? "up" : "";
}

async function saveBill() {
    const total = Number($("billTotal").value);
    const bill = {
        bill_date: $("billDate").value,
        description: $("billDesc").value.trim(),
        place: $("billPlace").value.trim() || null,
        total_amount: Math.round(total * 100) / 100,
        paid_by: $("paidBy").value,
        people_count: people,
        split_type: mode,
        notes: $("billNotes").value.trim() || null
    };
    const amounts = friendAmounts();
    const names = friends.map(f => f.name.trim().replace(/\s+/g, " "));

    if (!bill.paid_by) return showError("Please choose who paid.");
    if (!bill.bill_date) return showError("Please select the date.");
    if (!bill.description) return showError("Please enter what the bill was for.");
    if (!Number.isFinite(total) || total <= 0) return showError("Please enter the total bill amount.");
    if (names.some(n => !n)) return showError("Please enter every friend's name.");
    if (new Set(names.map(n => n.toLowerCase())).size !== names.length) return showError("Two friends have the same name.");
    if (names.some(n => n.toLowerCase() === bill.paid_by.toLowerCase())) return showError("A friend's name matches the payer's name.");
    if (amounts.some(a => !(a > 0))) return showError("Every friend's share must be more than ₹0.");
    const mine = total - amounts.reduce((a, b) => a + b, 0);
    if (mine < -0.001) return showError("Friends' shares are more than the total bill.");

    const btn = $("saveBillBtn"); setBusy(btn, true, "Saving...");
    try {
        const { data, error } = await db.from("shared_bills").insert(bill).select().single();
        if (error) throw error;
        const rows = names.map((n, i) => ({ bill_id: data.id, friend_name: n, share_amount: Math.round(amounts[i] * 100) / 100 }));
        const { error: mErr } = await db.from("shared_bill_members").insert(rows);
        if (mErr) { await db.from("shared_bills").delete().eq("id", data.id); throw mErr; }   // rollback
        showSuccess(`Saved! You get back ${money(amounts.reduce((a, b) => a + b, 0))}.`);
        $("billDesc").value = ""; $("billTotal").value = ""; $("billPlace").value = ""; $("billNotes").value = "";
        friends = friends.map(f => ({ name: f.name, amount: "" }));     // keep the same friends for the next bill
        renderFriendRows();
        await loadBills();
    } catch (e) { console.error(e); showError(e.message || "Unable to save bill."); }
    finally { setBusy(btn, false); }
}

/* ============================================================
   LOAD + RENDER
============================================================ */
async function loadBills() {
    $("billList").innerHTML = `<div class="empty-state"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</div>`;
    try {
        const { data, error } = await db.from("shared_bills")
            .select("*, shared_bill_members(*)")
            .order("bill_date", { ascending: false }).order("id", { ascending: false });
        if (error) throw error;
        $("setupNotice").classList.add("d-none");
        bills = (data || []).map(b => ({ ...b, members: (b.shared_bill_members || []).sort((x, y) => x.id - y.id) }));
        renderAll();
    } catch (e) {
        console.error(e);
        if (["PGRST205", "42P01"].includes(e.code)) $("setupNotice").classList.remove("d-none");
        $("billList").innerHTML = `<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i>Unable to load bills.</div>`;
        $("oweList").innerHTML = "";
        showError(e.message || "Unable to load shared bills.");
    }
}

function renderAll() {
    const names = [...new Set(bills.flatMap(b => b.members.map(m => m.friend_name)))];
    $("friendNames").innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
    renderSummary(); renderOwe(); renderBills();
}

function renderSummary() {
    const mem = bills.flatMap(b => b.members);
    const pending = mem.filter(m => !m.is_paid), paid = mem.filter(m => m.is_paid);
    $("sumPending").textContent = money(pending.reduce((s, m) => s + Number(m.share_amount), 0));
    $("sumReceived").textContent = money(paid.reduce((s, m) => s + Number(m.share_amount), 0));
    $("sumBills").textContent = bills.length;
    $("sumFriends").textContent = new Set(pending.map(m => m.friend_name.toLowerCase())).size;
}

/* ---------- who owes you ---------- */
function owedGroups() {
    const map = {};
    bills.forEach(b => b.members.forEach(m => {
        if (m.is_paid) return;
        const key = m.friend_name.toLowerCase() + "|" + b.paid_by.toLowerCase();
        const g = (map[key] ||= { friend: m.friend_name, payer: b.paid_by, amount: 0, ids: [], items: [] });
        g.amount += Number(m.share_amount); g.ids.push(m.id); g.items.push(b.description);
    }));
    return Object.values(map).sort((a, b) => b.amount - a.amount);
}
function renderOwe() {
    const groups = owedGroups();
    $("oweList").innerHTML = groups.length ? groups.map((g, i) => `
        <div class="owe-card">
            <span class="avatar">${esc(initial(g.friend))}</span>
            <div class="grow">
                <div class="name">${esc(g.friend)} <span class="text-muted fw-normal">owes ${esc(g.payer)}</span></div>
                <div class="sub">${g.ids.length} bill${g.ids.length > 1 ? "s" : ""} • ${esc(g.items.slice(0, 2).join(", "))}${g.items.length > 2 ? "…" : ""}</div>
            </div>
            <div class="amt">${money(g.amount)}</div>
            <a class="btn btn-icon btn-outline-success" target="_blank" rel="noopener" title="Remind on WhatsApp"
               href="https://wa.me/?text=${encodeURIComponent(`Hi ${g.friend}, a gentle reminder: you owe ₹${g.amount.toFixed(2)} to ${g.payer} for ${[...new Set(g.items)].join(", ")}. Please send it when you can. Thanks! 🙏`)}">
               <i class="fa-brands fa-whatsapp"></i></a>
            <button class="btn btn-icon btn-soft" title="Mark all as paid" onclick="settleGroup(${i})"><i class="fa-solid fa-check-double"></i></button>
        </div>`).join("")
        : `<div class="empty-state py-4"><i class="fa-solid fa-face-smile"></i>Nobody owes you anything. All settled!</div>`;
}
async function settleGroup(i) {
    const g = owedGroups()[i]; if (!g) return;
    if (!(await confirmDialog(`Mark ${money(g.amount)} from ${g.friend} as received?`, "Mark received", "success"))) return;
    try {
        const { error } = await db.from("shared_bill_members").update({ is_paid: true, paid_on: todayStr() }).in("id", g.ids);
        if (error) throw error;
        showSuccess(`${g.friend} settled ${money(g.amount)}.`);
        await loadBills();
    } catch (e) { showError(e.message || "Unable to update."); }
}

/* ---------- bill list ---------- */
function billStats(b) {
    const total = b.members.reduce((s, m) => s + Number(m.share_amount), 0);
    const got = b.members.filter(m => m.is_paid).reduce((s, m) => s + Number(m.share_amount), 0);
    return { total, got, left: total - got, settled: b.members.length > 0 && got >= total - 0.001 };
}
function filteredBills() {
    const q = $("billSearch").value.trim().toLowerCase(), from = $("billFrom").value, to = $("billTo").value;
    return bills.filter(b => {
        const d = String(b.bill_date).slice(0, 10), st = billStats(b);
        if (from && d < from) return false;
        if (to && d > to) return false;
        if (statusFilter === "PENDING" && st.settled) return false;
        if (statusFilter === "SETTLED" && !st.settled) return false;
        if (q && !`${b.description} ${b.place || ""} ${b.paid_by} ${b.members.map(m => m.friend_name).join(" ")}`.toLowerCase().includes(q)) return false;
        return true;
    });
}
function renderBills() {
    const list = filteredBills();
    $("billList").innerHTML = list.length ? list.map(b => {
        const st = billStats(b), pct = st.total ? (st.got / st.total) * 100 : 0;
        return `
        <div class="bill">
            <div class="bill-head">
                <div>
                    <h5>${esc(b.description)}</h5>
                    <div class="bill-meta"><i class="fa-regular fa-calendar me-1"></i>${fmtDate(b.bill_date)}
                        ${b.place ? ` • <i class="fa-solid fa-store me-1"></i>${esc(b.place)}` : ""}
                        • Paid by <b>${esc(b.paid_by)}</b> • ${b.people_count} people</div>
                </div>
                <div class="bill-total"><strong>${money(b.total_amount)}</strong>
                    <span class="tag ${st.settled ? "green" : "orange"}">${st.settled ? "Settled" : "Pending " + money(st.left)}</span></div>
            </div>
            <div class="progress-x"><div style="width:${pct}%"></div></div>
            ${b.members.map(m => `
            <div class="member ${m.is_paid ? "paid" : ""}">
                <span class="avatar" style="width:30px;height:30px;font-size:.78rem">${esc(initial(m.friend_name))}</span>
                <div class="grow"><div class="nm">${esc(m.friend_name)}</div>
                    <div class="bill-meta">${m.is_paid ? `Paid ${m.paid_on ? fmtDate(m.paid_on) : ""}` : "Not paid yet"}</div></div>
                <div class="sh">${money(m.share_amount)}</div>
                ${m.is_paid
                    ? `<button class="btn btn-sm btn-soft" onclick="togglePaid(${m.id}, false)" title="Undo"><i class="fa-solid fa-rotate-left"></i></button>`
                    : `<button class="btn btn-sm btn-primary" onclick="togglePaid(${m.id}, true)"><i class="fa-solid fa-check me-1"></i>Paid</button>`}
            </div>`).join("")}
            <div class="bill-foot">
                <span>${b.notes ? `<i class="fa-regular fa-note-sticky me-1"></i>${esc(b.notes)}` : `${esc(b.paid_by)}'s own share: ${money(Number(b.total_amount) - st.total)}`}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteBill(${b.id})"><i class="fa-solid fa-trash me-1"></i>Delete</button>
            </div>
        </div>`;
    }).join("") : `<div class="empty-state"><i class="fa-solid fa-receipt"></i>No bills found.</div>`;
}

async function togglePaid(id, paid) {
    try {
        const { error } = await db.from("shared_bill_members").update({ is_paid: paid, paid_on: paid ? todayStr() : null }).eq("id", id);
        if (error) throw error;
        showSuccess(paid ? "Marked as paid." : "Marked as not paid.");
        await loadBills();
    } catch (e) { showError(e.message || "Unable to update."); }
}
async function deleteBill(id) {
    if (!(await confirmDialog("Delete this bill and all its friend shares?"))) return;
    try {
        const { error } = await db.from("shared_bills").delete().eq("id", id);   // members are removed by ON DELETE CASCADE
        if (error) throw error;
        showSuccess("Bill deleted.");
        await loadBills();
    } catch (e) { showError(e.message || "Unable to delete."); }
}

/* ---------- PDF ---------- */
function downloadPDF() {
    const list = filteredBills();
    if (!list.length) return showError("No bills to export.");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const rs = (n) => "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    doc.setFontSize(18); doc.text("Shared Expenses Report", 40, 42);
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`Generated: ${fmtDate(todayStr())}`, 40, 60);
    const body = [];
    let pending = 0;
    list.forEach(b => b.members.forEach(m => {
        if (!m.is_paid) pending += Number(m.share_amount);
        body.push([fmtDate(b.bill_date), b.description, b.paid_by, rs(b.total_amount), m.friend_name, rs(m.share_amount), m.is_paid ? "Paid" : "Pending"]);
    }));
    doc.autoTable({
        startY: 76,
        head: [["Date", "Bill", "Paid by", "Bill total", "Friend", "Friend's share", "Status"]],
        body,
        foot: [[{ content: "Still to receive", colSpan: 5, styles: { halign: "right" } }, rs(pending), ""]],
        styles: { fontSize: 9, cellPadding: 5 }, headStyles: { fillColor: [79, 70, 229] }, footStyles: { fillColor: [238, 240, 251], textColor: 30 }
    });
    doc.save(`shared-expenses-${todayStr()}.pdf`);
}
