import dotenv from "dotenv";
dotenv.config();
import { Bot } from "grammy";
import schedule from "node-schedule";
import {
  loadTasks,
  addTask,
  getUserTasks,
  updateTask,
  deleteTask,
} from "./db.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN not found in .env");

const bot = new Bot(BOT_TOKEN);

const userState = {};
const reminders = {};
loadTasks();

function parseDateTime(input) {
  const parts = input.split(" ");
  if (parts.length !== 2) return null;
  const datePart = parts[0].split("-");
  const timePart = parts[1].split(":");
  if (datePart.length !== 3 || timePart.length !== 2) return null;
  const [year, month, day] = datePart.map(Number);
  const [hour, minute] = timePart.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  return isNaN(date.getTime()) ? null : date;
}

function scheduleReminder(chatId, index, task) {
  if (!task.time) return;
  const date = new Date(task.time);
  if (isNaN(date.getTime()) || date.getTime() < Date.now()) return;
  const job = schedule.scheduleJob(date, () => {
    bot.api.sendMessage(chatId, `⏰ Eslatma: ${task.name}`);
  });
  if (!reminders[chatId]) reminders[chatId] = {};
  reminders[chatId][index] = job;
}

bot.catch((err) => {
  console.error("Xato:", err.error);
});

function resetState(userId) {
  delete userState[userId];
}

bot.command("start", (ctx) => {
  resetState(ctx.from.id);
  ctx.reply(
    "TODO botga xush kelibsiz! Vazifa qo‘shish uchun /add buyrug‘idan foydalaning."
  );
});

bot.command("add", (ctx) => {
  const userId = ctx.from.id;
  resetState(userId);
  userState[userId] = { step: "name", task: {} };
  ctx.reply("Vazifa nomini kiriting:");
});

bot.command("tasks", (ctx) => {
  const userId = ctx.from.id;
  resetState(userId);
  const tasks = getUserTasks(userId);
  if (!tasks.length) return ctx.reply("Sizda vazifa yo‘q.");

  let chunks = [];
  let current = "";
  tasks.forEach((t, i) => {
    const line = `${i + 1}. ${t.name}\n🕒 ${t.time || "belgilanmagan"}\n🎯 ${
      t.level
    }\n📌 ${t.status}\n\n`;
    if ((current + line).length > 3500) {
      chunks.push(current);
      current = line;
    } else {
      current += line;
    }
  });
  if (current) chunks.push(current);
  chunks.forEach((chunk) => ctx.reply(chunk));
});

bot.command("complete", (ctx) => {
  const userId = ctx.from.id;
  resetState(userId);
  const tasks = getUserTasks(userId);
  if (!tasks.length) return ctx.reply("Sizda vazifa yo‘q.");
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) return ctx.reply("Masalan: /complete 1");
  const index = parseInt(parts[1]) - 1;
  if (isNaN(index) || index < 0 || index >= tasks.length)
    return ctx.reply("❌ Noto‘g‘ri raqam.");
  tasks[index].status = "bajarilgan";
  updateTask(userId, index, tasks[index]);
  ctx.reply(`✅ Vazifa bajarildi: ${tasks[index].name}`);
});

bot.command("delete", (ctx) => {
  const userId = ctx.from.id;
  resetState(userId);
  const tasks = getUserTasks(userId);
  if (!tasks.length) return ctx.reply("Sizda vazifa yo‘q.");
  const parts = ctx.message.text.split(" ");
  if (parts.length < 2) return ctx.reply("Masalan: /delete 1");
  const index = parseInt(parts[1]) - 1;
  if (isNaN(index) || index < 0 || index >= tasks.length)
    return ctx.reply("❌ Noto‘g‘ri raqam.");
  deleteTask(userId, index);
  ctx.reply("🗑 Vazifa o‘chirildi.");
});

bot.on("message", (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];
  if (!state) return;

  if (state.step === "name") {
    state.task.name = ctx.message.text;
    state.step = "time";
    return ctx.reply(
      "Vazifa vaqtini kiriting (yyyy-mm-dd hh:mm) yoki `skip` deb yozing:"
    );
  }

  if (state.step === "time") {
    if (ctx.message.text.toLowerCase() === "skip") {
      const now = new Date();
      now.setHours(now.getHours() + 1);
      state.task.time = now.toISOString();
      state.step = "level";
      return ctx.reply("Darajani kiriting (low/medium/high):");
    }
    const date = parseDateTime(ctx.message.text);
    if (!date) {
      return ctx.reply(
        "❌ Noto‘g‘ri format. To‘g‘ri yozing (yyyy-mm-dd hh:mm) yoki `skip` deb yozing."
      );
    }
    state.task.time = date.toISOString();
    state.step = "level";
    return ctx.reply("Darajani kiriting (low/medium/high):");
  }

  if (state.step === "level") {
    const level = ctx.message.text.toLowerCase();
    if (!["low", "medium", "high"].includes(level)) {
      return ctx.reply("Faqat low, medium yoki high deb yozing:");
    }
    state.task.level = level;
    state.task.status = "faol";
    const tasks = getUserTasks(userId);
    addTask(userId, state.task);
    scheduleReminder(userId, tasks.length, state.task);
    ctx.reply("✅ Vazifa qo‘shildi!");
    resetState(userId);
  }
});

bot.start();
console.log("✅ Bot ishga tushdi");
