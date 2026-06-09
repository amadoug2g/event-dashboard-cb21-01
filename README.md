# event-dashboard-cb21-01

Dashboard de suivi des inscrits pour **Les Grandes Conversations · 11 juin 2026** (Tour CB21, La Défense).

Conçu pour partager un suivi en lecture seule sans donner accès au back-office WeezEvent.

## Stack

- **Backend** : Node.js + Express — proxy WeezEvent API, cache en mémoire
- **Frontend** : HTML/CSS/JS vanilla — dashboard responsive, pas de build step
- **Process manager** : pm2
- **Déploiement** : VPS Hetzner

## Lancer en local

```bash
cp .env.example .env
# Remplir WZ_API_KEY, WZ_TOKEN, WZ_EVENT_ID dans .env

npm install
node server.js
# → http://localhost:3000
```

## Variables d'environnement

| Variable | Description |
|---|---|
| `WZ_API_KEY` | Clé API WeezEvent |
| `WZ_TOKEN` | Access token WeezEvent |
| `WZ_EVENT_ID` | ID de l'événement WeezEvent |
| `WZ_USERNAME` | Email du compte API (pour le refresh de token) |
| `WZ_PASSWORD` | Mot de passe du compte API |
| `PORT` | Port d'écoute (défaut: 3000) |
| `REFRESH_INTERVAL` | Intervalle de synchro en ms (défaut: 60000) |
| `SYNC_SECRET` | Token secret pour le endpoint `/api/sync` |

## Endpoints

| Route | Description |
|---|---|
| `GET /` | Dashboard HTML |
| `GET /api/participants` | Liste des inscrits (JSON, lecture seule) |
| `POST /api/sync` | Synchro manuelle (requiert header `x-sync-token`) |

## Sécurité

- Les credentials WeezEvent restent côté serveur, jamais exposés au navigateur
- Le `.env` est exclu du dépôt git (`.gitignore`)
- Aucune mutation des données possible via l'interface publique
