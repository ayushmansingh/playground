from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

todos = [
    {"id": 1, "text": "Learn Flask", "done": False},
    {"id": 2, "text": "Learn Express", "done": False},
]
next_id = 3


@app.get("/api/todos")
def get_todos():
    return jsonify(todos)


@app.post("/api/todos")
def add_todo():
    global next_id
    data = request.get_json(force=True) or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    todo = {"id": next_id, "text": text, "done": False}
    todos.append(todo)
    next_id += 1
    return jsonify(todo), 201


@app.patch("/api/todos/<int:todo_id>")
def toggle_todo(todo_id):
    for todo in todos:
        if todo["id"] == todo_id:
            todo["done"] = not todo["done"]
            return jsonify(todo)
    return jsonify({"error": "not found"}), 404


@app.delete("/api/todos/<int:todo_id>")
def delete_todo(todo_id):
    global todos
    todos = [t for t in todos if t["id"] != todo_id]
    return "", 204


if __name__ == "__main__":
    app.run(port=5000, debug=True)
