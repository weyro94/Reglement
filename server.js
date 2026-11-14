// Overline Wiki — site + tableau de bord
// Fichiers locaux par défaut, MongoDB si MONGODB_URI est défini (Render). Voir HEBERGEMENT-RENDER.md
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const store = require("./storage");
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const ADMIN = path.join(ROOT, "admin");
const CONFIG_FILE = path.join(ROOT, "config.json");

// ---------- Config ----------
function loadConfig() {
  let c = {};
  try { c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch (e) {}
  return c;
}
let config = loadConfig();
const PORT = Number(process.env.SERVER_PORT || process.env.PORT || config.port || 3000);
const HOST = "0.0.0.0";

function hashPassword(pw, salt) {
  salt = salt || crypto.randomBytes(16).toString("hex");
  return "scrypt:" + salt + ":" + crypto.scryptSync(String(pw), salt, 32).toString("hex");
}
const ENV_PW = process.env.DASHBOARD_PASSWORD || process.env.ADMIN_PASSWORD || "";
let storedHash = null; // mot de passe changé depuis le dashboard
function verifyHash(pw, h) { const [, salt] = h.split(":"); return safeEq(hashPassword(pw, salt), h); }
function checkPassword(pw) {
  if (storedHash) return verifyHash(pw, storedHash);
  if (ENV_PW) return safeEq(pw, ENV_PW);
  if (config.passwordHash) return verifyHash(pw, config.passwordHash);
  if (config.password) return safeEq(pw, config.password);
  return false;
}
function safeEq(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function isDefaultPassword() {
  return !storedHash && !ENV_PW && !config.passwordHash && (!config.password || config.password === "change-moi");
}

// ---------- Sessions (cookie signé, survit aux redémarrages) ----------
let SECRET = process.env.SESSION_SECRET || null;
function pwStamp() { return crypto.createHash("sha256").update(storedHash || ENV_PW || config.passwordHash || config.password || "").digest("hex").slice(0, 12); }
function makeToken() {
  const exp = Date.now() + 7 * 24 * 3600 * 1000;
  const body = exp + "." + pwStamp();
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}
function validToken(t) {
  if (!t) return false;
  const parts = t.split(".");
  if (parts.length !== 3) return false;
  const body = parts[0] + "." + parts[1];
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  return safeEq(sig, parts[2]) && Number(parts[0]) > Date.now() && parts[1] === pwStamp();
}
function cookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach(c => { const i = c.indexOf("="); if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim()); });
  return out;
}
function authed(req) { return validToken(cookies(req).ow_session); }

// Anti brute-force : 8 essais / 15 min par IP
const attempts = new Map();
function ipOf(req) { return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress; }
function tooMany(ip) {
  const a = attempts.get(ip);
  if (!a) return false;
  if (Date.now() - a.t > 15 * 60 * 1000) { attempts.delete(ip); return false; }
  return a.n >= 8;
}
function fail(ip) { const a = attempts.get(ip) || { n: 0, t: Date.now() }; a.n++; attempts.set(ip, a); }

// ---------- Données ----------
function validateSite(s) {
  if (!s || typeof s !== "object" || !s.settings || !Array.isArray(s.pages) || !Array.isArray(s.nav)) return "Format invalide";
  const ids = new Set();
  for (const p of s.pages) {
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) return "Identifiant de page invalide : « " + (p.id || "") + " » (lettres minuscules, chiffres et tirets)";
    if (ids.has(p.id)) return "Deux pages ont le même identifiant : " + p.id;
    ids.add(p.id);
  }
  if (!s.pages.length) return "Il faut au moins une page";
  return null;
}

// ---------- Rendu du site ----------
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function fill(str, st) { return String(str || "").replace(/\{\{discord\}\}/g, st.discord || "#"); }

