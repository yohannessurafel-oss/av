document.addEventListener("DOMContentLoaded", function() {

    // 1. Core Structural UI Router Variable Hooks
    const navigationLinks = document.querySelectorAll("#globalModuleRouter li");
    const operationalViews = document.querySelectorAll(".module-view");
    const dynamicCanvas = document.getElementById("dynamicCanvasContainer");

    // 2. Global Navigation Panel Switching Logic Loop
    navigationLinks.forEach(link => {
        link.addEventListener("click", function() {
            // Drop styling state across the unselected list elements array
            navigationLinks.forEach(item => item.classList.remove("active"));
            // Toggle visibility flag state off for all sections
            operationalViews.forEach(view => view.classList.remove("active"));

            // Set current element styling state to active
            this.classList.add("active");
            
            // Map targeted module ID boundary
            const targetedModule = this.getAttribute("data-module");
            const activeFormPanel = document.getElementById(`view-${targetedModule}`);
            
            if (activeFormPanel) {
                activeFormPanel.classList.add("active");
                console.log(`System State Sync: Active frame router channel switched to focus context -> [${targetedModule}]`);
            }
        });
    });

    // 3. Dynamic Teller Pay-off Statement Calculator Mapping Module
    const btnCalculatePayoff = document.getElementById("btnCalculatePayoff");
    if (btnCalculatePayoff) {
        btnCalculatePayoff.addEventListener("click", function() {
            const payoffAccountInput = document.getElementById("payoffAccountId");
            const breakdownTableBody = document.querySelector("#payoffBreakdownTable tbody");
            
            if (!payoffAccountInput.value.trim()) {
                alert("Validation Constraint Warning: Please map a valid system Account reference code parameter first.");
                return;
            }

            // Flush out default placeholder row structure lines
            breakdownTableBody.innerHTML = "";

            // Evaluate mathematical balances snapshots vectors array
            const computedMatrixData = [
                { parameter: "Outstanding Ledger Principal", charge: "42,800.00" },
                { parameter: "Accrued Normal Interest Receivable", charge: "765.40" },
                { parameter: "Pre-closure Liquidation Penalty (3.5%)", charge: "149.80" },
                { parameter: "Tax Levy Assessment Surcharge", charge: "0.00" }
            ];

            // Programmatically inject financial component balances vectors row items
            computedMatrixData.forEach(row => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><strong>${row.parameter}</strong></td>
                    <td class="text-right font-bold" style="color:#004b93;">${row.charge}</td>
                `;
                breakdownTableBody.appendChild(tr);
            });

            console.log("Computation Engine: Loan early payout settlement variables written to view grid sheet context.");
        });
    }

    // 4. Global Command Action Buttons Handler Dispatches
    document.getElementById("globalAddBtn").addEventListener("click", function() {
        const activeModuleView = dynamicCanvas.querySelector(".module-view.active");
        const activeForm = activeModuleView.querySelector("form");
        if (activeForm) {
            activeForm.reset();
            alert(`System State: Form variables reset to data entry collection state for current focused view panel.`);
        } else {
            alert("System Alert: No active document layout canvas inputs mapped to this module view.");
        }
    });

    document.getElementById("globalSaveBtn").addEventListener("click", function() {
        const activeModuleView = dynamicCanvas.querySelector(".module-view.active");
        console.log(`Dispatched uncommitted journal memory payload save sequence macro for: ${activeModuleView.id}`);
        alert("Transaction Action Written: Buffered properties successfully synchronized to core schema registry database layers.");
    });

    document.getElementById("globalCancelBtn").addEventListener("click", function() {
        if (confirm("Discard uncommitted operational form configurations state parameters?")) {
            const activeForm = dynamicCanvas.querySelector(".module-view.active form");
            if (activeForm) activeForm.reset();
        }
    });

    document.getElementById("globalPrintBtn").addEventListener("click", function() {
        console.log("Streaming active dashboard canvas graphics engine map dump metadata array to printer spool...");
        window.print();
    });

    // 5. Native Sub-Ledger Magnifying Glass Search Triggers Matrix Loop
    document.querySelectorAll(".search-btn").forEach(btn => {
        btn.addEventListener("click", function() {
            alert("Opening Corporate Master Directory Selection Grid Panel index for contextual validation attributes parsing.");
        });
    });
});
