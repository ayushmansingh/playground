# Python + Node Todo App

A minimal full-stack example: a Python (Flask) JSON API backend and a
Node (Express) frontend that serves a static page talking to that API.

```
python-node-app/
├── backend/     # Flask API (in-memory todo list) — port 5000
└── frontend/    # Express static server — port 3000
```

## 1. Run the backend

```bash
cd python-node-app/backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

The API is now at http://localhost:5000/api/todos.

## 2. Run the frontend

In a second terminal:

```bash
cd python-node-app/frontend
npm install
npm start
```

Open http://localhost:3000 in your browser.

## What it does

- The page fetches todos from the Flask API and renders them.
- Add a todo, click one to toggle done, or click "x" to delete it.
- All state lives in memory in `backend/app.py` and resets when you
  restart the backend.

## Requirements

- Python 3.9+
- Node.js 18+

## Accessing from another machine on your LAN

Both servers already bind to all network interfaces (`0.0.0.0`), and the
frontend's `app.js` builds the API URL from whatever hostname the page
was loaded with — so no code changes are needed. Steps:

1. Find your machine's LAN IP (e.g. `172.16.144.216`):
   - Windows: `ipconfig` → "IPv4 Address"
   - macOS/Linux: `ifconfig` or `ip addr`
2. Start the backend and frontend as above, on the machine that has that IP.
3. Allow the ports through your firewall on that machine:
   - Windows (run as Administrator, in PowerShell):
     ```powershell
     New-NetFirewallRule -DisplayName "Todo App Backend" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow
     New-NetFirewallRule -DisplayName "Todo App Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
     ```
   - macOS: System Settings → Network → Firewall → allow incoming connections for `node` and `python`.
   - Linux (ufw): `sudo ufw allow 3000 && sudo ufw allow 5000`
4. From the other machine (on the same Wi-Fi/LAN), open:
   `http://172.16.144.216:3000`

Both machines must be on the same local network/subnet for this to work.
