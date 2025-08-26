import fs from "node:fs";

const DB_FILE = "tasks.json";

let tasks = {};

export function loadTasks() {
  if (fs.existsSync(DB_FILE)) {
    tasks = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  }
  return tasks;
}

export function saveTasks() {
  fs.writeFileSync(DB_FILE, JSON.stringify(tasks, null, 2));
}

export function getUserTasks(userId) {
  return tasks[userId] || [];
}

export function addTask(userId, task) {
  if (!tasks[userId]) tasks[userId] = [];
  tasks[userId].push(task);
  saveTasks();
}

export function updateTask(userId, index, updatedTask) {
  if (tasks[userId] && tasks[userId][index]) {
    tasks[userId][index] = updatedTask;
    saveTasks();
    return true;
  }
  return false;
}

export function deleteTask(userId, index) {
  if (tasks[userId] && tasks[userId][index]) {
    tasks[userId].splice(index, 1);
    saveTasks();
    return true;
  }
  return false;
}

loadTasks();
