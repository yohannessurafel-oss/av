// config.js
const supabaseUrl = 'https://oxzthrubidohuwwhxsrk.supabase.co';
const supabaseKey = 'sb_publishable_ORZuRj6_fb0rMSYDsd1raw_GoMNuYPS';

onst _supabase = supabase.createClient(supabaseUrl, supabaseKey);
// We attach it to 'window' so it becomes a global variable
// that your other scripts can see.
if (typeof supabase !== 'undefined') {
    window._supabase = supabase.createClient(supabaseUrl, supabaseKey);
    console.log("Supabase Engine: Connected ✅");
} else {
    console.error("Supabase Engine: Not Loaded ❌ (Check your CDN link)");
}
