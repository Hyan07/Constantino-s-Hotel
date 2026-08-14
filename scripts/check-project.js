import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const required = [
  ".env.example", ".gitignore", "package.json", "package-lock.json", "README.md",
  "public/index.html", "public/login.html", "public/js/app.js", "src/app.js", "src/server.js",
  "src/database/migrations/001_initial_schema.sql", "scripts/setup-local.js",
  "docs/LOCAL_DEVELOPMENT.md", "docs/HOSTINGER_DEPLOY.md", "docs/GIT_WORKFLOW.md",
  ".github/workflows/ci.yml",
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Verificação falhou. Arquivos ausentes: ${missing.join(", ")}`);
  process.exitCode = 1;
} else {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const scripts = ["dev", "start", "setup:local", "migrate", "migrate:status", "seed:dev", "lint", "test"];
  const absentScripts = scripts.filter((name) => !packageJson.scripts?.[name]);
  if (absentScripts.length) {
    console.error(`Verificação falhou. Scripts npm ausentes: ${absentScripts.join(", ")}`);
    process.exitCode = 1;
  } else if (fs.existsSync(path.join(root, ".env"))) {
    console.error("Verificação falhou: remova o arquivo .env antes de empacotar o projeto.");
    process.exitCode = 1;
  } else {
    console.log("Estrutura, scripts e arquivos obrigatórios verificados com sucesso.");
  }
}
