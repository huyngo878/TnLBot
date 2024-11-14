import dotenv from 'dotenv';
dotenv.config();

import { Client, GatewayIntentBits, SlashCommandBuilder } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMessages,
  ],
});

// Emote definitions for roles
const EMOJIS = {
  DPS: '⚔️', // Sword for DPS
  HEALER: '💉', // Healer for HEALER
  TANK: '🛡️', // Shield for TANK
  FLEX: '🥷', // Ninja for FLEX
  ABSENT: '❌' // X for Absent
};

// Initialize storage for parties and absent lists
const MAX_PARTIES = 12;
const MAX_MEMBERS = 6;
let parties = Array.from({ length: MAX_PARTIES }, () => ({ TANK: [], DPS: [], HEALER: [] }));
const flexParty = [];
const absentList = [];
let displayMessage = null; // Reference to the message displaying parties

// Function to add a user to the appropriate party
function addToParty(userId, role) {
  if (role === 'FLEX') {
    flexParty.push(userId);
    return;
  }

  for (let i = 0; i < MAX_PARTIES; i++) {
    const party = parties[i];
    if (party[role].length < (role === 'DPS' ? 4 : 1)) {
      party[role].push(userId);
      return;
    }
  }
  flexParty.push(userId);
}

// Function to create a new party message
async function createPartyMessage(channel, guildName, warTime) {
  console.log(`Creating party message for ${guildName} at ${warTime}`);
  
  // Clear previous party message and the war message
  if (displayMessage) {
    await displayMessage.delete();
    displayMessage = null;
  }

  // Try to find and delete the previously created war message (if any)
  const previousMessages = await channel.messages.fetch({ limit: 2 }); // Fetch last two messages (including the current war instructions)
  const lastMessage = previousMessages.first();
  const secondLastMessage = previousMessages.last();

  // Deleting the war instructions message (if exists)
  if (lastMessage && lastMessage.id !== displayMessage?.id) {
    await lastMessage.delete();
  }

  // Message content with role selection instructions
  const rosterContent = formatPartyDisplay();
  displayMessage = await channel.send(rosterContent);

  const messageContent = `**War against ${guildName} - ${warTime}**\nReact with the appropriate emote to join:\n
${EMOJIS.DPS} for DPS\n${EMOJIS.HEALER} for HEALER\n${EMOJIS.TANK} for TANK\n${EMOJIS.FLEX} for FLEX\n${EMOJIS.ABSENT} if you can't make it\n`;
  
  // Send the new war message and react with emotes
  const reactMessage = await channel.send(messageContent);
  
  // React with role emotes
  await reactMessage.react(EMOJIS.DPS);
  await reactMessage.react(EMOJIS.HEALER);
  await reactMessage.react(EMOJIS.TANK);
  await reactMessage.react(EMOJIS.FLEX);
  await reactMessage.react(EMOJIS.ABSENT);

  console.log(`Party message created: ${reactMessage.id}`);
  return reactMessage;
}


// Format the party display dynamically based on non-empty parties
function formatPartyDisplay() {
  let displayText = '**Current Party Structure:**';

  parties.forEach((party, index) => {
    if (party.TANK.length > 0 || party.DPS.length > 0 || party.HEALER.length > 0) {
      displayText += `\nParty ${index + 1}:\n`;
      displayText += `TANK: ${party.TANK.length > 0 ? party.TANK.map(id => `<@${id}>`).join(', ') : 'None'}\n`;
      displayText += `DPS: ${party.DPS.length > 0 ? party.DPS.map(id => `<@${id}>`).join(', ') : 'None'}\n`;
      displayText += `HEALER: ${party.HEALER.length > 0 ? party.HEALER.map(id => `<@${id}>`).join(', ') : 'None'}`;
    }
  });

  displayText += `\n\nFlex Party:\n${flexParty.length > 0 ? flexParty.map(id => `<@${id}>`).join(', ') : 'None\n'}`;
  displayText += `\nAbsent Members:\n${absentList.length > 0 ? absentList.map(id => `<@${id}>`).join(', ') : 'None\n'}`;
  displayText += '\n';

  return displayText;
}


// Helper function to fetch user mentions by their IDs
async function getUserMentions(userIds) {
  const mentions = await Promise.all(
    userIds.map(async (userId) => {
      try {
        const user = await client.users.fetch(userId); // Fetch the user object
        return user ? `<@${user.id}>` : 'Unknown User'; // Return the mention
      } catch (err) {
        console.error('Error fetching user:', err);
        return 'Unknown User'; // Fallback in case of error
      }
    })
  );
  return mentions.join(', ') || 'None'; // Join mentions or return 'None' if empty
}

// Interaction handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === 'war') {
    const guildName = interaction.options.getString('guild');
    const warTime = interaction.options.getString('time');

    if (!guildName || !warTime) {
        return await interaction.reply({
            content: 'Please provide both guild name and war time!',
            ephemeral: true,
        });
    }

    try {
        parties = Array.from({ length: MAX_PARTIES }, () => ({ TANK: [], DPS: [], HEALER: [] }));
        flexParty.length = 0;
        absentList.length = 0;

        await interaction.deferReply({ ephemeral: true });

        await createPartyMessage(interaction.channel, guildName, warTime);

        await interaction.editReply({
            content: `Party message created for the war against ${guildName}!`,
        });
    } catch (error) {
        console.error('Error in /war command:', error);

        await interaction.editReply({
            content: 'An error occurred while creating the party message.',
        });
    }
  }
});

// Reaction event handler
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  const message = reaction.message;
  if (!Object.values(EMOJIS).includes(reaction.emoji.name)) return;

  for (const emoji of Object.values(EMOJIS)) {
    if (emoji !== reaction.emoji.name) {
      const otherReaction = message.reactions.cache.get(emoji);
      if (otherReaction && otherReaction.users.cache.has(user.id)) {
        await otherReaction.users.remove(user.id);
      }
    }
  }

  if (reaction.emoji.name === EMOJIS.ABSENT) {
    if (!absentList.includes(user.id)) absentList.push(user.id);
  } else {
    const role = Object.keys(EMOJIS).find(key => EMOJIS[key] === reaction.emoji.name);
    addToParty(user.id, role);
  }

  await updatePartyDisplay();
});

// Reaction removal handler
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;

  const emoji = reaction.emoji.name;

  if (emoji === EMOJIS.ABSENT) {
    const index = absentList.indexOf(user.id);
    if (index > -1) absentList.splice(index, 1);
  } else if (emoji === EMOJIS.FLEX) {
    const flexIndex = flexParty.indexOf(user.id);
    if (flexIndex > -1) flexParty.splice(flexIndex, 1);
  } else {
    const role = Object.keys(EMOJIS).find(key => EMOJIS[key] === emoji);
    if (['TANK', 'DPS', 'HEALER'].includes(role)) {
      parties.forEach(party => {
        const roleList = party[role];
        const index = roleList.indexOf(user.id);
        if (index > -1) roleList.splice(index, 1);
      });
    }
  }

  await updatePartyDisplay();
});

// Function to update the party display message
async function updatePartyDisplay() {
  if (displayMessage) {
    await displayMessage.edit(formatPartyDisplay());
  }
}

// Login to Discord
client.login(process.env.DISCORD_BOT_TOKEN);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});
