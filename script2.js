// 1. Core Supabase Project Configuration Initializer
const SUPABASE_URL = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA';

// FIXED: Corrected variable reference mismatch crash point
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", function() {

    console.log("Core System Online: Africa Village Microfinance Engine successfully initialized.");

    // =========================================================
    // 2. SIDEBAR NAVIGATION ROUTER (Fixes freezing sidebar links)
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

    // A. THE ADD BUTTON (Clears active workspace for inputting new entry records)
    const btnGlobalAdd = document.getElementById("btnGlobalAdd");
    if (btnGlobalAdd) {
        btnGlobalAdd.addEventListener("click", function() {
            const activeForm = document.querySelector(".module-view.active form");
            if (activeForm) {
                activeForm.reset();
                console.log("Action Status: Active form fields cleared for new record submission.");
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
            // Identify which panel form view context we are actively operating within
            const activeView = document.querySelector(".module-view.active");
            if (!activeView) return;

            const activeFormId = activeView.id; 
            console.log(`Database Dispatch: Gathering inputs from active container: ${activeFormId}`);

            // Sample extraction framework matching your application profile schema parameters
            // (Make sure your input components inside your target view form contain matching ID tags!)
            const sampleInputName = activeView.querySelector("input[type='text']");
            const dataPayload = {
                module_source: activeFormId,
                captured_value: sampleInputName ? sampleInputName.value : "System Mock Log Entry",
                created_at: new Date().toISOString()
            };

            alert("Dispatched Transfer: Synchronizing data payload to your Supabase backend...");

            try {
                // Adjust 'LoanMasterRecords' string parameter to match your specific Supabase table designation!
                const { data, error } = await db
                    .from('LoanMasterRecords') 
                    .insert([dataPayload]);

                if (error) throw error;

                alert("Transaction Completed Successfully! Record written into live server index layers.");
                console.log("Supabase Confirmation Stream:", data);

            } catch (err) {
                console.error("Critical Cloud Transaction Abort:", err.message);
                alert("Data Save Blocked! Reason: " + err.message + "\n\n(Tip: Ensure you have disabled Row Level Security (RLS) policies on your Supabase table or allowed anon public inserts!)");
            }
        });
    }

    // C. THE VIEW BUTTON (Fetches records from Supabase and lists them on screen)
    const btnGlobalView = document.getElementById("btnGlobalView");
    if (btnGlobalView) {
        btnGlobalView.addEventListener("click", async function() {
            alert("Querying Stream: Pulling latest data rows from Supabase cloud database...");

            try {
                // Adjust table identifier 'LoanMasterRecords' to match your actual Supabase cloud naming matrix
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
                        logMessage += `Row #${i+1}: Source: ${row.module_source || 'N/A'} | Captured: ${row.captured_value || 'N/A'}\n`;
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
