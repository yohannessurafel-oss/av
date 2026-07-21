/* ============================================================================
   modules-registry.js — single source of truth for the module list.
   Loaded by BOTH indexll.html (the dashboard) and system-file-directory.html
   (the live file-inventory view), so the two can never drift apart the way
   a duplicated array would.
   ============================================================================ */

const MODULES = [
{
num: '00', name: 'Client Master Registry',
icon: '👤', cat: 'client',
path: 'client-maintenance.html',
desc: 'Register and maintain client profiles, KYC, income data',
status: 'live'
},
{
num: '01', name: 'Individual Loan Application',
icon: '📋', cat: 'credit',
path: 'loan-application.html',
desc: 'Capture individual loan applications with live summary',
status: 'live'
},
{
num: '02', name: 'Center / Group Loan Projection',
icon: '👥', cat: 'credit',
path: 'group-loan-projection.html',
desc: 'Batch entry for group/center loan applications',
status: 'live'
},
{
num: '03', name: 'Loan Appraisal Management',
icon: '🔎', cat: 'credit',
path: 'loan-appraisal-management.html',
desc: 'Credit risk assessment, DSR, collateral appraisal',
status: 'live'
},
{
num: '04', name: 'Credit Sanction Console',
icon: '✅', cat: 'credit',
path: 'credit-sanction-console.html',
desc: 'Sanction decisions, approval workflow, loan terms',
status: 'live'
},
{
num: '05', name: 'Loan Account Maintenance',
icon: '🏦', cat: 'credit',
path: 'loan-account-maintenance.html',
desc: 'Manage active loan account parameters and schedules',
status: 'live'
},
{
num: '06', name: 'Collateral Inventory Risk',
icon: '🏠', cat: 'risk',
path: 'collateral-inventory-risk.html',
desc: 'Register and value collateral assets, risk scoring',
status: 'live'
},
{
num: '07', name: 'Guarantor Asset Registry',
icon: '🤝', cat: 'risk',
path: 'guarantor-asset-registry.html',
desc: 'Link guarantors to loans, net worth and liability',
status: 'live'
},
{
num: '08', name: 'Teller Cash Vault Control',
icon: '🗄️', cat: 'teller',
path: 'teller-cash-vault-control.html',
desc: 'Till open/close, cash denominations, vault control',
status: 'live'
},
{
num: '09', name: 'Settlement / Early Payoff',
icon: '💸', cat: 'financials',
path: 'settlement-early-payoff.html',
desc: 'Preclosure, early payoff calculation, payoff registry',
status: 'live'
},
{
num: '10', name: 'Loan Disbursement',
icon: '📤', cat: 'credit',
path: 'disbursement.html',
desc: 'Post disbursement, generate amortization schedule',
status: 'live'
},
{
num: '10b', name: 'Loan Repayment / Collection',
icon: '💵', cat: 'credit',
path: 'loan-repayment-collection.html',
desc: 'Record installment payments — allocates penalty→interest→principal, posts atomically to ledger, schedule, and GL',
status: 'live'
},
{
num: '11', name: 'Loan Ledger Report',
icon: '📊', cat: 'reports',
path: 'ledger-report.html',
desc: 'Account statement, internal ledger, amortization view',
status: 'live'
},
{
num: '12', name: 'General Ledger',
icon: '📒', cat: 'financials',
path: 'general-ledger.html',
desc: 'Chart of accounts, GL journal, loan ledger engine',
status: 'live'
},
{
num: '13', name: 'Account Maintenance',
icon: '💳', cat: 'client',
path: 'account-maintenance.html',
desc: 'Open and manage client financial accounts (Savings, Repayment, Current)',
status: 'live'
},
{
num: '14', name: 'Delinquency & PAR Dashboard',
icon: '⚠️', cat: 'reports',
path: 'delinquency-dashboard.html',
desc: 'Portfolio at risk, PAR buckets, collection status tracking',
status: 'live'
},
{
num: '15', name: 'Client Directory (Views)',
icon: '📁', cat: 'client',
path: 'client-directory.html',
desc: 'Search and browse registered clients',
status: 'live'
},
{
num: '16', name: 'System File Directory',
icon: '🗂️', cat: 'dev',
path: 'system-file-directory.html',
desc: 'Live inventory — counts and verifies every module\'s HTML/JS files actually exist on the server',
status: 'live'
},
{
num: 'DEV', name: 'Loan Status Guard — Test Harness',
icon: '🧪', cat: 'dev',
path: 'loan-status-guard-test.html',
desc: 'Diagnostic tool: test transition rules and run live guard checks against Supabase',
status: 'live'
},
];
