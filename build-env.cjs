const fs = require('fs');

// Vercel injects the environment variables you set in the dashboard into process.env
const envFileContent = `window.ENV = {
  BCH_SUPABASE_URL: "${process.env.BCH_SUPABASE_URL || ''}",
  BCH_SUPABASE_ANON_KEY: "${process.env.BCH_SUPABASE_ANON_KEY || ''}"
};`;

// This dynamically generates the env.js file during the Vercel Build Phase
fs.writeFileSync('./env.js', envFileContent);
console.log("Successfully generated env.js with Vercel Environment Variables!");
