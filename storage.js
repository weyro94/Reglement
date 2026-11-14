// Stockage : fichiers locaux par défaut, MongoDB si MONGODB_URI est défini (obligatoire sur Render,
// dont le disque est effacé à chaque redémarrage). Même principe que tes bots Discord.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const SITE_FILE = path.join(DATA, "site.json");
const BACKUPS = path.join(DATA, "backups");
const UPLOADS = path.join(ROOT, "uploads");
const META_FILE = path.join(DATA, "meta.json");
const MAX_BACKUPS = 40;

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };
const IMG_EXT = Object.keys(MIME);

let mongo = null;          // { client, db, kv, backups, uploads }
let site = null;           // contenu en mémoire
const imgCache = new Map(); // images en mémoire (mode MongoDB)

function stamp() { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
function readJson(f, dflt) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return dflt; } }

async function init() {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { MongoClient } = require("mongodb");
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "overline-wiki");
    mongo = { client, db, kv: db.collection("kv"), backups: db.collection("backups"), uploads: db.collection("uploads") };
    await mongo.backups.createIndex({ name: -1 });
    const doc = await mongo.kv.findOne({ _id: "site" });
    if (doc) {
      site = doc.value;
      console.log("💾 Contenu chargé depuis MongoDB");
    } else {
      // Premier démarrage : on importe le contenu et les images fournis avec le code
      site = readJson(SITE_FILE, null);
      if (!site) throw new Error("data/site.json introuvable pour l'import initial");
      await mongo.kv.updateOne({ _id: "site" }, { $set: { value: site } }, { upsert: true });
      let n = 0;
      if (fs.existsSync(UPLOADS)) for (const f of fs.readdirSync(UPLOADS)) {
        if (!IMG_EXT.includes(path.extname(f).toLowerCase())) continue;
        if (await mongo.uploads.findOne({ _id: f }, { projection: { _id: 1 } })) continue;
        await putUpload(f, fs.readFileSync(path.join(UPLOADS, f)));
        n++;
      }
      console.log(`💾 Premier démarrage : contenu et ${n} image(s) importés dans MongoDB`);
    }
  } else {
    for (const d of [DATA, BACKUPS, UPLOADS]) fs.mkdirSync(d, { recursive: true });
    site = readJson(SITE_FILE, null);
    if (!site) throw new Error("data/site.json introuvable ou illisible");
    console.log("💾 Contenu chargé depuis data/site.json (stockage local)");
  }
}
const mode = () => (mongo ? "mongodb" : "fichiers");

// ---------- Contenu ----------
function getSite() { return site; }
async function saveSite(next) {
  const prev = site;
  const name = "site-" + stamp() + ".json";
  if (mongo) {
    if (prev) await mongo.backups.insertOne({ name, value: prev, size: Buffer.byteLength(JSON.stringify(prev)) });
    await mongo.kv.updateOne({ _id: "site" }, { $set: { value: next } }, { upsert: true });
    const old = await mongo.backups.find({}, { projection: { _id: 1 } }).sort({ name: -1 }).skip(MAX_BACKUPS).toArray();
    if (old.length) await mongo.backups.deleteMany({ _id: { $in: old.map(o => o._id) } });
  } else {
    if (fs.existsSync(SITE_FILE)) fs.copyFileSync(SITE_FILE, path.join(BACKUPS, name));
    const tmp = SITE_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(next, null, 1));
    fs.renameSync(tmp, SITE_FILE);
    const list = fs.readdirSync(BACKUPS).filter(f => f.endsWith(".json")).sort();
    while (list.length > MAX_BACKUPS) fs.unlinkSync(path.join(BACKUPS, list.shift()));
  }
  site = next;
}

// ---------- Sauvegardes ----------
async function listBackups() {
  if (mongo) return (await mongo.backups.find({}, { projection: { name: 1, size: 1 } }).sort({ name: -1 }).toArray()).map(b => ({ name: b.name, size: b.size || 0 }));
  return fs.readdirSync(BACKUPS).filter(f => f.endsWith(".json")).sort().reverse().map(f => ({ name: f, size: fs.statSync(path.join(BACKUPS, f)).size }));
}
async function getBackup(name) {
  name = path.basename(name);
  if (mongo) { const b = await mongo.backups.findOne({ name }); return b ? b.value : null; }
  const f = path.join(BACKUPS, name);
  return fs.existsSync(f) ? readJson(f, null) : null;
}

// ---------- Images ----------
async function listUploads() {
  if (mongo) return (await mongo.uploads.find({}, { projection: { data: 0 } }).sort({ mtime: -1 }).toArray()).map(u => ({ name: u._id, url: "/uploads/" + u._id, size: u.size, mtime: u.mtime }));
  return fs.readdirSync(UPLOADS).filter(f => IMG_EXT.includes(path.extname(f).toLowerCase())).map(f => { const s = fs.statSync(path.join(UPLOADS, f)); return { name: f, url: "/uploads/" + f, size: s.size, mtime: s.mtimeMs }; }).sort((a, b) => b.mtime - a.mtime);
}
async function uploadExists(name) {
  if (mongo) return !!(await mongo.uploads.findOne({ _id: name }, { projection: { _id: 1 } }));
  return fs.existsSync(path.join(UPLOADS, name));
}
async function putUpload(name, buf) {
  if (mongo) {
    await mongo.uploads.updateOne({ _id: name }, { $set: { data: buf, size: buf.length, mtime: Date.now() } }, { upsert: true });
    imgCache.delete(name);
  } else fs.writeFileSync(path.join(UPLOADS, name), buf);
}
async function getUpload(name) {
  name = path.basename(name);
  const ext = path.extname(name).toLowerCase();
  if (!MIME[ext]) return null;
  if (mongo) {
    if (imgCache.has(name)) return imgCache.get(name);
    const u = await mongo.uploads.findOne({ _id: name });
    if (!u) return null;
    const out = { buf: Buffer.from(u.data.buffer || u.data), mime: MIME[ext] };
    imgCache.set(name, out);
    return out;
  }
  const f = path.join(UPLOADS, name);
  if (!fs.existsSync(f)) return null;
  return { buf: fs.readFileSync(f), mime: MIME[ext] };
}
async function deleteUpload(name) {
  name = path.basename(name);
  if (mongo) { await mongo.uploads.deleteOne({ _id: name }); imgCache.delete(name); }
  else { const f = path.join(UPLOADS, name); if (fs.existsSync(f)) fs.unlinkSync(f); }
}

// ---------- Petites valeurs (clé de session, mot de passe changé depuis le dashboard) ----------
async function getMeta(key) {
  if (mongo) { const d = await mongo.kv.findOne({ _id: "meta:" + key }); return d ? d.value : undefined; }
  return readJson(META_FILE, {})[key];
}
async function setMeta(key, value) {
  if (mongo) return mongo.kv.updateOne({ _id: "meta:" + key }, { $set: { value } }, { upsert: true });
  const m = readJson(META_FILE, {}); m[key] = value;
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(META_FILE, JSON.stringify(m, null, 2));
}

module.exports = { init, mode, getSite, saveSite, listBackups, getBackup, listUploads, uploadExists, putUpload, getUpload, deleteUpload, getMeta, setMeta, IMG_EXT, MIME };
