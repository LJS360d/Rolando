import { log } from 'console';
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  Client,
  Guild,
  Message,
} from 'discord.js';

import { startAdminServer } from './AdminServer';
import { commands } from './Commands';
import { DataRetriever } from './DataRetriever';
import { FileManager } from './FileManager';
import { InteractionManager } from './InteractionManager';
import {
  chainsMap,
  MarkovChain,
} from './MarkovChain';
import { options } from './Options';
import { JOIN_LABEL } from './static/Static';
import { getRandom } from './utils/Utils';

// Import dotenv to load environment variables from .env file
require('dotenv').config();

export const client = new Client(options);
export const dataRetriever = new DataRetriever()

client.on('ready', async () => {
  log(`Logged in as ${client.user!.tag}!`);
  await refreshCommands();
  log('Successfully reloaded application (/) commands.');
  const guilds = client.guilds.cache;
  guilds.forEach((guild: Guild) => {
    chainsMap.set(guild.id, new MarkovChain())
    const previousData = FileManager.getPreviousTrainingDataForGuild(guild.id);
    if (previousData !== null) {
      // Load data into markovchain
      chainsMap.get(guild.id)!.provideData(previousData);
      chainsMap.get(guild.id)!.replyRate = (FileManager.getReplyRate(guild.id) ?? 10);
      log(`Loaded ${previousData.length} messages for guild:${guild.name}`);
    } else
      log(`No previous data found for guild:${guild.name}`);
  })
  log(`Started ${chainsMap.size} Chains`);
  // Once chains are loaded start the admin server
  startAdminServer();

  async function refreshCommands(): Promise<void> {
    try {
      log('Started refreshing application (/) commands.');
      await client.application?.commands.set(commands);
    } catch (error) { error(error) }
  }
})
client.on('guildCreate', (guild: Guild) => {
  chainsMap.set(guild.id, new MarkovChain())
  guild.systemChannel.send(JOIN_LABEL)
})
client.on('guildDelete', (guild: Guild) => {
  chainsMap.delete(guild.id)
  FileManager.deleteGuildData(guild.id)
})
// Command Interactions
client.on('interactionCreate', async function (interaction: ChatInputCommandInteraction) {
  const chain = chainsMap.get(interaction.guildId);
  if (!chain) return;
  if (interaction.isChatInputCommand())

    switch (interaction.commandName) {
      case 'irlfact':
        InteractionManager.irlFact(interaction)
        break;

      case 'catfact':
        InteractionManager.catFact(interaction)
        break;

      case 'ping':
        if (await InteractionManager.checkAdmin(interaction))
          InteractionManager.ping(interaction)
        break;

      case 'providetraining':
        if (await InteractionManager.checkAdmin(interaction))
          InteractionManager.provideTraining(interaction)
        break;

      case "resettraining":
        if (await InteractionManager.checkAdmin(interaction))
          InteractionManager.resetTraining(interaction)
        break;

      case "wipe":
        //if (await InteractionManager.checkAdmin(interaction))
        InteractionManager.delete(interaction, interaction.options.getString('data'))
        break;

      case 'setreplyrate':
        //if (await InteractionManager.checkAdmin(interaction)) {
        chain.replyRate = interaction.options.getInteger('rate');
        const reply = (chain.replyRate === 0) ? `Ok, I won't reply to anybody` :
          (chain.replyRate === 1) ? `Ok, I will always reply` : `Set reply rate to ${chain.replyRate}`
        FileManager.saveReplyRate(chain.replyRate, interaction.guild.id)
        await interaction.reply({ content: reply });
        //}
        break;

      case 'replyrate':
        await interaction.reply(`The reply rate is currently set to ${chain.replyRate}\nUse \`/setreplyrate\` to change it`);
        break;

      case 'analytics':
        await InteractionManager.getAnalytics(interaction);
        break;

      case 'help':
        await InteractionManager.help(interaction);
        break;

      case 'opinion':
        await InteractionManager.getOpinion(interaction, interaction.options.getString('about'));
        break;

      case 'gif':
        await interaction.reply(await chain.getGif());
        break;

      case 'image':
        await interaction.reply(await chain.getImage());
        break;

      case 'video':
        await interaction.reply(await chain.getVideo());
        break;


    }

});
// Button Interactions
client.on('interactionCreate', async function (interaction: ButtonInteraction) {
  if (interaction.isButton())
    switch (interaction.customId) {
      case "overwrite-training":
        InteractionManager.getTrainingData(interaction)
        break;
      case "confirm-provide-training":
        InteractionManager.confirmProvideTraining(interaction)
        break;
      case "cancel-provide-training":
        InteractionManager.cancelProvideTraining(interaction)
        break;
      case "confirm-reset-training":
        InteractionManager.confirmResetTraining(interaction)
        break;
      case "cancel-reset-training":
        InteractionManager.cancelResetTraining(interaction)
        break;

    }
})

client.on('messageCreate', async (msg: Message) => {
  if (msg.author !== client.user) {
    const guildId = msg.guild.id;
    const chain = chainsMap.get(guildId)!;
    if (msg.content) {
      FileManager.appendMessageToFile(msg.content, guildId);
      chain.updateState(msg.content);
    }

    const pingCondition: boolean = msg.content.includes(`<@${client.user!.id}>`);
    // 1/replyRate chance to reply
    const shouldReply: boolean =
      chain.replyRate === 1 || pingCondition
        ? true : chain.replyRate === 0
          ? false : getRandom(1,chain.replyRate) === 1;

    if (shouldReply) {
      // 4 to 25
      const random = getRandom(4,25);
      // 95% Plain message, 5% Gif/Img/Vid
      const reply = (random <= 24)
        ? chain.talk(random)
        : ((Math.random() < 1 / 3) ? await chain.getGif()
          : ((Math.random() < 0.5) ? await chain.getImage()
            : await chain.getVideo()));
      await msg.channel.send(reply);
    }
  }
});

client.login(process.env['TOKEN']);

process.on('SIGINT', async () => {
  log('Received SIGINT signal. Shutting down gracefully...');

  process.exit(0)
})

process.on('SIGTERM', async () => {
  log('Received SIGTERM signal. Shutting down gracefully...');

  process.exit(0)
})

process.on('uncaughtException', (error: Error) => {
  log('An unexpected error occurred:', error.message);
});