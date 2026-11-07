/* ============================================================
   DASHBOARD.JS
============================================================ */
let expenses = [], monthMap = {}, span = 6;

document.addEventListener("DOMContentLoaded", () => {
    $("refreshBtn").addEventListener("click", loadDashboard);
    $("spanSeg").addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        span = Number(b.dataset.span);
        document.querySelectorAll("#spanSeg button").forEach(x => x.classList.toggle("active", x === b));
        drawChart();
    });
    loadDashboard();
});

const mKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const mName = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };
const mShort = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" }); };
function shiftKey(key, n) { const [y, m] = key.split("-").map(Number); return mKey(new Date(y, m - 1 + n, 1)); }
const sum = (arr) => arr.reduce((s, e) => s + Number(e.amount || 0), 0);

async function loadDashboard() {
    try {
        const { data, error } = await db.from("expenses").select("*");
        if (error) throw error;
        expenses = data || [];
        monthMap = {};
        expenses.forEach(e => { const k = String(e.expense_date).slice(0, 7); (monthMap[k] ||= []).push(e); });
        build();
    } catch (e) { console.error(e); showError(e.message || "Unable to load dashboard."); }
}

function pctText(diff, prev) {
    if (!prev) return diff ? "New spending" : "0%";
    const p = (diff / prev) * 100;
    return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

function build() {
    const cur = mKey(new Date()), prev = shiftKey(cur, -1);
    const curList = monthMap[cur] || [], prevList = monthMap[prev] || [];
    const curTotal = sum(curList), prevTotal = sum(prevList), diff = curTotal - prevTotal;
    const months = Object.keys(monthMap).filter(k => monthMap[k].length);
    const avg = months.length ? sum(expenses) / months.length : 0;

    $("currentMonthName").textContent = mName(cur); $("currentMonthTotal").textContent = money(curTotal);
    $("previousMonthName").textContent = mName(prev); $("previousMonthTotal").textContent = money(prevTotal);
    $("monthlyAverage").textContent = money(avg);

    const cls = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    $("monthDifference").textContent = (diff > 0 ? "+" : diff < 0 ? "-" : "") + money(Math.abs(diff));
    $("monthDifference").className = cls;
    $("differencePercentage").textContent = pctText(diff, prevTotal);
    $("differencePercentage").className = cls;
    $("diffIcon").className = `fa-solid ${diff > 0 ? "fa-arrow-trend-up" : diff < 0 ? "fa-arrow-trend-down" : "fa-minus"}`;

    $("compareCurrentName").textContent = mName(cur); $("compareCurrentAmount").textContent = money(curTotal);
    $("comparePreviousName").textContent = mName(prev); $("comparePreviousAmount").textContent = money(prevTotal);
    const res = $("comparisonResult");
    if (!curTotal && !prevTotal) { res.className = "compare-result"; res.textContent = "No expenses in these two months yet."; }
    else if (diff > 0) { res.className = "compare-result more"; res.innerHTML = `<i class="fa-solid fa-arrow-trend-up me-2"></i>You spent <b>${money(diff)}</b> more than ${mName(prev)} (${pctText(diff, prevTotal)}).`; }
    else if (diff < 0) { res.className = "compare-result less"; res.innerHTML = `<i class="fa-solid fa-arrow-trend-down me-2"></i>Great! You spent <b>${money(-diff)}</b> less than ${mName(prev)} (${pctText(diff, prevTotal)}).`; }
    else { res.className = "compare-result"; res.textContent = "Spending is exactly the same as last month."; }

    drawChart();
    drawCreators(curList, curTotal);
    drawCategories(curList, prevList);
    drawTable();
}

function drawChart() {
    const cur = mKey(new Date());
    const keys = Array.from({ length: span }, (_, i) => shiftKey(cur, i - (span - 1)));
    const totals = keys.map(k => sum(monthMap[k] || []));
    const max = Math.max(...totals, 1);
    $("monthlyChart").innerHTML = keys.map((k, i) => `
        <div class="bar-col">
            <div class="bar-val">${totals[i] ? "₹" + Math.round(totals[i]).toLocaleString("en-IN") : ""}</div>
            <div class="bar ${k === cur ? "current" : ""}" style="height:${Math.max(totals[i] / max * 190, totals[i] ? 6 : 3)}px;animation-delay:${i * 60}ms" title="${mName(k)}: ${money(totals[i])}"></div>
            <div class="bar-label">${mShort(k)}</div>
        </div>`).join("");
}

function drawCreators(list, total) {
    const by = {}; list.forEach(e => { const c = (e.creator || "Unknown").trim(); by[c] = (by[c] || 0) + Number(e.amount || 0); });
    const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
    $("creatorBreakdown").innerHTML = rows.length ? rows.map(([n, v]) => `
        <div class="cat-row"><div class="cat-top"><span><span class="avatar me-2" style="width:26px;height:26px;font-size:.72rem">${esc(initial(n))}</span>${esc(n)}</span><span>${money(v)}</span></div>
        <div class="cat-track"><div class="cat-fill" style="width:${total ? v / total * 100 : 0}%"></div></div></div>`).join("")
        : `<div class="empty-state py-3">No expenses this month.</div>`;
}

function drawCategories(curList, prevList) {
    const group = (l) => { const o = {}; l.forEach(e => { const c = e.category || "Other"; o[c] = (o[c] || 0) + Number(e.amount || 0); }); return o; };
    const c = group(curList), p = group(prevList);
    const rows = Object.entries(c).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...rows.map(r => r[1]), 1);
    $("categoryComparison").innerHTML = rows.length ? rows.map(([name, v]) => {
        const pv = p[name] || 0, d = v - pv, cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
        return `<div class="cat-row"><div class="cat-top"><span>${esc(name)}</span><span>${money(v)}</span></div>
            <div class="cat-track"><div class="cat-fill" style="width:${v / max * 100}%"></div></div>
            <div class="cat-sub">Previous ${money(pv)} • <span class="${cls}">${d > 0 ? "▲" : d < 0 ? "▼" : "•"} ${money(Math.abs(d))}</span></div></div>`;
    }).join("") : `<div class="empty-state py-3">No expenses this month.</div>`;
}

function drawTable() {
    const keys = Object.keys(monthMap).filter(k => monthMap[k].length).sort();
    const rows = keys.map((k, i) => {
        const t = sum(monthMap[k]), prev = i ? sum(monthMap[keys[i - 1]]) : null;
        return { k, n: monthMap[k].length, t, d: prev === null ? null : t - prev, prev };
    }).reverse();
    $("monthlyTableBody").innerHTML = rows.length ? rows.map(r => {
        const cls = r.d === null ? "flat" : r.d > 0 ? "up" : r.d < 0 ? "down" : "flat";
        return `<tr><td data-label="Month"><strong>${mName(r.k)}</strong></td>
            <td data-label="Total Entries">${r.n}</td>
            <td data-label="Total Expense" class="amount-cell">${money(r.t)}</td>
            <td data-label="Difference" class="${cls}">${r.d === null ? "-" : (r.d > 0 ? "+" : r.d < 0 ? "-" : "") + money(Math.abs(r.d))}</td>
            <td data-label="Change"><span class="tag ${r.d > 0 ? "orange" : r.d < 0 ? "green" : "gray"}">${r.d === null ? "First month" : pctText(r.d, r.prev)}</span></td></tr>`;
    }).join("") : `<tr><td colspan="5" class="text-center text-muted py-4">No data yet.</td></tr>`;
}
