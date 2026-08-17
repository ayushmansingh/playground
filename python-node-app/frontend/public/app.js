// Use whatever host the page was loaded from, so this works both on
// localhost and when another machine loads the page via your LAN IP.
const API_URL = `http://${window.location.hostname}:5000/api/todos`;

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const status = document.getElementById("status");

async function loadTodos() {
  status.textContent = "";
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Failed to load todos");
    const todos = await res.json();
    renderTodos(todos);
  } catch (err) {
    status.textContent = "Could not reach backend. Is app.py running on port 5000?";
  }
}

function renderTodos(todos) {
  list.innerHTML = "";
  for (const todo of todos) {
    const li = document.createElement("li");
    if (todo.done) li.classList.add("done");

    const span = document.createElement("span");
    span.textContent = todo.text;
    span.addEventListener("click", () => toggleTodo(todo.id));

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => deleteTodo(todo.id));

    li.append(span, removeBtn);
    list.appendChild(li);
  }
}

async function toggleTodo(id) {
  await fetch(`${API_URL}/${id}`, { method: "PATCH" });
  loadTodos();
}

async function deleteTodo(id) {
  await fetch(`${API_URL}/${id}`, { method: "DELETE" });
  loadTodos();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  input.value = "";
  loadTodos();
});

loadTodos();
