# ☁️ Mettre le wiki en ligne 24h/24 sur Render (comme tes bots)

C'est exactement la même méthode que pour ton bot Overline et ton bot de tickets.
Tu as déjà les comptes : compte environ 15 minutes.

| Service | À quoi il sert |
|---|---|
| **GitHub** | Stocker le code du wiki (Render le récupère là) |
| **MongoDB Atlas** | Garder tes pages, tes images et tes sauvegardes (le disque de Render est effacé à chaque redémarrage) |
| **Render** | Faire tourner le site et le tableau de bord |
| **UptimeRobot** | Visiter le site toutes les 5 minutes pour l'empêcher de s'endormir |

> ⚠️ **Un 3ᵉ espace de travail Render.** L'offre gratuite donne 750 h par mois **par espace de travail**, et un service allumé en continu en consomme déjà ~744. Tes deux bots en utilisent déjà chacun un. **Crée un nouvel espace pour le wiki**, sinon le wiki et le bot qui est avec lui seront suspendus vers le milieu du mois.

---

## Étape 1 : mettre le code sur GitHub

1. Sur **github.com** : **+ → New repository**. Nom : `overline-wiki`, coche **Private**, puis **Create repository**.
2. Clique sur **uploading an existing file**.
3. Décompresse le zip, ouvre le dossier `overline-wiki`, sélectionne tout (Ctrl+A) et glisse-le dans la page, **y compris les dossiers** `admin`, `data`, `public` et `uploads`.
4. Clique sur **Commit changes**.

> `server.js`, `package.json` et `render.yaml` doivent être **à la racine** du dépôt, pas dans un sous-dossier.

## Étape 2 : MongoDB Atlas

**Rien à créer.** Réutilise la même adresse `mongodb+srv://...` que pour tes bots.
Le wiki range ses données dans sa propre base, `overline-wiki`, sans toucher à celles des bots.

(Si tu ne la retrouves plus : MongoDB Atlas → ton cluster → **Connect → Drivers**, copie l'adresse et remplace `<db_password>` par le mot de passe de l'utilisateur, sans garder les `<` `>`.)

## Étape 3 : Render

1. Sur **render.com**, clique sur le nom de ton espace de travail en haut à gauche → **+ New Workspace** (ou « Create workspace »). Nomme-le `Wiki`, offre **Hobby** (gratuite).
2. Dans ce nouvel espace : **+ New → Blueprint**, puis choisis le dépôt `overline-wiki`.
3. Remplis les 2 champs demandés :
   - `DASHBOARD_PASSWORD` : le mot de passe du tableau de bord (8 caractères minimum)
   - `MONGODB_URI` : l'adresse de l'étape 2
4. Clique sur **Apply**.
5. Dans l'onglet **Logs**, attends :
   ```
   💾 Premier démarrage : contenu et 2 image(s) importés dans MongoDB
   ✅ Site en ligne sur le port 10000 (stockage : mongodb)
   ```
6. L'adresse affichée en haut (`https://overline-wiki-xxxx.onrender.com`) est celle de ton wiki.
   Le tableau de bord est à cette adresse + `/admin`.

> Si les logs disent `stockage : fichiers`, c'est que `MONGODB_URI` est vide : tes modifications seraient perdues au prochain redémarrage. Corrige-la dans **Environment**.

## Étape 4 : UptimeRobot

Sur **uptimerobot.com** → **New monitor** :
- Type : **HTTP(s)**
- URL : ton adresse Render + `/health` (ex : `https://overline-wiki-xxxx.onrender.com/health`)
- Intervalle : **5 minutes**

Clique sur **Create Monitor**. ✅ C'est fini, le wiki est en ligne 24h/24.

---

## Mettre ton propre nom de domaine (optionnel)

Render → ton service → **Settings → Custom Domains → Add** (ex : `wiki.overline.fr`), puis ajoute chez ton fournisseur de domaine l'enregistrement **CNAME** que Render t'indique. Le HTTPS est automatique.

## Modifier le site

Tout se fait depuis **/admin** : pas besoin de retoucher GitHub. Les changements sont enregistrés dans MongoDB et restent après un redémarrage.

## Mettre à jour le code plus tard

GitHub → ton dépôt → **Add file → Upload files** → glisse les fichiers modifiés → **Commit changes**. Render redéploie seul en 2 ou 3 minutes, et ton contenu reste intact dans MongoDB.

> Le fichier `data/site.json` du dépôt ne sert qu'au **tout premier** démarrage. Ensuite, c'est MongoDB qui fait foi : modifier `site.json` sur GitHub ne changera plus le site.

## Problèmes fréquents

| Dans les Logs Render | Solution |
|---|---|
| `Démarrage impossible : ... auth` ou `... timed out` | Vérifie le mot de passe dans `MONGODB_URI` (sans `<` `>`) et l'accès `0.0.0.0/0` dans **Network Access** sur Atlas |
| `Cannot find module` | `package.json` et `server.js` doivent être à la racine du dépôt |
| `stockage : fichiers` | `MONGODB_URI` est vide → Render → **Environment** → remplis-la → **Save** |
| Le site met ~1 minute à s'ouvrir | Il s'était endormi : vérifie que le monitor UptimeRobot est « Up » et pointe bien sur `/health` |
| Mot de passe du dashboard oublié | Render → **Environment** → ajoute `RESET_PASSWORD` = `oui` → **Save**. Le mot de passe redevient `DASHBOARD_PASSWORD`. Connecte-toi, puis **supprime** `RESET_PASSWORD`. |
