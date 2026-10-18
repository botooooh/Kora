# Guide Stratégique de Sécurité Maximale — Kora (par Mr Paul)

Ce guide détaille **l'ensemble des procédures, configurations et bonnes pratiques** pour sécuriser Kora, protéger votre site web contre les pannes et attaques, et garantir que vos utilisateurs reçoivent toujours une version authentique et exempte de tout malware.

---

## 1. Sécurité du Dépôt GitHub (La Clé du Projet)

Votre site Vercel et le téléchargement des fichiers dépendent directement de votre compte GitHub (`botooooh`). Si un attaquant vole votre mot de passe, il pourrait modifier le code source ou remplacer l'archive d'installation.

### Actions Obligatoires :
1. **Activer l'Authentification à Deux Facteurs (2FA / Double Authentification)** :
   - Rendez-vous sur : [https://github.com/settings/security](https://github.com/settings/security)
   - Activez **Two-factor authentication (2FA)** avec une application comme **Google Authenticator** ou **Microsoft Authenticator** sur votre téléphone.
   - Sauvegardez vos codes de récupération (Recovery Codes) dans un endroit sûr (ex: carnet physique ou coffre-fort de mots de passe).
   - *Résultat : Même si quelqu'un découvre votre mot de passe, il lui est impossible de se connecter sans le code dynamique sur votre smartphone.*

2. **Protéger la branche `main` contre les suppressions ou pushes forcés** :
   - Allez sur votre dépôt : `https://github.com/botooooh/Kora/settings/branches`
   - Cliquez sur **Add branch ruleset** (ou **Add branch protection rule**).
   - Dans *Branch name pattern*, tapez `main`.
   - Cochez :
     - **Restrict deletions** (empêche toute suppression accidentelle ou malveillante de la branche).
     - **Block force pushes** (empêche un pirate d'écraser l'historique du projet).

3. **Vérifier les Clés d'Accès (Personal Access Tokens & SSH)** :
   - Allez sur [https://github.com/settings/tokens](https://github.com/settings/tokens) et supprimez tout token ancien ou inconnu.

---

## 2. Sécurité de l'Hébergement Web (Vercel) & Résistance DDoS

Vercel héberge le site officiel `kora-nine.vercel.app`.

### Protections Natives & Activées :
1. **Protection Anti-DDoS Anycast (Cloudflare / Edge)** :
   - Vercel absorbe automatiquement les attaques par saturation de trafic (DDoS volumétriques). Si des hackers bombardent le site de millions de requêtes pour le faire planter, Vercel filtre automatiquement les requêtes malveillantes au niveau du réseau mondial. Le site reste en ligne pour vos vrais visiteurs.

2. **En-têtes de Sécurité HTTP Durcis (`vercel.json`)** :
   Les en-têtes suivants ont été injectés dans la configuration de production :
   * **`X-Content-Type-Options: nosniff`** : Empêche les navigateurs d'exécuter des fichiers sous un type MIME falsifié.
   * **`X-Frame-Options: DENY`** : Protège contre le Clickjacking (empêche d'intégrer votre site dans une iframe invisible pirate).
   * **`X-XSS-Protection: 1; mode=block`** : Stoppe les attaques par injection de scripts dans les navigateurs.
   * **`Strict-Transport-Security (HSTS)`** : Force le chiffrement TLS/HTTPS complet.
   * **`Permissions-Policy`** : Désactive l'accès à la caméra, au micro et à la géolocalisation pour le site web.

---

## 3. Signature & Intégrité Cryptographique (SHA-256)

L'empreinte cryptographique SHA-256 permet de garantir qu'aucun pirate n'a pu altérer ou remplacer le fichier téléchargé entre le moment où vous l'avez créé et le moment où l'utilisateur le reçoit.

### Empreinte Officielle de la Version Actuelle :
* **Fichier** : `Kora-Windows.zip` (v2.0.0)
* **Algorithme** : SHA-256 (256 bits)
* **Empreinte Officielle (Hash)** :
  ```text
  6f897cd499ba030969f4cdcbee3e4c28a1e8d58fccd4da72adccc1aa5d4ebef1
  ```

### Comment l'utilisateur peut vérifier l'intégrité sous Windows :
Ouvrir PowerShell et exécuter :
```powershell
Get-FileHash "$HOME\Downloads\Kora-Windows.zip" -Algorithm SHA256
```
Si le hash retourné correspond exactement au hash ci-dessus, le fichier est **100 % authentique, certifié par Mr Paul, et n'a subi aucune modification**.

---

## 4. Sécurité de l'Application Desktop (Kora Runtime)

Kora est conçue selon le principe du **moindre privilège** (*Least Privilege*) :

1. **Isolation des Processus (`contextIsolation: true`)** :
   - L'interface visuelle (`renderer.js`) n'a aucun accès direct aux commandes système du PC de l'utilisateur.
   - Même si un pirate arrivait à injecter du HTML/JS dans la fenêtre, il ne pourrait pas exécuter de commande shell sur la machine hôte.

2. **Désactivation de Node.js dans la vue (`nodeIntegration: false`)** :
   - Standard de sécurité maximal pour Electron recommandé par l'OWASP.

3. **Protection de la Vie Privée (100 % Hors-Ligne)** :
   - Le presse-papiers, les notes to-do et les fichiers glissés restent **strictement stockés sur le disque dur local de l'utilisateur** (`%APPDATA%\kora-notch`).
   - Aucune télémétrie, aucun tracker publicitaire, aucune analyse externe.

4. **Filtrage des Liens Sortants** :
   - Les clics sur des liens externes sont filtrés dans `main.js` pour n'accepter que les protocoles sécurisés `https://` et `mailto:`.

---

## 5. Feuille de Route Ultime (Prochaines Étapes Pro)

Quand Kora grandira, deux étapes scelleront la sécurité de manière institutionnelle :

1. **Certificat de Signature de Code Windows (Code Signing)** :
   - Obtenir un certificat de signature (Certum, Sectigo) pour apposer le sceau officiel de l'éditeur sur les exécutables.
2. **Certification & Publication sur le Microsoft Store** :
   - En publiant Kora sur le Store officiel de Windows, c'est **Microsoft qui valide le code, le signe avec leurs clés cryptographiques et gère les mises à jour sécurisées**. Zéro question de sécurité pour les utilisateurs grand public.
