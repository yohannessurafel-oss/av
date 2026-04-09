// config.js
const supabaseUrl = 'https://oxzthrubidohuwwhxsrk.supabase.co';
// WARNING: Go to Supabase > Settings > API and copy the 'anon' 'public' key. 
// It should be a very long string starting with 'eyJ...'
const supabaseKey = 'YOUR_ACTUAL_ANON_PUBLIC_KEY_HERE'; 

if (typeof supabase !== 'undefined') {
    window._supabase = supabase.createClient(supabaseUrl, supabaseKey);
    console.log("Supabase Engine: Connected ✅");
} else {
    console.error("Supabase Engine: Not Loaded ❌");
}
