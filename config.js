// config.js
const supabaseUrl = 'https://oxzthrubidohuwwhxsrk.supabase.co';
// WARNING: Go to Supabase > Settings > API and copy the 'anon' 'public' key. 
// It should be a very long string starting with 'eyJ...'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im94enRocnViaWRvaHV3d2h4c3JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MzExMTIsImV4cCI6MjA5MTIwNzExMn0.6NrwYlDDVzYZNouknbdPGtvNb_0GLkT12T370fyPRyA'; 

if (typeof supabase !== 'undefined') {
    window._supabase = supabase.createClient(supabaseUrl, supabaseKey);
    console.log("Supabase Engine: Connected ✅");
} else {
    console.error("Supabase Engine: Not Loaded ❌");
}
