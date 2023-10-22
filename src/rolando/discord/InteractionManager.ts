import {
	ActionRowBuilder,
	ButtonBuilder,
	type ButtonInteraction,
	ButtonStyle,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	type PermissionsBitField,
} from 'discord.js';

import { FileManager } from '../domain/FileManager';
import { dataRetriever } from '../../main';
import { chainsMap, MarkovChain } from '../model/MarkovChain';
import { commands } from '../../static/Commands';
import { PROVIDE_TRAINING_LABEL } from '../../static/Static';
import { backToAlphabet, getRandom, toHieroglyphs } from '../../utils/Utils';
import { error } from '../../utils/Logging';
import axios from 'axios';

export class InteractionManager {
	static async getTrainingData(
		interaction: ChatInputCommandInteraction | ButtonInteraction
	) {
		await interaction.reply({
			content: `<@${interaction.user.id}> Started Fetching messages.\nI will send a message when I'm done\nEstimated Time: \`1 Minute per every 4000 Messages in the Server\`\nThis might take a while...`,
			ephemeral: true,
		});

		const start = Date.now();
		await dataRetriever.fetchAndStoreAllMessagesInGuild(interaction.guild).then(() => {
			const runtime = new Date(Date.now() - start);
			const formattedTime = `${runtime.getMinutes()}m ${runtime.getSeconds()}s`;
			interaction.channel.send(
				`<@${interaction.user.id}> Finished Fetching training data!\nTime Passed: \`${formattedTime}\``
			);
			chainsMap
				.get(interaction.guild.id)
				.provideData(FileManager.getPreviousTrainingDataForGuild(interaction.guild.id));
		});
	}

	static async getAnalytics(interaction: ChatInputCommandInteraction) {
		const chain = chainsMap.get(interaction.guild.id);
		const analytics = chain.getAnalytics();
		const embed = new EmbedBuilder()
			.setTitle('Analytics')
			.setDescription(
				'Complexity Score indicates how _smart_ the bot is.\n Higher value means smarter'
			)
			.setColor('Gold')
			.addFields(
				{
					name: 'Complexity Score',
					value: `\`${analytics.complexityScore}\``,
					inline: true,
				},
				{
					name: 'Vocabulary',
					value: `\`${analytics.words} words\` `,
					inline: true,
				},
				{ name: '\t', value: '\t' },
				{ name: 'Gifs', value: `\`${analytics.gifs}\``, inline: true },
				{ name: 'Videos', value: `\`${analytics.videos}\``, inline: true },
				{ name: 'Images', value: `\`${analytics.images}\``, inline: true }
			);
		await interaction.reply({
			embeds: [embed],
		});
	}

	static async provideTraining(interaction: ChatInputCommandInteraction) {
		// Confirm Button
		const confirm = new ButtonBuilder()
			.setCustomId('confirm-provide-training')
			.setLabel('Confirm')
			.setStyle(ButtonStyle.Success);
		// Cancel Button
		const cancel = new ButtonBuilder()
			.setCustomId('cancel-provide-training')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder().addComponents(confirm, cancel);

		await interaction.reply({
			content: PROVIDE_TRAINING_LABEL,
			components: [row as any],
			ephemeral: true,
		});
	}

	static async confirmProvideTraining(interaction: ButtonInteraction) {
		if (FileManager.guildHasPreviousData(interaction.guild.id)) {
			const confirm = new ButtonBuilder()
				.setCustomId('overwrite-training')
				.setLabel('Overwrite')
				.setStyle(ButtonStyle.Success);
			const cancel = new ButtonBuilder()
				.setCustomId('cancel-provide-training')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Secondary);

			const row = new ActionRowBuilder().addComponents(confirm, cancel);

			await interaction.reply({
				content:
					'Training data for this server has been found\nWould you like to overwrite it?',
				components: [row as any],
				ephemeral: true,
			});
			return;
		}

