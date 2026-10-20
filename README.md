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
règles de don par rôle, création de campagne soumise à validation admin).

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
| GET | `/api/signalement`, `/api/signalement/:id` | association, admin |
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
- Les réponses d'erreur sont toujours `{ "erreur": "..." }`, y compris pour les
  routes inconnues (404 JSON).
