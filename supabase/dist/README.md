# Built files
One-file bundles of the Edge Functions for pasting into the Supabase dashboard editor.
Rebuild: deno bundle --platform=deno --external "npm:*" -o supabase/dist/api.js supabase/functions/api/index.ts