		InteractionManager.getTrainingData(interaction);
	}

	static async cancelProvideTraining(interaction: ButtonInteraction) {
		await interaction.reply({
			content: 'The process was canceled',
			ephemeral: true,
		});
	}

	static async resetTraining(interaction: ChatInputCommandInteraction) {
		// Confirm Button
		const confirm = new ButtonBuilder()
			.setCustomId('confirm-reset-training')
			.setLabel('Confirm')
			.setStyle(ButtonStyle.Danger);
		// Cancel Button
		const cancel = new ButtonBuilder()
			.setCustomId('cancel-reset-training')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary);

		const row = new ActionRowBuilder().addComponents(confirm, cancel);

		await interaction.reply({
			content:
				'This command will delete **ALL PREVIOUS TRAINING DATA**?\nThis will make me unmemorize all the messages i learned from.\n**Are you sure?**',
			components: [row as any],
			ephemeral: true,
		});
	}

	static async confirmResetTraining(interaction: ButtonInteraction) {
		FileManager.deleteGuildData(interaction.guild.id);
		await interaction.reply({
			content:
				'All the training data for this server has been deleted, i am now a blank slate.',
			ephemeral: true,
		});
	}

	static async cancelResetTraining(interaction: ButtonInteraction) {
		await interaction.reply({
			content: 'The process was canceled',
			ephemeral: true,
		});
	}

	static async irlFact(interaction: ChatInputCommandInteraction) {
		axios
			.get('https://uselessfacts.jsph.pl/api/v2/facts/random', {
				headers: { Accept: 'application/json' },
			})
			.then(async (res) => {
				await interaction.reply({ content: res.data.text });
			})
			.catch((err) => {
				error(err);
			});
	}

	static async catFact(interaction: ChatInputCommandInteraction) {
		axios
			.get('https://meowfacts.herokuapp.com/', {
				headers: { Accept: 'application/json' },
			})
			.then(async (res) => {
				await interaction.reply(res.data.data[0]);
			})
			.catch((err) => {
				error(err);
			});
	}

	static async delete(interaction: ChatInputCommandInteraction, message: string) {
		const guildId = interaction.guild.id;
		const success = chainsMap.get(guildId).delete(message, guildId);
		await interaction.reply({
			content: `${success ? 'Deleted data:' : 'Data not found:'} \`${message}\``,
			ephemeral: true,
		});
	}

	static async checkAdmin(interaction: ChatInputCommandInteraction) {
		if (
			!(interaction.member.permissions as Readonly<PermissionsBitField>).has(
				'Administrator'
			)
		) {
			await interaction.reply({
				content: 'You are not authorized to use this command.',
				ephemeral: true,
			});
			return false;
		}

		return true;
	}

	static async ping(interaction: ChatInputCommandInteraction) {
		try {
			const members = await interaction.guild.members.fetch();

			const userIds = members.map((member) => member.user.id);
			const randomUserId = userIds[Math.floor(Math.random() * userIds.length)];
			const random = Math.floor(Math.random() * 15) + 1;
			await interaction.reply({
				content: `<@${randomUserId}> ${chainsMap.get(interaction.guild.id).talk(random)}`,
			});
		} catch (err) {
			error(err);
		}
	}

	static async help(interaction: ChatInputCommandInteraction) {
		try {
			const embed = new EmbedBuilder()
				.setTitle('Rolando Help')
				.setDescription('Rolando is a bot that learns to type like a server user')
				.setColor('Gold');
			commands.forEach((command: { name: string; description: string }) => {
				embed.addFields({
					name: `\`${command.name}\``,
					value: command.description,
				});
			});
			await interaction.reply({
				embeds: [embed],
				ephemeral: true,
			});
		} catch (err) {
			error(err);
		}
	}

	static async getOpinion(interaction: ChatInputCommandInteraction, chain: MarkovChain) {
		const seed = interaction.options.getString('about');
		const word = seed.split(' ').at(-1);
		const random = Math.floor(Math.random() * 22) + 4;
		const reply = chain.generateText(word, random);
		await interaction.reply(`${seed.replace(word, '')}${reply}`);
	}

	static async hyero(interaction: ChatInputCommandInteraction, chain: MarkovChain) {
		const text = interaction.options.getString('text') ?? chain.talk(getRandom(10, 90));
		await interaction.reply(toHieroglyphs(text));
	}

	static async unhyero(interaction: ChatInputCommandInteraction) {
		const text = interaction.options.getString('text');
		await interaction.reply(backToAlphabet(text));
	}
}