const CLIENT_JS = `(function(){
var arts=[].slice.call(document.querySelectorAll("article.page")),ids=arts.map(function(a){return a.id});
var HOME=document.body.dataset.home||ids[0],SUF=document.body.dataset.suffix||"";
function show(h){
  var cur;arts.forEach(function(a){var on=a.id===h;a.classList.toggle("on",on);if(on)cur=a});
  document.querySelectorAll("#side a[data-p]").forEach(function(a){a.classList.toggle("on",a.dataset.p===h)});
  document.getElementById("side").classList.remove("open");
  document.getElementById("cr").textContent=cur.dataset.title;
  document.getElementById("ht").textContent=cur.dataset.title;
  document.getElementById("hs").textContent=cur.dataset.sub;
  document.title=cur.dataset.title+SUF;
  var toc=document.getElementById("toc");toc.innerHTML="";
  cur.querySelectorAll("h2,h3").forEach(function(e){var a=document.createElement("a");a.className="t"+(e.tagName==="H3"?" s":"");a.textContent=e.textContent;a.onclick=function(){e.scrollIntoView({behavior:"smooth"})};toc.appendChild(a)});
  if(!toc.children.length)toc.innerHTML="<small>—</small>";
  var tg=document.getElementById("tags");tg.innerHTML="";
  (cur.dataset.tags||"").split(",").filter(Boolean).forEach(function(t){var s=document.createElement("span");s.className="chip";s.textContent=t.trim();tg.appendChild(s)});
  window.scrollTo(0,0);
}
function route(){var h=(location.hash||"").slice(1);show(ids.indexOf(h)<0?(ids.indexOf(HOME)<0?ids[0]:HOME):h)}
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest('a[href^="#"]');if(!a)return;var id=a.getAttribute("href").slice(1);if(ids.indexOf(id)<0)return;e.preventDefault();try{history.replaceState(null,"","#"+id)}catch(x){}show(id)});
window.addEventListener("hashchange",route);route();
document.getElementById("burger").onclick=function(){document.getElementById("side").classList.toggle("open")};
document.getElementById("pr").onclick=function(){window.print()};
document.getElementById("sh").onclick=function(){try{navigator.clipboard.writeText(location.href)}catch(e){}};
})();`;

function render(site) {
  const st = site.settings || {};
  const c = st.colors || {};
  const vars = Object.keys(c).map(k => `--${k}:${c[k]}`).join(";");
  const byId = Object.fromEntries(site.pages.map(p => [p.id, p]));
  const nav = (site.nav || []).map(n => {
    if (n.type === "sep") return "<hr>";
    if (n.type === "heading") return `<h5>${esc(n.text)}</h5>`;
    if (n.type === "link") return `<a href="${esc(fill(n.url, st))}" target="_blank" rel="noopener"><i class="ic">${esc(n.icon)}</i>${esc(n.label)}</a>`;
    if (n.type === "page") {
      const p = byId[n.id]; if (!p) return "";
      return `<a href="#${esc(p.id)}" data-p="${esc(p.id)}"><i class="ic">${esc(p.icon)}</i>${esc(n.label || p.title)}</a>`;
    }
    return "";
  }).join("\n");
  const pages = site.pages.map(p =>
    `<article class="page" id="${esc(p.id)}" data-title="${esc(p.title)}" data-sub="${esc(p.sub)}" data-tags="${esc(p.tags)}">\n${fill(p.html, st)}\n</article>`
  ).join("\n\n");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(st.siteName)}</title>
<meta name="description" content="${esc(st.description || "")}">
${st.favicon ? `<link rel="icon" href="${esc(st.favicon)}">` : ""}
<link rel="stylesheet" href="/style.css">
<style>:root{${vars}}${st.customCss || ""}</style>
</head>
<body data-home="${esc(st.homePage || "")}" data-suffix="${esc(st.titleSuffix || "")}">
<nav id="side"><div class="brand">${st.logo ? `<img src="${esc(st.logo)}" alt="">` : ""}<b>${esc(st.brand1)}<span>${esc(st.brand2)}</span></b></div>
<div class="nav">
${nav}
</div></nav>

<div id="wrap">
<div class="crumb"><button id="burger" aria-label="Menu">☰</button><span>🏠</span><span>/</span><b id="cr"></b></div>
<div class="head"><h1 id="ht"></h1><p id="hs"></p></div>
<div class="cols">
<div>

${pages}

