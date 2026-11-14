# Wiki Overline + tableau de bord

- **Le site** : `http://ton-adresse:PORT/`
- **Le dashboard** : `http://ton-adresse:PORT/admin`

Fonctionne comme tes bots Discord : Node.js, tableau de bord protégé par mot de passe, hébergé gratuitement sur Render.

---

## 1. Mettre le site en ligne 24h/24

👉 Suis **`HEBERGEMENT-RENDER.md`** : c'est la même méthode que pour tes bots Discord (GitHub + Render + MongoDB Atlas + UptimeRobot), gratuite.

Le mot de passe du tableau de bord se règle alors dans Render (`DASHBOARD_PASSWORD`). Ne mets **pas** ton vrai mot de passe dans `config.json` : ce fichier part sur GitHub.

## 2. Tester sur ton PC (optionnel)

Installe Node.js (version LTS), puis dans le dossier :

```
npm install
npm start
```

Ouvre http://localhost:3000/admin. Mot de passe : celui de `config.json` (`change-moi` par défaut).
Sur ton PC, tout est enregistré dans `data/` et `uploads/`, sans MongoDB.

## 3. Utiliser le dashboard

| Onglet | Ce que tu peux faire |
|---|---|
| 📄 **Pages** | Modifier le texte directement, comme dans Word : titres, gras, texte rouge, listes ✅ ❌ ⛔, liens, encadrés, alertes, cartes, boutons, images. Créer, dupliquer ou supprimer des pages. |
| 🧭 **Menu** | Réordonner le menu de gauche, renommer, ajouter des liens, des titres de section, des séparateurs. |
| ⚙️ **Réglages** | Nom, logo, favicon, lien Discord, page d'accueil, couleurs du site. |
| 🖼️ **Images** | Envoyer et gérer les images. |
| 🕘 **Sauvegardes** | Revenir à une version précédente (copie automatique à chaque enregistrement). |
| 🔒 **Sécurité** | Changer le mot de passe, se déconnecter. |

Astuces :
- **Ctrl + S** pour enregistrer. Le site public est mis à jour aussitôt.
- **👁️ Aperçu** montre le résultat (ordinateur ou téléphone) avant d'enregistrer.
- Les boutons **▲ ▼ ⧉ 🗑** agissent sur l'élément où se trouve ton curseur (une puce, une carte, un encadré…).
- Le bouton **</>** affiche le code HTML de la page, pour les modifications avancées.
- Le lien Discord est géré à un seul endroit (Réglages). Dans les textes, `{{discord}}` est remplacé automatiquement par ce lien.

---

## 4. Où sont mes données ?

- **Sur Render** : dans MongoDB Atlas (base `overline-wiki`) : pages, images, sauvegardes.
- **Sur ton PC** : `data/site.json` (contenu), `uploads/` (images), `data/backups/` (sauvegardes).

Dans les deux cas, **🕘 Sauvegardes → Télécharger tout le contenu** te donne une copie complète des textes.
