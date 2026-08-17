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
