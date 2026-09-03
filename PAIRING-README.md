# Queen Vida MD — Pairing Website

This package includes a small built-in pairing website and API. It uses Baileys pairing-code login and stores the WhatsApp credentials in `./session`.

## Render

- Service type: Web Service
- Runtime: Node
- Build command: `npm install --legacy-peer-deps`
- Start command: `npm start`
- Set the environment variables from `.env.example` in Render.
- The service must expose port `PORT`; Render supplies this automatically.

After deployment, open the Render URL. The pairing page is the home page.

## Pairing

1. Enter the configured owner number, digits only (for example `2348138558590`).
2. Tap **GET PAIRING CODE**.
3. On WhatsApp open **Linked Devices → Link a Device → Link with phone number**.
4. Enter the displayed code.
5. After the account connects, the pairing socket closes and the normal bot process starts.

## Important session note

Render's ordinary filesystem is not a permanent database. A redeploy/restart can remove the `session` directory, which would require pairing again. For persistent production sessions, use a persistent disk or move the auth state to a persistent external store.

## Security

The pairing endpoint only accepts `OWNER_NUMBER`, and requests are rate-limited. Do not publish a pairing endpoint that accepts arbitrary phone numbers.
