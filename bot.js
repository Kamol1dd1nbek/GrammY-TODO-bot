import dotenv from "dotenv";
dotenv.config();
import { Bot } from "grammy";
import schedule from "node-schedule";
import { addTask, getUserTasks, updateTask, deleteTask } from "./db.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN not found in .env");

const userState = {};
const reminders = {};
const bot = new Bot(BOT_TOKEN);

function isValidDateTime(input) {
  const date = new Date(input);
  return !isNaN(date.getTime());
}

function scheduleReminder(chatId, index, task) {
  if (!task.time) return;
  const date = new Date(task.time);
  if (date.getTime() < Date.now()) return;
  const job = schedule.scheduleJob(date, () => {
    bot.api.sendMessage(chatId, `⏰ Eslatma: ${task.name}`);
  });
  if (!reminders[chatId]) reminders[chatId] = {};
  reminders[chatId][index] = job;
}

bot.command("start", (ctx) => {
  ctx.reply("Welcome to TODO bot!");
});

bot.command("add", (ctx) => {
  const chatId = ctx.chat.id.toString();
  userState[chatId] = { step: "name", task: {} };
  ctx.reply("Vazifa nomini kiriting:");
});

bot.command("tasks", (ctx) => {
  const tasks = getUserTasks(ctx.chat.id.toString());
  if (!tasks.length) return ctx.reply("Sizda vazifalar yo‘q.");
  let msg = tasks
    .map(
      (t, i) =>
        `${i + 1}. ${t.name} | ${t.time || "⏳ belgil. emas"} | ${t.level} | ${
          t.status
        }`
    )
    .join("\n");
  ctx.reply(msg);
});

bot.command("complete", (ctx) => {
  const tasks = getUserTasks(ctx.chat.id.toString());
  if (!tasks.length) return ctx.reply("Vazifalar yo‘q.");
  const list = tasks.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  ctx.reply("Qaysi vazifani bajarildi deb belgilashni tanlang:\n" + list);
  userState[ctx.chat.id] = { step: "complete" };
});

bot.command("delete", (ctx) => {
  const tasks = getUserTasks(ctx.chat.id.toString());
  if (!tasks.length) return ctx.reply("Vazifalar yo‘q.");
  const list = tasks.map((t, i) => `${i + 1}. ${t.name}`).join("\n");
  ctx.reply("Qaysi vazifani o‘chirmoqchisiz?\n" + list);
  userState[ctx.chat.id] = { step: "delete" };
});

bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!userState[chatId]) return;

  const state = userState[chatId];

  if (state.step === "name") {
    state.task.name = ctx.message.text;
    state.step = "time";
    return ctx.reply(
      "Vaqtni kiriting (yyyy-mm-dd hh:mm) yoki `skip` deb yozing:"
    );
  }

  if (state.step === "time") {
    if (ctx.message.text.toLowerCase() === "skip") {
      state.task.time = null;
      state.step = "level";
      return ctx.reply("Darajani kiriting (low/medium/high):");
    }
    if (!isValidDateTime(ctx.message.text)) {
      return ctx.reply(
        "❌ Noto‘g‘ri format. To‘g‘ri yozing (masalan: 2025-08-30 14:30) yoki `skip` deb yozing."
      );
    }
    state.task.time = ctx.message.text;
    state.step = "level";
    return ctx.reply("Darajani kiriting (low/medium/high):");
  }

  if (state.step === "level") {
    state.task.level = ctx.message.text;
    state.task.status = "faol";
    addTask(chatId, state.task);

    const tasks = getUserTasks(chatId);
    const index = tasks.length - 1;
    scheduleReminder(chatId, index, state.task);

    delete userState[chatId];
    return ctx.reply("✅ Vazifa qo‘shildi!");
  }

  if (state.step === "complete") {
    const index = parseInt(ctx.message.text) - 1;
    const tasks = getUserTasks(chatId);
    if (tasks[index]) {
      tasks[index].status = "bajarilgan";
      updateTask(chatId, index, tasks[index]);
      if (reminders[chatId] && reminders[chatId][index]) {
        reminders[chatId][index].cancel();
        delete reminders[chatId][index];
      }
      ctx.reply("Vazifa bajarilgan deb belgilandi!");
    } else {
      ctx.reply("❌ Noto‘g‘ri raqam.");
    }
    delete userState[chatId];
  }

  if (state.step === "delete") {
    const index = parseInt(ctx.message.text) - 1;
    if (deleteTask(chatId, index)) {
      if (reminders[chatId] && reminders[chatId][index]) {
        reminders[chatId][index].cancel();
        delete reminders[chatId][index];
      }
      ctx.reply("🗑 Vazifa o‘chirildi!");
    } else {
      ctx.reply("❌ Noto‘g‘ri raqam.");
    }
    delete userState[chatId];
  }
});

bot.start();
console.log("Bot started successfully");
