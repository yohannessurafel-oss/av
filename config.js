// config.js
const supabaseUrl = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'; // Ensure this is your full Project API Key

// Initialize the client
if (typeof supabase !== 'undefined') {
    // We use window._supabase so it's globally accessible across your HTML files
    window._supabase = supabase.createClient(supabaseUrl, supabaseKey);
    console.log("Supabase Engine: Connected ✅");
} else {
    console.error("Supabase Engine: Not Loaded ❌ (Check your CDN link in HTML)");
}
