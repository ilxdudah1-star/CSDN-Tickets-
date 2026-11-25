
const fs = require('node:fs');
const path = require('node:path');

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

// CONFIGURAÇÕES

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const CATEGORY_IDS = {
  denuncia: process.env.CATEGORY_DENUNCIA_ID,
  internos: process.env.CATEGORY_INTERNOS_ID,
  revogacoes: process.env.CATEGORY_REVOGACOES_ID
};

const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');

const TICKET_TYPES = {
  denuncia: {
    name: 'Denúncia',
    emoji: '🚨',
    color: 0xA43E42,
    categoryId: CATEGORY_IDS.denuncia
  },
  internos: {
    name: 'Assuntos internos',
    emoji: '📋',
    color: 0x365C8C,
    categoryId: CATEGORY_IDS.internos
  },
  revogacoes: {
    name: 'Revogações',
    emoji: '📁',
    color: 0x397451,
    categoryId: CATEGORY_IDS.revogacoes
  }
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// CONTROLE DE ABERTURAS SIMULTÂNEAS

const openingUsers = new Set();
