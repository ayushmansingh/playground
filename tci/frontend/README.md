# Frontend

This is a Vite React application. Build with `npm run build`; Vite writes the
production bundle to `frontend/dist`.

All browser API calls use relative `/api/...` paths so the internal app server
can route frontend and backend traffic together. For local work, run the
backend with `uvicorn main:app --port 8000` and then `npm run dev`; Vite
proxies `/api` to `API_ORIGIN` (default `http://127.0.0.1:8000`).

- `src/App.jsx` switches between the two views and holds the header counters.
- `src/views/SearchView.jsx` searches raw chats; `src/views/InsightsView.jsx`
  (with `src/views/insights/`) filters and analyzes AI-profiled chats.
- `src/components/` has the shared pieces, including the transcript.
- `src/lib/` has the API helpers, value labels, and the conversation loader.
- Styling follows `../DESIGN.md` (Cafe), all in `src/app.css`.