</div>
<aside class="right">
<div class="rc"><h6>Table des matières</h6><div id="toc"></div></div>
<div class="rc"><h6>Étiquettes</h6><div id="tags"></div></div>
<div class="rc"><h6>Dernière édition par</h6><div class="who">${esc(st.editedBy)}</div><small>${esc(st.editedAt)}</small></div>
<div class="rc acts"><button id="sh" title="Copier le lien">🔗</button><button id="pr" title="Imprimer">🖨️</button></div>
</aside>
</div>
</div>
<script>${CLIENT_JS}</script>
</body>
</html>`;
}

// ---------- HTTP ----------
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const IMG_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"];

function send(res, code, body, type, extra) {
  res.writeHead(code, Object.assign({ "Content-Type": type || "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" }, extra || {}));
  res.end(body);
}
function json(res, code, obj, extra) { send(res, code, JSON.stringify(obj), MIME[".json"], Object.assign({ "Cache-Control": "no-store" }, extra || {})); }
function serveFile(res, dir, rel, cache) {
  const file = path.normalize(path.join(dir, rel));
  if (!file.startsWith(dir + path.sep)) return send(res, 404, "Introuvable");
  fs.stat(file, (err, s) => {
    if (err || !s.isFile()) return send(res, 404, "Introuvable");
    const ext = path.extname(file).toLowerCase();
    const h = { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": s.size, "Cache-Control": cache || "no-cache" };
    if (ext === ".svg") h["Content-Security-Policy"] = "script-src 'none'";
    res.writeHead(200, h);
    fs.createReadStream(file).pipe(res);
  });
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("Fichier trop lourd")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch (e) { reject(new Error("JSON invalide")); } });
    req.on("error", reject);
  });
}
function today() { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; }

async function api(req, res, url) {
  const route = url.pathname.slice(4);
  const m = req.method;
  if (route === "/login" && m === "POST") {
    const ip = ipOf(req);
    if (tooMany(ip)) return json(res, 429, { error: "Trop d'essais, réessaie dans 15 minutes." });
    const b = await readBody(req, 10000);
    if (!checkPassword(b.password || "")) { fail(ip); return json(res, 401, { error: "Mot de passe incorrect" }); }
    attempts.delete(ip);
    const secure = (req.headers["x-forwarded-proto"] === "https") ? "; Secure" : "";
    return json(res, 200, { ok: true }, { "Set-Cookie": `ow_session=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 3600}${secure}` });
  }
  if (route === "/logout") return json(res, 200, { ok: true }, { "Set-Cookie": "ow_session=; Path=/; Max-Age=0" });
  if (route === "/me") return json(res, 200, { authed: authed(req), defaultPassword: authed(req) ? isDefaultPassword() : undefined });

  if (!authed(req)) return json(res, 401, { error: "Non connecté" });
  // Protection CSRF : les requêtes qui modifient doivent venir du dashboard
  if (m !== "GET" && req.headers["x-requested-with"] !== "dashboard") return json(res, 403, { error: "Requête refusée" });

  if (route === "/site" && m === "GET") return json(res, 200, store.getSite());
  if (route === "/site" && m === "PUT") {
    const s = await readBody(req, 20 * 1024 * 1024);
    const err = validateSite(s); if (err) return json(res, 400, { error: err });
    if (s.settings.autoDate) s.settings.editedAt = today();
    await store.saveSite(s);
    return json(res, 200, { ok: true, editedAt: s.settings.editedAt });
  }
  if (route === "/preview" && m === "POST") {
    const s = await readBody(req, 20 * 1024 * 1024);
    const err = validateSite(s); if (err) return send(res, 400, err);
    return send(res, 200, render(s), MIME[".html"], { "Cache-Control": "no-store" });
  }
  if (route === "/uploads" && m === "GET") return json(res, 200, await store.listUploads());
  if (route === "/upload" && m === "POST") {
    const b = await readBody(req, 15 * 1024 * 1024);
    const mm = /^data:[^;]+;base64,(.+)$/.exec(b.data || "");
    if (!mm) return json(res, 400, { error: "Image invalide" });
    let ext = path.extname(b.name || "").toLowerCase();
    if (!IMG_EXT.includes(ext)) return json(res, 400, { error: "Formats acceptés : png, jpg, gif, webp, svg, ico" });
    let base = path.basename(b.name, ext).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "image";
    let name = base + ext, i = 2;
    while (await store.uploadExists(name)) name = `${base}-${i++}${ext}`;
    await store.putUpload(name, Buffer.from(mm[1], "base64"));
    return json(res, 200, { url: "/uploads/" + name, name });
  }
  if (route.startsWith("/uploads/") && m === "DELETE") {
    await store.deleteUpload(decodeURIComponent(route.slice(9)));
    return json(res, 200, { ok: true });
  }
  if (route === "/backups" && m === "GET") return json(res, 200, await store.listBackups());
  if (route.startsWith("/backups/") && m === "POST") {
    const s = await store.getBackup(decodeURIComponent(route.slice(9)));
    if (!s) return json(res, 404, { error: "Sauvegarde introuvable" });
    await store.saveSite(s);
    return json(res, 200, { ok: true });
  }
  if (route === "/password" && m === "POST") {
    const b = await readBody(req, 10000);
    if (!checkPassword(b.current || "")) return json(res, 400, { error: "Mot de passe actuel incorrect" });
    if (!b.next || String(b.next).length < 8) return json(res, 400, { error: "Le nouveau mot de passe doit faire au moins 8 caractères" });
    storedHash = hashPassword(b.next);
    await store.setMeta("passwordHash", storedHash);
    return json(res, 200, { ok: true }, { "Set-Cookie": `ow_session=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 3600}` });
  }
  return json(res, 404, { error: "Route inconnue" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith("/api/")) return await api(req, res, url);
    if (p === "/" || p === "/index.html") return send(res, 200, render(store.getSite()), MIME[".html"], { "Cache-Control": "no-cache" });
    if (p === "/style.css") return serveFile(res, PUBLIC, "style.css");
    if (p === "/health") return send(res, 200, "ok");
    if (p.startsWith("/uploads/")) {
      const f = await store.getUpload(p.slice(9));
      if (!f) return send(res, 404, "Introuvable");
      const h = { "Content-Type": f.mime, "Content-Length": f.buf.length, "Cache-Control": "public, max-age=3600" };
      if (f.mime === "image/svg+xml") h["Content-Security-Policy"] = "script-src 'none'";
      res.writeHead(200, h); return res.end(req.method === "HEAD" ? undefined : f.buf);
    }
    if (p === "/admin" || p === "/admin/") return serveFile(res, ADMIN, "index.html");
    if (p.startsWith("/admin/")) return serveFile(res, ADMIN, p.slice(7));
    if (p === "/favicon.ico") { const st = store.getSite().settings; if (st.favicon) { res.writeHead(302, { Location: st.favicon }); return res.end(); } }
    send(res, 404, "Page introuvable");
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, e.message === "Fichier trop lourd" ? 413 : 500, { error: e.message || "Erreur serveur" });
  }
});
async function main() {
  await store.init();
  if (process.env.RESET_PASSWORD) { await store.setMeta("passwordHash", null); console.log("🔑 Mot de passe du dashboard remis à DASHBOARD_PASSWORD. Retire la variable RESET_PASSWORD."); }
  storedHash = (await store.getMeta("passwordHash")) || null;
  if (!SECRET) { SECRET = await store.getMeta("secret"); if (!SECRET) { SECRET = crypto.randomBytes(32).toString("hex"); await store.setMeta("secret", SECRET); } }
  server.listen(PORT, HOST, () => {
    console.log(`✅ Site en ligne sur le port ${PORT} (stockage : ${store.mode()})`);
    console.log(`   Site      : http://localhost:${PORT}/`);
    console.log(`   Dashboard : http://localhost:${PORT}/admin`);
    if (isDefaultPassword()) console.log("⚠️  Mot de passe par défaut ! Modifie \"password\" dans config.json (ou DASHBOARD_PASSWORD sur Render).");
  });
}
main().catch(e => { console.error("❌ Démarrage impossible :", e.message); process.exit(1); });
