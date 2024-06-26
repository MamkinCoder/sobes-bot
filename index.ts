import { file, write } from "bun";
import { Telegraf } from "telegraf";
import type { Message } from "telegraf/types";

interface UserData {
    username: string;
    firstMessageId: number;
    messageCount: number;
}

const BOT_TOKEN = Bun.env.BOT_TOKEN;
const GROUP_CHAT_ID = Bun.env.GROUP_CHAT_ID;
const USER_DATA_FILE = "./user_data.json";

if (!BOT_TOKEN || !GROUP_CHAT_ID) {
    console.error(".env is not setup");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

let botUserId: number;
let usersData: { [key: number]: UserData } = {};

async function readUserData() {
    try {
        const userFile = file(USER_DATA_FILE);
        if (await userFile.exists()) {
            usersData = await userFile.json();

            return;
        }
        console.log("User data file not found, starting with an empty object.");
        usersData = {};
    } catch (error) {
        console.error("Error reading user data file:", error);
    }
}

async function writeUserData() {
    try {
        await write(USER_DATA_FILE, JSON.stringify(usersData, null, 2));
    } catch (error) {
        console.error("Error writing user data file:", error);
    }
}

(async () => {
    const botInfo = await bot.telegram.getMe();
    botUserId = botInfo.id;
    console.log(`Bot started as @${botInfo.username} with ID ${botUserId}`);
    await readUserData();
})();

bot.use((ctx, next) => {
    if (ctx.message && ctx.message.chat.id === Number(GROUP_CHAT_ID) && ctx.message.from.id !== botUserId) {
        if (isTextMessage(ctx.message)) {
            console.log(`Message "${ctx.message.text}" ignored from group chat`);
        } else {
            console.log("Non-text message ignored from group chat");
        }
        return;
    }

    next();
});

bot.start(async (ctx) => {
    const userId = ctx.message.from.id;
    const username = ctx.message.from.username || `${ctx.message.from.first_name} ${ctx.message.from.last_name}`;
    const welcomeMessage = `Привет! 👋 Этот бот помогает нам в <i>группе разработки маркетинга Яндекс Недвижимости</i> собирать контакты кандидатов для собеседований. 👨‍💻
Пожалуйста, напиши буквально пару слов о себе, нам так будет легче тебя найти 👀 Можешь отправить своё резюме сейчас или после <b>Young Con</b> этому боту, мы его тоже получим.

<i>⚠️ Только проверь, что тебе по нику могут писать незнакомцы, или напиши свои контакты сюда</i>`;

    if (!usersData[userId]) {
        await ctx.reply(welcomeMessage, { parse_mode: "HTML" });
        const sentMessage = await ctx.telegram.sendMessage(GROUP_CHAT_ID, `Новый #кандидат: @${username}`);

        usersData[userId] = { username, firstMessageId: sentMessage.message_id, messageCount: 1 };

        await writeUserData();

        return;
    }

    await ctx.reply("Мы уже записали твой контакт! Если хочешь, можешь докинуть сюда что-то о себе или анекдот 🥸");
});

bot.on("message", async (ctx) => {
    const userId = ctx.message.from.id;

    if (userId === botUserId) {
        console.log("Ignoring message from the bot itself");
        return;
    }

    if (!usersData[userId]) {
        await ctx.reply("Сделай, пожалуйста 💁‍♂️ /start");

        return;
    }

    if (usersData[userId].messageCount >= 10) {
        await ctx.reply("Молодец, но DOS'а сегодня не будет. Тебе нужно не во фронтендеры а в тестировщики идти 🫣");
        return;
    }

    try {
        await bot.telegram.copyMessage(GROUP_CHAT_ID, ctx.message.chat.id, ctx.message.message_id, {
            reply_to_message_id: usersData[userId].firstMessageId,
        } as any);
        console.log("Message copied successfully");

        usersData[userId].messageCount += 1;

        await writeUserData();
    } catch (error) {
        console.error("Error processing message:", error);
    }
});

try {
    bot.launch();
    console.log("Bot started successfully");
} catch (error) {
    console.error("Error starting bot:", error);
}

function isTextMessage(message: Message): message is Message.TextMessage {
    return "text" in message;
}
