# Backend — Plateforme Solidaire

API Node.js / Express + PostgreSQL pour la plateforme de solidarité
(citoyens, associations, dons, signalements).

## Prérequis

- Node.js 20+ (testé sur Node 25)
- PostgreSQL 14+ en écoute sur `localhost:5432`
- Une base nommée `solidarite_db` (ou le nom de votre choix, via `.env`)

## Installation

```bash
npm install
cp .env.example .env      # PowerShell : Copy-Item .env.example .env
```

Renseignez ensuite `.env` :

| Variable | Description |
| --- | --- |
| `PORT` | Port d'écoute de l'API (défaut `5000`) |
| `JWT_SECRET` | Secret de signature des JWT — **générez-le**, ne le partagez pas |
| `CORS_ORIGIN` | Origine(s) autorisée(s) pour CORS, séparées par des virgules (défaut `http://localhost:4200`) |
| `DB_USER`, `DB_HOST`, `DB_NAME`, `DB_PASSWORD`, `DB_PORT` | Connexion PostgreSQL |

Générer un secret :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Base de données

### PostgreSQL avec Docker (recommandé en dev)

```bash
docker run --name solidarite-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=<mot_de_passe_local> \
  -e POSTGRES_DB=solidarite_db \
  -p 5432:5432 -d postgres:16
```

Au quotidien :

```bash
docker start solidarite-postgres   # après un redémarrage de la machine
docker stop solidarite-postgres    # pour libérer le port 5432
```

Le mot de passe doit être identique à `DB_PASSWORD` dans `.env`. Les données
sont conservées tant que le conteneur existe (`docker rm -f solidarite-postgres`
les efface).

### Migrations et compte admin

```bash
npm run migrate       # applique migrations/*.sql (idempotent)
npm run create-admin  # crée le compte admin de migrations/create-admin.js
```

Comptes de démonstration créés manuellement pendant le développement :
`admin@solidarite.tn` (admin), `asso@test.tn` (association), `sami@test.tn` (citoyen).

## Lancer

```bash
npm start     # production
npm run dev   # redémarrage auto (node --watch)
```

- API : http://localhost:5000
- Vérification rapide : `curl http://localhost:5000/api/campagnes`

## Tests

```bash
npm test      # node:test + fetch, sans dépendance externe
```

Les tests démarrent le serveur sur un port éphémère et exercent l'API réelle
(401 / 403 / 404 JSON, refus du rôle admin à l'inscription, rollback en cas
d'échec d'inscription, parcours citoyen, validations du don, accès documents,
règles de don par rôle, création de campagne soumise à validation admin,
visibilité publique des signalements, prise en charge exclusive par une
association (409), transitions de statut, réouverture et historique).

## Structure

```
app.js                     # configuration Express (middlewares, routes, erreurs)
server.js                  # point d'entrée (listen)
config/db.js               # pool PostgreSQL
auth/                      # US01 : inscription / connexion (JWT)
reports/                   # US05/US07 : signalements
campagnes/                 # US10/US11/US12 : campagnes, dons, utilisation des fonds
associations/              # US02/US03 : documents légaux, validation admin
middlewares/               # auth (JWT), roles, upload (multer)
migrations/                # schéma + runner
utils/http.js              # fabrique d'erreurs + réponse d'erreur JSON
test/                      # tests de fumée
uploads/                   # documents légaux PRIVÉS (non versionnés)
uploads-public/            # photos de signalement PUBLIQUES (non versionnées)
```

## Endpoints

| Méthode | Route | Accès |
| --- | --- | --- |
| POST | `/api/auth/inscription` | public (citoyen / association uniquement) |
| POST | `/api/auth/connexion` | public |
| POST | `/api/reports` | authentifié (multipart `photo`) |
| GET | `/api/signalement/public`, `/api/signalement/public/:id` | **public, sans authentification** |
| GET | `/api/signalement/mes` | authentifié (uniquement ses propres signalements) |
| GET | `/api/signalement/mes-prises-en-charge` | association, admin |
| POST | `/api/signalement/:id/prendre-en-charge` | association **approuvée** (409 si déjà prise en charge) |
| PATCH | `/api/signalement/:id/statut` | association **responsable** (`en_cours` ↔ `resolu`) |
| GET | `/api/signalement`, `/api/signalement/:id` | association, admin (sans identité du citoyen) |
| GET | `/api/campagnes`, `/:id`, `/:id/avancement`, `/associations` | public |
| GET | `/api/campagnes/mes-campagnes` | association |
| POST | `/api/campagnes` | association **approuvée** |
| POST | `/api/campagnes/:id/don` | public (don anonyme) ; citoyen ; **refusé** aux admins/associations connectés |
| POST | `/api/campagnes/:id/utilisation` | association propriétaire **approuvée** |
| GET/POST/DELETE | `/api/associations/documents` | association |
| GET | `/api/associations/mon-statut` | association |
| GET | `/api/associations`, `/:id/documents` | admin |
| PATCH | `/api/associations/:id/validation` | admin |
| GET | `/api/documents/:id/file` | propriétaire ou admin (token en en-tête **ou** `?token=`) |

## Notes

- **Secrets** : `.env`, `uploads/` et `node_modules/` ne sont pas versionnés.
  Si un secret a déjà été poussé sur un dépôt, considérez-le comme compromis et
  régénérez-le.
- **Fichiers** : les documents légaux ne sont servis que par
  `/api/documents/:id/file` (contrôle propriétaire/admin). Les photos de
  signalement sont publiques sous `/uploads/photos/...`.
- **Montants** : les colonnes `NUMERIC` sont converties en nombres (`::float8`)
  pour que le front reçoive des `number` et non des chaînes (`"1000.00"`).
- **Statuts de campagne** : une campagne dont la `date_fin` est dépassée est
  renvoyée comme `terminee` (calcul à la lecture, sans écriture en base).
- **Règles de don** : seuls les citoyens connectés (et le public, pour un don
  anonyme) peuvent donner. Un token `admin` ou `association` sur
  `POST /:id/don` reçoit un `403` (`authMiddleware.optionnel` +
  `checkRole.interdire`), sans casser le don anonyme sans login.
- **Création de campagne** : réservée aux associations dont
  `statut_validation = 'approuve'`. Une association `pending`/`refuse` reçoit un
  `403` sur `POST /api/campagnes` et `POST /:id/utilisation`.
- **Signalements (US06/US32/US33)** : trois statuts seulement — `recu` (défaut,
  aucune association), `en_cours` (prise en charge explicite par une association
  validée) et `resolu`. Aucune affectation automatique : une association choisit
  le signalement via `POST /:id/prendre-en-charge`. L'anti-course est garanti par
  un `SELECT ... FOR UPDATE` + `UPDATE` conditionnel dans une transaction
  (la seconde association reçoit `409`). Seule l'association responsable peut
  faire évoluer le statut (`en_cours → resolu`, ou `resolu → en_cours` pour
  rouvrir) ; toute autre association reçoit `403`. Chaque transition est
  journalisée dans `signalement_statut_historique` et exposée dans
  `historique: [{ statut, date, nom_association }]`. Les signalements
  `en_cours`/`resolus` restent visibles publiquement.
- **Confidentialité** : la projection publique ne sélectionne jamais
  `citoyen_id` (anonyme ou non) ; les endpoints US07 association/admin ne
  l'exposent pas davantage.
- Les réponses d'erreur sont toujours `{ "erreur": "..." }`, y compris pour les
  routes inconnues (404 JSON).
