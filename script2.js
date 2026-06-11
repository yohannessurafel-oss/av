const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);


document.addEventListener("DOMContentLoaded", function() {

    // 1. Core Left Sidebar Module Routing Panel Engine
    const menuLinks = document.querySelectorAll("#globalModuleRouter li");
    const moduleViews = document.querySelectorAll(".module-view");

    if (menuLinks.length > 0 && moduleViews.length > 0) {
        menuLinks.forEach(link => {
            link.addEventListener("click", function() {
                menuLinks.forEach(item => item.classList.remove("active"));
                moduleViews.forEach(view => view.classList.remove("active"));

                this.classList.add("active");
                const targetModule = this.getAttribute("data-module");
                const targetView = document.getElementById(`view-${targetModule}`);
                
                if (targetView) {
                    targetView.classList.add("active");
                    console.log(`Core Router Switch Dispatched -> Channel Linked To View ID [view-${targetModule}]`);
                }
            });
        });
    }

    // 2. Sub-Tab Panel Selection Mechanics Router (Inside Pay-off Console)
    const secondaryTabs = document.querySelectorAll(".sub-tab");
    const secondaryViews = document.querySelectorAll(".sub-tab-view");

    if (secondaryTabs.length > 0) {
        secondaryTabs.forEach(tab => {
            tab.addEventListener("click", function() {
                secondaryTabs.forEach(t => t.classList.remove("active"));
                secondaryViews.forEach(v => v.classList.remove("active"));

                this.classList.add("active");
                const viewTargetId = this.getAttribute("data-target");
                const targetSubview = document.getElementById(`subview-${viewTargetId}`);
                if (targetSubview) {
                    targetSubview.classList.add("active");
                } else {
                    console.warn(`Sub-tab Target view not found: subview-${viewTargetId}`);
                }
            });
        });
    }

    // 3. Dynamic Payoff Real-Time Matrix Calculations Mock Trigger
    const accountInputTarget = document.getElementById("payoffAccNoTarget");
    if (accountInputTarget) {
        accountInputTarget.addEventListener("change", function() {
            const gridBody = document.querySelector("#dynamicPayoffGrid tbody");
            if (!this.value.trim() || !gridBody) return;

            gridBody.innerHTML = "";
            const components = [
                { name: "Principal Ledger Outstanding Balance", cost: "70,000.00" },
                { name: "Accumulated Normal Interest Accruals Due", cost: "16,800.00" },
                { name: "Liquidation Processing Tariff Surcharge", cost: "0.00" }
            ];

            components.forEach(row => {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td><strong>${row.name}</strong></td><td class="text-right font-bold" style='color:#004b93;'>${row.cost}</td>`;
                gridBody.appendChild(tr);
            });
            console.log("Calculations Sync: Payoff metrics written to ledger view context structural array.");
        });
    }

    // 4. Global Action Command Toolbar Dispatches
    const btnGlobalView = document.getElementById("btnGlobalView");
    if (btnGlobalView) {
        btnGlobalView.addEventListener("click", function() {
            const activeView = document.querySelector(".module-view.active");
            const contextName = activeView ? activeView.querySelector(".context-badge-bar").textContent : "Current Form";
            alert(`Mode Context: Pulling records data simulation directory registry overview parameters for:\n"${contextName}"`);
        });
    }

    const btnGlobalAdd = document.getElementById("btnGlobalAdd");
    if (btnGlobalAdd) {
        btnGlobalAdd.addEventListener("click", function() {
            const activeForm = document.querySelector(".module-view.active form");
            if (activeForm) {
                activeForm.reset();
                console.log("Global State Action Matrix Triggered -> Instantiated entry variables collection parameters initialization framework.");
                alert("Mode Context: Input text elements initialized to blank templates. Ready to catch new asset registry data entry records flow variables.");
            }
        });
    }

    const btnGlobalEdit = document.getElementById("btnGlobalEdit");
    if (btnGlobalEdit) {
        btnGlobalEdit.addEventListener("click", function() {
            alert("Mode Context: Modifiable state unlocked. Active module entry matrix parameters inside form layers have been set editable.");
        });
    }

    const btnGlobalDelete = document.getElementById("btnGlobalDelete");
    if (btnGlobalDelete) {
        btnGlobalDelete.addEventListener("click", function() {
            if (confirm("Critical Notification: Wipe structural configuration log records matching the active interface workspace from tracking records?")) {
                const activeForm = document.querySelector(".module-view.active form");
                if (activeForm) activeForm.reset();
                alert("Active structural records dropped successfully from short-term runtime framework panels cache.");
            }
        });
    }

    const btnGlobalSave = document.getElementById("btnGlobalSave");
    if (btnGlobalSave) {
        btnGlobalSave.addEventListener("click", function() {
            alert("Transaction Dispatch Written: Buffered configuration parameters successfully written back to system database schemas.");
        });
    }

    const btnGlobalCancel = document.getElementById("btnGlobalCancel");
    if (btnGlobalCancel) {
        btnGlobalCancel.addEventListener("click", function() {
            const activeForm = document.querySelector(".module-view.active form");
            if (activeForm && confirm("Discard active ledger entry input field modifications?")) {
                activeForm.reset();
            }
        });
    }

    const btnGlobalPrint = document.getElementById("btnGlobalPrint");
    if (btnGlobalPrint) {
        btnGlobalPrint.addEventListener("click", function() {
            window.print();
        });
    }

    // 5. Context-Wide Directory Lookup Warnings Matcher Loop
    document.querySelectorAll(".search-btn").forEach(button => {
        button.addEventListener("click", function() {
            console.log("Global Event Listener Triggered: Opening lookup directory modal index matching parent constraint conditions.");
            alert("System Status Action: Initializing structural master ledger enterprise lookup database catalog constraints context frame.");
        });
    });
});
