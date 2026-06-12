// 1. Core Supabase Project Configuration Initializer
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", function() {

    console.log("Core System Online: Africa Village Microfinance Engine successfully initialized.");

    // =========================================================
    // 2. SIDEBAR NAVIGATION ROUTER
    // =========================================================
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
                    console.log(`Navigation: Switched context to [view-${targetModule}]`);
                }
            });
        });
    }

    // =========================================================
    // 3. SUB-TAB BAR CONTROLLERS (Inside Pay-off sub-console)
    // =========================================================
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
                }
            });
        });
    }

    // =========================================================
    // 4. SUPABASE DATABASE LOGIC (ADD, SAVE, VIEW CONTROLS)
    // =========================================================

    // A. THE ADD BUTTON
    const btnGlobalAdd = document.getElementById("btnGlobalAdd");
    if (btnGlobalAdd) {
        btnGlobalAdd.addEventListener("click", function() {
            const activeForm = document.querySelector(".module-view.active form");
            if (activeForm) {
                activeForm.reset();
                alert("Interface Cleared: Ready to record fresh system entry values.");
            } else {
                alert("System Status: Ready for input entry.");
            }
        });
    }

    // B. THE SAVE BUTTON (Reads form data and pushes to Supabase)
    const btnGlobalSave = document.getElementById("btnGlobalSave");
    if (btnGlobalSave) {
        btnGlobalSave.addEventListener("click", async function() {
            const activeView = document.querySelector(".module-view.active");
            if (!activeView) return;

            const activeFormId = activeView.id; 
            console.log(`Database Dispatch: Gathering inputs from active container: ${activeFormId}`);

            // 1. SAFELY READ BRANCH VALUES BY THEIR IDS
            const branchIdInput = document.getElementById("loanBranchId");
            const branchNameInput = document.getElementById("loanBranchName");
            const generalInput = activeView.querySelector("input[type='text']:not(#loanBranchId):not(#loanBranchName)");

            // 2. BUILD PAYLOAD TO SEND TO SUPABASE
            const dataPayload = {
                module_source: activeFormId,
                branch_id: branchIdInput ? branchIdInput.value : "001",
                branch_name: branchNameInput ? branchNameInput.value : "Default Branch",
                captured_value: generalInput ? generalInput.value : "System Form Entry",
                created_at: new Date().toISOString()
            };

            alert("Dispatched Transfer: Synchronizing data payload to your Supabase backend...");

            try {
                const { data, error } = await db
                    .from('LoanMasterRecords') 
                    .insert([dataPayload]);

                if (error) throw error;

                alert("Transaction Completed Successfully! Branch data written into live server index layers.");
                console.log("Supabase Confirmation Stream:", data);

            } catch (err) {
                console.error("Critical Cloud Transaction Abort:", err.message);
                alert("Data Save Blocked! Reason: " + err.message);
            }
        });
    }

    // C. THE VIEW BUTTON (Fetches records from Supabase and lists them on screen)
    const btnGlobalView = document.getElementById("btnGlobalView");
    if (btnGlobalView) {
        btnGlobalView.addEventListener("click", async function() {
            alert("Querying Stream: Pulling latest data rows from Supabase cloud database...");

            try {
                const { data: loanRecords, error } = await db
                    .from('LoanMasterRecords')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(5);

                if (error) throw error;

                if (!loanRecords || loanRecords.length === 0) {
                    alert("Database Connected! However, no transaction records were found inside this table.");
                } else {
                    let logMessage = `Successfully pulled ${loanRecords.length} recent database entry lines:\n\n`;
                    loanRecords.forEach((row, i) => {
                        logMessage += `Row #${i+1}:\n`;
                        logMessage += `• Module Source: ${row.module_source || 'N/A'}\n`;
                        logMessage += `• Branch ID: ${row.branch_id || 'N/A'}\n`;
                        logMessage += `• Branch Name: ${row.branch_name || 'N/A'}\n`;
                        logMessage += `• Value Captured: ${row.captured_value || 'N/A'}\n`;
                        logMessage += `------------------------------------\n`;
                    });
                    alert(logMessage);
                    console.log("Database Directory Master Payload Object:", loanRecords);
                }

            } catch (err) {
                console.error("Critical Read Operations Aborted:", err.message);
                alert("Failed to extract system directories data! Reason: " + err.message);
            }
        });
    }

    // D. STANDARD ACTION BUTTON HANDLERS
    const btnGlobalCancel = document.getElementById("btnGlobalCancel");
    if (btnGlobalCancel) {
        btnGlobalCancel.addEventListener("click", function() {
            const activeForm = document.querySelector(".module-view.active form");
            if (activeForm && confirm("Discard current updates and refresh form space inputs?")) {
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
});
