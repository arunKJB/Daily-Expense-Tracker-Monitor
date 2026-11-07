/* ============================================================
   INDEX.JS  -  Add Expense page
============================================================ */
document.addEventListener("DOMContentLoaded", async () => {

    fillSelect($("category"), CATEGORIES, "Select category");
    $("expenseDate").value = todayStr();
    $("expenseTime").value = nowTimeStr();

    await Promise.all([
        setupCreatorDropdown({
            selectId: "creator", addBtnId: "addCreatorBtn", modalId: "addCreatorModal",
            inputId: "newCreatorName", saveBtnId: "saveCreatorBtn"
        }),
        loadTypes(),
        loadSerial()
    ]);
    setupTypeModal();
    $("expenseForm").addEventListener("submit", (e) => { e.preventDefault(); saveExpense(); });
});

async function loadSerial() {
    try {
        const { count, error } = await db.from("expenses").select("id", { count: "exact", head: true });
        if (error) throw error;
        $("serialNo").textContent = (count || 0) + 1;
    } catch { $("serialNo").textContent = "1"; }
}

async function loadTypes(selected) {
    try {
        const types = await fetchExpenseTypes();
        fillSelect($("expenseType"), types, "Select expense type", selected);
    } catch (e) {
        $("expenseType").innerHTML = `<option value="">Unable to load types</option>`;
    }
}

function setupTypeModal() {
    const modal = bootstrap.Modal.getOrCreateInstance($("addExpenseTypeModal"));
    $("addExpenseTypeBtn").addEventListener("click", () => {
        $("newExpenseType").value = ""; modal.show(); setTimeout(() => $("newExpenseType").focus(), 350);
    });
    async function save() {
        const name = $("newExpenseType").value.trim().replace(/\s+/g, " ");
        if (!name) return showError("Please enter an expense type.");
        const btn = $("saveExpenseTypeBtn");
        setBusy(btn, true, "Saving...");
        try {
            const existing = await fetchExpenseTypes();
            if (existing.some(t => t.toLowerCase() === name.toLowerCase()))
                throw new Error("This expense type already exists.");
            const { error } = await db.from("expense_types").insert([{ name }]);
            if (error) throw error;
            await loadTypes(name);
            $("expenseType").value = name;
            modal.hide();
            showSuccess("Expense type added.");
        } catch (e) { showError(e.message || "Unable to add expense type."); }
        finally { setBusy(btn, false); }
    }
    $("saveExpenseTypeBtn").addEventListener("click", save);
    $("newExpenseType").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
}

async function saveExpense() {
    const v = {
        creator: $("creator").value.trim(),
        expense_date: $("expenseDate").value,
        expense_time: $("expenseTime").value || null,
        expense_type: $("expenseType").value,
        category: $("category").value,
        comment: $("comment").value.trim(),
        amount: Number($("amount").value)
    };
    if (!v.creator) return showError("Please select the creator.");
    if (!v.expense_date) return showError("Please select the date.");
    if (!v.expense_type) return showError("Please select an expense type.");
    if (!v.category) return showError("Please select a category.");
    // if (!v.comment) return showError("Please enter the description.");
    if (!Number.isFinite(v.amount) || v.amount <= 0) return showError("Please enter a valid amount.");

    const btn = $("submitExpenseBtn");
    setBusy(btn, true, "Saving...");
    try {
        const { error } = await db.from("expenses").insert([v]);
        if (error) throw error;
        showSuccess(`Saved ${money(v.amount)} for ${v.creator}.`);
        $("comment").value = ""; $("amount").value = "";
        $("expenseTime").value = nowTimeStr();
        await loadSerial();
        $("comment").focus();
    } catch (e) { showError(e.message || "Unable to save expense."); }
    finally { setBusy(btn, false); }
}
