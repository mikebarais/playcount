import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://genxlpblyaxagijurziv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlbnhscGJseWF4YWdpanVyeml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4NTIzMTYsImV4cCI6MjEwNjQyODMxNn0.WkUaDweRQVsk7xSWFKOdp28TIRMQO5ZxLfhnrcQil80'; // Textul lung ce începe cu eyJ...

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
