import {
	type ButtonInteraction,
	type ChatInputCommandInteraction,
	Client,
	type Guild,
	type Message,
} from 'discord.js';

import { startAdminServer } from './AdminServer';
import { DataRetriever } from './rolando/discord/DataRetriever';
import { commandInteractions } from './events/CommandInteractions';
import { FileManager } from './rolando/domain/FileManager';
import { chainsMap, MarkovChain } from './rolando/model/MarkovChain';
import { commands } from './static/Commands';
import { options } from './static/Options';
import { JOIN_LABEL } from './static/Static';
import { getRandom } from './utils/Utils';
import { buttonInteractions } from './events/ButtonInteractions';
import { info, warn, error, command } from './utils/Logging';

require('dotenv').config();
export const env = {
	// the discord bot's token
	TOKEN: process.env.TOKEN,
	// (recommended) a webhook for logs
	LOG_WEBHOOK: process.env.LOG_WEBHOOK_URL,
	// package version
	VERSION: process.env.npm_package_version,
};

export const client = new Client(options);
export const dataRetriever = new DataRetriever();

client.on('ready', async () => {
	info(`Logged in as ${client.user.tag}!`);
	await refreshCommands();
	info('Successfully reloaded application (/) commands.');
	const guilds = client.guilds.cache;
	guilds.forEach((guild: Guild) => {
		chainsMap.set(guild.id, new MarkovChain());
		const previousData = FileManager.getPreviousTrainingDataForGuild(guild.id);
		if (previousData !== null) {
			// Load data into markovchain
			chainsMap.get(guild.id)!.provideData(previousData);
			chainsMap.get(guild.id)!.replyRate = FileManager.getReplyRate(guild.id) ?? 10;
			info(`Loaded ${previousData.length} messages for guild: ${guild.name}`);
		} else {
			warn(`No previous data found for guild: ${guild.name}`);
		}
	});
	// Once chains are loaded start the admin server
	startAdminServer();

	async function refreshCommands(): Promise<void> {
		try {
			info('Started refreshing application (/) commands.');
			await client.application?.commands.set(commands);
		} catch (err) {
			error(err);
		}
	}
});
client.on('guildCreate', (guild: Guild) => {
	chainsMap.set(guild.id, new MarkovChain());
	guild.systemChannel.send(JOIN_LABEL);
	info(`Joined guild: ${guild.name}`);
});
client.on('guildDelete', (guild: Guild) => {
	chainsMap.delete(guild.id);
	FileManager.deleteGuildData(guild.id);
	warn(`Left guild: ${guild.name}`);
});
// Command Interactions
client.on('interactionCreate', async (interaction: ChatInputCommandInteraction) => {
	const chain = chainsMap.get(interaction.guildId);
	if (!chain) {
		await interaction.reply('Missing training data');
		return;
	}

	if (interaction.isChatInputCommand()) {
		command(interaction.guild.name, interaction.user.tag, interaction.commandName);
		const cmd = commandInteractions.find(
			(commandInteraction) => commandInteraction.name === interaction.commandName
		);
		if (cmd) {
			cmd.fn(interaction, chain);
		} else {
			await interaction.reply('Command not found');
		}
	}
});
// Button Interactions
client.on('interactionCreate', async (interaction: ButtonInteraction) => {
	if (interaction.isButton()) {
		command(interaction.guild.name, interaction.user.tag, interaction.customId);
		const cmd = buttonInteractions.find(
			(buttonInteraction) => buttonInteraction.customId === interaction.customId
		);
		if (cmd) {
			cmd.fn(interaction);
		} else {
			await interaction.reply('Button command not found');
		}
	}
});

client.on('messageCreate', async (msg: Message) => {
	if (msg.author !== client.user) {
		const guildId = msg.guild.id;
		const chain = chainsMap.get(guildId)!;
		if (msg.content && msg.content.split(' ').length > 1) {
			FileManager.appendMessageToFile(msg.content, guildId);
			chain.updateState(msg.content);
		}
		const pingCondition: boolean = msg.content.includes(`<@${client.user.id}>`);
		// 1/replyRate chance to reply
		const shouldReply: boolean =
			chain.replyRate === 1 || pingCondition
				? true
				: chain.replyRate === 0
				? false
				: getRandom(1, chain.replyRate) === 1;
		if (shouldReply) {
			// 4 to 25
			const random = getRandom(4, 25);
			// 95% Plain message, 5% Gif/Img/Vid
			const reply =
				random <= 24
					? chain.talk(random)
					: Math.random() < 0.33
					? await chain.getGif()
					: Math.random() < 0.5
					? await chain.getImage()
					: await chain.getVideo();
			await msg.channel.send(reply);
		}
	}
});

void client.login(env.TOKEN);

process.on('SIGINT', async () => {
	info('Received SIGINT signal. Rolando 😴');
	process.exit(0);
});

process.on('SIGTERM', async () => {
	info('Received SIGTERM signal. Rolando 😴');
	process.exit(0);
});

process.on('uncaughtException', (err: Error) => {
	error(`${err.name} ${err.message}`);
});
