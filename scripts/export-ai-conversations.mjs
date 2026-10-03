// Copies the Claude Code transcripts of this project into ai-conversations/
// (the course requires versioning every AI conversation), redacting secrets.
//
//   node scripts/export-ai-conversations.mjs
//
// Redacts: every value in .env.local, embedded images, JWTs, GitHub tokens, Postgres URLs with
// credentials and client_secret-like fields. Review the output before committing.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "ai-conversations");
const projectsDir = path.join(os.homedir(), ".claude", "projects");

const secrets = new Set();
const excluded = new Set();
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "");
    if (m[1] === "AI_EXPORT_EXCLUDE") {
      for (const id of value.split(",")) excluded.add(id.trim());
      continue;
    }
    // The student number doubles as the course AS password: always redact it.
    if (m[1] === "LLM_STUDENT_ID" && value) {
      secrets.add(value);
      continue;
    }
    // Passwords embedded in connection URLs also show up on their own.
    const pw = value.match(/^[a-z]+:\/\/[^:/@]+:([^@]+)@/i)?.[1];
    if (pw && pw.length >= 6) secrets.add(pw);
    // Skip short or public values (URLs of course services, realm names…).
    if (value.length >= 12 && !/^https?:\/\//.test(value)) secrets.add(value);
  }
}

const patterns = [
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT
  /gh[opsu]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /rnd_[A-Za-z0-9]{16,}/g, // Render API keys
  /sb_(?:publishable|secret)_[A-Za-z0-9_-]{16,}/g, // Supabase keys
  /postgres(?:ql)?:\/\/[^:\s"'@]+:[^@\s"']+@/g, // DB URL credentials
  /("?client_secret"?\s*[:=]\s*"?)[A-Za-z0-9_\-.]{12,}/gi,
  /(PRE_CLIENT_SECRET=)[^\s"\\]+/g,
  /(ENCRYPTION_KEY=)[^\s"\\]+/g,
  /(SESSION_SECRET=)[^\s"\\]+/g,
];

// Screenshots can show secrets that text redaction can't see: drop them.
const IMAGE_DATA = /"data":"[A-Za-z0-9+/=]{200,}"/g;

function redact(text) {
  let out = text.replace(IMAGE_DATA, '"data":"[IMAGE REMOVED]"');
  for (const s of secrets) out = out.split(s).join("[REDACTED]");
  for (const p of patterns) {
    out = out.replace(p, (match, prefix) =>
      typeof prefix === "string" ? `${prefix}[REDACTED]` : "[REDACTED]",
    );
  }
  return out;
}

const dirs = fs
  .readdirSync(projectsDir)
  .filter((d) => d.includes("integratrip"))
  .map((d) => path.join(projectsDir, d));

fs.mkdirSync(outDir, { recursive: true });
let count = 0;
for (const dir of dirs) {
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".jsonl") || excluded.has(file.replace(/\.jsonl$/, ""))) continue;
    const src = path.join(dir, file);
    fs.writeFileSync(path.join(outDir, file), redact(fs.readFileSync(src, "utf8")));
    count++;
  }
}
console.log(`Exported ${count} conversation(s) to ${path.relative(root, outDir)}/`);
