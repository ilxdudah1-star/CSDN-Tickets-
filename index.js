
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

// =====================================================
// CONFIGURAÇÕES
// =====================================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tickets.json');

const TICKET_TYPES = {
  denuncia: {
    name: 'Denúncia',
    emoji: '🚨',
    prefix: 'denuncia',
    color: 0xA43E42
  },
  internos: {
    name: 'Assuntos internos',
    emoji: '📋',
    prefix: 'internos',
    color: 0x365C8C
  },
  revogacoes: {
    name: 'Revogações',
    emoji: '📁',
    prefix: 'revogacoes',
    color: 0x397451
  }
};

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// =====================================================
// BANCO DE DADOS
// =====================================================

function loadDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const initial = {
      nextNumber: 1,
      tickets: {}
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    if (!parsed.tickets || typeof parsed.tickets !== 'object') {
      parsed.tickets = {};
    }

    if (!Number.isInteger(parsed.nextNumber) || parsed.nextNumber < 1) {
      const nums = Object.values(parsed.tickets).map(t => Number(t.number) || 0);
      parsed.nextNumber = Math.max(0, ...nums) + 1;
    }

    return parsed;
  } catch (error) {
    console.error('Erro ao ler tickets.json:', error);
    throw new Error('O arquivo data/tickets.json está inválido.');
  }
}

let db = loadDatabase();

function saveDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const tempFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2));
  fs.renameSync(tempFile, DATA_FILE);
}

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ticketNumber(number) {
  return `#${String(number).padStart(3, '0')}`;
}

function cleanChannelName(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 85) || 'atendimento';
}

function countWords(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function getTicketByChannel(channelId) {
  return Object.values(db.tickets).find(
    t => t.channelId === channelId && t.status === 'open'
  );
}

async function isStaff(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id);

  return (
    member.roles.cache.has(SUPPORT_ROLE_ID) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

async function requireTicketStaff(interaction) {
  const ticket = getTicketByChannel(interaction.channelId);

  if (!ticket) {
    await interaction.reply({
      content: 'Este comando só pode ser usado dentro de um ticket aberto.',
      ephemeral: true
    });

    return null;
  }

  if (!(await isStaff(interaction))) {
    await interaction.reply({
      content: 'Você não tem autorização para administrar este ticket.',
      ephemeral: true
    });

    return null;
  }

  return ticket;
}

// =====================================================
// COMANDOS
// =====================================================

const commands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publicar o painel da Central de Atendimento'),

  new SlashCommandBuilder()
    .setName('add')
    .setDescription('Adicionar cargo ou usuário somente a este ticket')
    .addRoleOption(o =>
      o.setName('cargo')
        .setDescription('Cargo que terá acesso')
        .setRequired(false)
    )
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('Usuário que terá acesso')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remover cargo ou usuário somente deste ticket')
    .addRoleOption(o =>
      o.setName('cargo')
        .setDescription('Cargo que perderá acesso')
        .setRequired(false)
    )
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('Usuário que perderá acesso')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('listar')
    .setDescription('Listar quem tem acesso a este ticket'),

  new SlashCommandBuilder()
    .setName('buscar-ticket')
    .setDescription('Consultar um ticket pelo número')
    .addIntegerOption(o =>
      o.setName('numero')
        .setDescription('Número do ticket, sem #')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('buscar-fechamentos')
    .setDescription('Consultar tickets fechados por um usuário')
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('Responsável pelo fechamento')
        .setRequired(true)
    )
].map(command => command.toJSON());

// =====================================================
// REGISTRO DOS COMANDOS
// =====================================================

client.once('ready', async () => {
  console.log(`Online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('Comandos registrados com sucesso.');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// =====================================================
// INTERAÇÕES
// =====================================================

client.on('interactionCreate', async interaction => {
  try {
    if (!interaction.guild) return;

    // =========================================
    // COMANDOS
    // =========================================

    if (interaction.isChatInputCommand()) {
      const command = interaction.commandName;

      // PAINEL

      if (command === 'painel') {
        if (!interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )) {
          return interaction.reply({
            content: 'Você não tem permissão para publicar o painel.',
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0x17365D)
          .setTitle('🎖️ CENTRAL DE ATENDIMENTO')
          .setDescription(
            'Bem-vindo à Central de Atendimento!\n\n' +
            'Selecione abaixo o tipo de atendimento desejado.\n\n' +
            '🚨 **Denúncia**\n' +
            'Para registrar denúncias e irregularidades.\n\n' +
            '📋 **Assuntos Internos**\n' +
            'Para questões administrativas e internas.\n\n' +
            '📁 **Revogações**\n' +
            'Para solicitar análise de revogações.\n\n' +
            '📌 Selecione apenas uma opção por atendimento.'
          )
          .setFooter({
            text: 'Central de Atendimento • Sistema Oficial'
          });

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('abrir:denuncia')
            .setLabel('Denúncia')
            .setEmoji('🚨')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId('abrir:internos')
            .setLabel('Assuntos Internos')
            .setEmoji('📋')
            .setStyle(ButtonStyle.Primary),

          new ButtonBuilder()
            .setCustomId('abrir:revogacoes')
            .setLabel('Revogações')
            .setEmoji('📁')
            .setStyle(ButtonStyle.Success)
        );

        return interaction.reply({
          embeds: [embed],
          components: [row]
        });
      }

      // BUSCAR TICKET

      if (command === 'buscar-ticket') {
        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: 'Somente a equipe autorizada pode consultar o histórico.',
            ephemeral: true
          });
        }

        const number = interaction.options.getInteger('numero');
        const ticket = db.tickets[String(number)];

        if (!ticket) {
          return interaction.reply({
            content: `Não encontrei o ticket ${ticketNumber(number)}.`,
            ephemeral: true
          });
        }

        const embed = new EmbedBuilder()
          .setColor(0x17365D)
          .setTitle(`📁 Histórico do ticket ${ticketNumber(number)}`)
          .addFields(
            {
              name: 'Situação',
              value: ticket.status === 'closed' ? 'Fechado' : 'Aberto',
              inline: true
            },
            {
              name: 'Tipo',
              value: TICKET_TYPES[ticket.type]?.name || ticket.type,
              inline: true
            },
            {
              name: 'Quem abriu',
              value: `${ticket.openerName || 'Não registrado'}\nID: ${ticket.ownerId}`
            },
            {
              name: 'Nick(s) informado(s)',
              value: (ticket.involvedNicks || 'Não informado').slice(0, 1024)
            },
            {
              name: 'Resumo inicial',
              value: (ticket.summary || 'Não informado').slice(0, 1024)
            },
            {
              name: 'Quem reivindicou',
              value: ticket.claimedId
                ? `${ticket.claimerName || 'Não registrado'}\nID: ${ticket.claimedId}`
                : 'Não reivindicado',
              inline: true
            },
            {
              name: 'Quem fechou',
              value: ticket.closerId
                ? `${ticket.closerName || 'Não registrado'}\nID: ${ticket.closerId}`
                : 'Ainda aberto',
              inline: true
            },
            {
              name: 'Motivo do fechamento',
              value: (ticket.closeReason || 'Ainda não fechado').slice(0, 1024)
            },
            {
              name: 'Data e horário',
              value: ticket.closedAt
                ? formatDate(ticket.closedAt)
                : formatDate(ticket.openedAt),
              inline: true
            },
            {
              name: 'Canal',
              value: ticket.channelId ? `<#${ticket.channelId}>` : 'Canal indisponível',
              inline: true
            }
          )
          .setFooter({
            text: 'Central de Atendimento • Consulta interna'
          });

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // BUSCAR FECHAMENTOS

      if (command === 'buscar-fechamentos') {
        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: 'Somente a equipe autorizada pode consultar o histórico.',
            ephemeral: true
          });
        }

        const user = interaction.options.getUser('usuario');

        const closed = Object.values(db.tickets)
          .filter(t => t.status === 'closed' && t.closerId === user.id)
          .sort((a, b) => (b.closedAt || 0) - (a.closedAt || 0));

        if (!closed.length) {
          return interaction.reply({
            content: `Não encontrei fechamentos registrados para <@${user.id}>.`,
            ephemeral: true
          });
        }

        const lines = closed.slice(0, 20).map(t =>
          `**${ticketNumber(t.number)}** • ` +
          `${TICKET_TYPES[t.type]?.name || t.type} • ` +
          `${formatDate(t.closedAt)} • ${t.closeReason || 'Sem motivo'}`
        );

        const embed = new EmbedBuilder()
          .setColor(0x17365D)
          .setTitle(`📋 Fechamentos de ${user.tag}`)
          .setDescription(lines.join('\n').slice(0, 4000))
          .setFooter({
            text: `${closed.length} registro(s) encontrado(s). Exibindo até 20.`
          });

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      // ADD / REMOVE / LISTAR

      if (['add', 'remove', 'listar'].includes(command)) {
        const ticket = await requireTicketStaff(interaction);
        if (!ticket) return;

        const channel = interaction.channel;

        if (command === 'listar') {
          const roles = (ticket.allowedRoleIds || []).map(id => `<@&${id}>`);
          const users = (ticket.allowedUserIds || []).map(id => `<@${id}>`);

          return interaction.reply({
            content:
              `**Acessos adicionais deste ticket:**\n` +
              `**Cargos:** ${roles.length ? roles.join(', ') : 'Nenhum'}\n` +
              `**Usuários:** ${users.length ? users.join(', ') : 'Nenhum'}\n\n` +
              'O autor e o cargo de atendimento também possuem acesso.',
            ephemeral: true
          });
        }

        const role = interaction.options.getRole('cargo');
        const user = interaction.options.getUser('usuario');

        if ((!role && !user) || (role && user)) {
          return interaction.reply({
            content: 'Informe apenas uma opção: cargo ou usuário.',
            ephemeral: true
          });
        }

        const listKey = role ? 'allowedRoleIds' : 'allowedUserIds';
        const targetId = role ? role.id : user.id;

        ticket[listKey] ||= [];

        if (command === 'add') {
          if (ticket[listKey].includes(targetId)) {
            return interaction.reply({
              content: 'Esse acesso já está configurado neste ticket.',
              ephemeral: true
            });
          }

          ticket[listKey].push(targetId);

          await channel.permissionOverwrites.edit(targetId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });

          saveDatabase();

          return interaction.reply({
            content: `✅ ${role ? `O cargo ${role}` : user} agora tem acesso somente a este ticket.`,
            ephemeral: true
          });
        }

        if (!ticket[listKey].includes(targetId)) {
          return interaction.reply({
            content: 'Esse cargo/usuário não está na lista de acessos adicionais deste ticket.',
            ephemeral: true
          });
        }

        ticket[listKey] = ticket[listKey].filter(id => id !== targetId);

        await channel.permissionOverwrites.delete(targetId).catch(() => {});

        saveDatabase();

        return interaction.reply({
          content: `✅ Acesso de ${role || user} removido deste ticket.`,
          ephemeral: true
        });
      }
    }

    // =========================================
    // BOTÕES
    // =========================================

    if (interaction.isButton()) {

      // ABRIR TICKET

      if (interaction.customId.startsWith('abrir:')) {
        const typeKey = interaction.customId.split(':')[1];

        if (!TICKET_TYPES[typeKey]) {
          return interaction.reply({
            content: 'Tipo de atendimento inválido.',
            ephemeral: true
          });
        }

        const existing = Object.values(db.tickets).find(
          t => t.ownerId === interaction.user.id && t.status === 'open'
        );

        if (existing) {
          return interaction.reply({
            content: `Você já possui um atendimento aberto: <#${existing.channelId}>.`,
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`abrir_modal:${typeKey}`)
          .setTitle(`Novo atendimento • ${TICKET_TYPES[typeKey].name}`);

        const nicks = new TextInputBuilder()
          .setCustomId('nicks')
          .setLabel('Nick(s) dos indivíduos envolvidos')
          .setPlaceholder('Informe os nicks. Se não houver, escreva "Não se aplica".')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        const summary = new TextInputBuilder()
          .setCustomId('resumo')
          .setLabel('Resumo do que deseja resolver (até 170 palavras)')
          .setPlaceholder('Explique brevemente o assunto do atendimento...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nicks),
          new ActionRowBuilder().addComponents(summary)
        );

        return interaction.showModal(modal);
      }

      const ticket = getTicketByChannel(interaction.channelId);

      if (!ticket) {
        return interaction.reply({
          content: 'Este canal não é um ticket aberto.',
          ephemeral: true
        });
      }

      // REIVINDICAR

      if (interaction.customId === 'reivindicar_ticket') {
        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: 'Somente a equipe de atendimento pode reivindicar.',
            ephemeral: true
          });
        }

        if (ticket.claimedId) {
          return interaction.reply({
            content: `Este ticket já foi reivindicado por <@${ticket.claimedId}>.`,
            ephemeral: true
          });
        }

        const member = await interaction.guild.members.fetch(interaction.user.id);

        ticket.claimedId = interaction.user.id;
        ticket.claimerName = member.displayName;

        saveDatabase();

        await interaction.channel.send({
          content: `🙋 Atendimento reivindicado por ${interaction.user}.`
        });

        return interaction.reply({
          content: '✅ Você agora é o responsável pelo atendimento!',
          ephemeral: true
        });
      }

      // FECHAR TICKET

      if (interaction.customId === 'fechar_ticket') {
        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: 'Apenas a equipe de atendimento pode fechar este ticket.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('fechar_modal')
          .setTitle('Fechar atendimento');

        const reason = new TextInputBuilder()
          .setCustomId('motivo')
          .setLabel('Motivo do fechamento')
          .setPlaceholder('Informe o motivo do encerramento...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(reason)
        );

        return interaction.showModal(modal);
      }
    }

    // =========================================
    // FORMULÁRIOS
    // =========================================

    if (interaction.isModalSubmit()) {

      // FORMULÁRIO DE ABERTURA

      if (interaction.customId.startsWith('abrir_modal:')) {
        await interaction.deferReply({ ephemeral: true });

        const typeKey = interaction.customId.split(':')[1];
        const type = TICKET_TYPES[typeKey];

        if (!type) {
          return interaction.editReply({
            content: 'Tipo de atendimento inválido.'
          });
        }

        const existing = Object.values(db.tickets).find(
          t => t.ownerId === interaction.user.id && t.status === 'open'
        );

        if (existing) {
          return interaction.editReply({
            content: `Você já possui um atendimento aberto: <#${existing.channelId}>.`
          });
        }

        const involvedNicks = interaction.fields.getTextInputValue('nicks').trim();
        const summary = interaction.fields.getTextInputValue('resumo').trim();
        const words = countWords(summary);

        if (!involvedNicks || !summary) {
          return interaction.editReply({
            content: 'Preencha os dois campos do formulário.'
          });
        }

        if (words > 170) {
          return interaction.editReply({
            content: `O resumo tem ${words} palavras. O limite é de 170. Envie novamente pelo painel.`
          });
        }

        const number = db.nextNumber++;
        const openedAt = Date.now();

        const member = await interaction.guild.members.fetch(interaction.user.id);

        const record = {
          number,
          channelId: null,
          ownerId: interaction.user.id,
          openerName: member.displayName,
          type: typeKey,
          involvedNicks,
          summary,
          openedAt,
          status: 'open',
          claimedId: null,
          claimerName: null,
          closerId: null,
          closerName: null,
          closeReason: null,
          closedAt: null,
          allowedRoleIds: [],
          allowedUserIds: []
        };

        db.tickets[String(number)] = record;
        saveDatabase();

        try {
          const channel = await interaction.guild.channels.create({
            name: cleanChannelName(
              `${String(number).padStart(3, '0')}-${type.prefix}-${interaction.user.username}`
            ),
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            topic: `Central de Atendimento | Ticket ${ticketNumber(number)} | Autor ${interaction.user.id}`,

            permissionOverwrites: [
              {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
              },
              {
                id: interaction.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              },
              {
                id: SUPPORT_ROLE_ID,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory
                ]
              },
              {
                id: client.user.id,
                allow: [
                  PermissionFlagsBits.ViewChannel,
                  PermissionFlagsBits.SendMessages,
                  PermissionFlagsBits.ReadMessageHistory,
                  PermissionFlagsBits.ManageChannels
                ]
              }
            ]
          });

          record.channelId = channel.id;
          saveDatabase();

          const embed = new EmbedBuilder()
            .setColor(type.color)
            .setTitle(`${type.emoji} ${type.name.toUpperCase()} • ${ticketNumber(number)}`)
            .setDescription(
              `Olá, <@${interaction.user.id}>! Seu atendimento foi criado. A equipe responderá assim que possível.`
            )
            .addFields(
              {
                name: '👤 Quem abriu',
                value: `${member.displayName}\n<@${interaction.user.id}>`,
                inline: true
              },
              {
                name: '📌 Nick(s) dos envolvidos',
                value: involvedNicks.slice(0, 1024)
              },
              {
                name: '📝 Resumo da solicitação',
                value: summary.slice(0, 1024)
              },
              {
                name: '🙋 Responsável',
                value: 'Não reivindicado',
                inline: true
              },
              {
                name: '📅 Abertura',
                value: formatDate(openedAt),
                inline: true
              }
            )
            .setFooter({
              text: 'Central de Atendimento • Sistema Oficial'
            });

          const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('reivindicar_ticket')
              .setLabel('Reivindicar')
              .setEmoji('🙋')
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId('fechar_ticket')
              .setLabel('Fechar com motivo')
              .setEmoji('🔒')
              .setStyle(ButtonStyle.Danger)
          );

          await channel.send({
            content: `<@${interaction.user.id}> <@&${SUPPORT_ROLE_ID}>`,
            embeds: [embed],
            components: [controls]
          });

          return interaction.editReply({
            content: `✅ Seu atendimento ${ticketNumber(number)} foi criado: ${channel}`
          });

        } catch (error) {
          console.error('Erro ao criar ticket:', error);

          delete db.tickets[String(number)];
          db.nextNumber = Math.min(db.nextNumber, number);
          saveDatabase();

          return interaction.editReply({
            content: 'Não foi possível criar o ticket. Confira os IDs e as permissões do bot.'
          });
        }
      }

      // FORMULÁRIO DE FECHAMENTO

      if (interaction.customId === 'fechar_modal') {
        const ticket = getTicketByChannel(interaction.channelId);

        if (!ticket) {
          return interaction.reply({
            content: 'Ticket não encontrado ou já fechado.',
            ephemeral: true
          });
        }

        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: 'Você não tem autorização para fechar este ticket.',
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const reason = interaction.fields.getTextInputValue('motivo').trim();

        if (!reason) {
          return interaction.editReply({
            content: 'O motivo do fechamento é obrigatório.'
          });
        }

        try {
          const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);

          if (!logChannel || logChannel.type !== ChannelType.GuildText) {
            return interaction.editReply({
              content: 'Canal de relatórios não encontrado. Confira LOG_CHANNEL_ID.'
            });
          }

          const closer = await interaction.guild.members.fetch(interaction.user.id);
          const closedAt = Date.now();

          // O canal permanece na categoria atual.
          // O autor perde acesso e a equipe mantém consulta.

          await interaction.channel.permissionOverwrites.edit(ticket.ownerId, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
          });

          await interaction.channel.permissionOverwrites.edit(SUPPORT_ROLE_ID, {
            ViewChannel: true,
            ReadMessageHistory: true,
            SendMessages: false
          });

          for (const id of [
            ...(ticket.allowedRoleIds || []),
            ...(ticket.allowedUserIds || [])
          ]) {
            await interaction.channel.permissionOverwrites.edit(id, {
              ViewChannel: true,
              ReadMessageHistory: true,
              SendMessages: false
            }).catch(() => {});
          }

          ticket.status = 'closed';
          ticket.closerId = interaction.user.id;
          ticket.closerName = closer.displayName;
          ticket.closeReason = reason;
          ticket.closedAt = closedAt;

          saveDatabase();

          // RELATÓRIO RESUMIDO

          const report = new EmbedBuilder()
            .setColor(0x17365D)
            .setTitle(`📋 RELATÓRIO DE ATENDIMENTO • ${ticketNumber(ticket.number)}`)
            .addFields(
              {
                name: '📝 Motivo do fechamento',
                value: reason.slice(0, 1024)
              },
              {
                name: '👤 Quem abriu',
                value:
                  `${ticket.openerName || 'Não registrado'}\n` +
                  `<@${ticket.ownerId}> | ID: ${ticket.ownerId}`
              },
              {
                name: '🙋 Quem reivindicou',
                value: ticket.claimedId
                  ? `${ticket.claimerName || 'Não registrado'}\n<@${ticket.claimedId}> | ID: ${ticket.claimedId}`
                  : 'Não reivindicado'
              },
              {
                name: '🔒 Quem fechou',
                value:
                  `${closer.displayName}\n` +
                  `<@${interaction.user.id}> | ID: ${interaction.user.id}`
              },
              {
                name: '📅 Data e horário do fechamento',
                value: formatDate(closedAt)
              }
            )
            .setFooter({
              text: `Central de Atendimento • ${ticketNumber(ticket.number)} • Canal ${interaction.channelId}`
            });

          await logChannel.send({
            embeds: [report]
          });

          await interaction.channel.send({
            content:
              `🔒 ${ticketNumber(ticket.number)} encerrado por ${interaction.user}. ` +
              'O acesso do solicitante foi removido.'
          });

          return interaction.editReply({
            content:
              `✅ ${ticketNumber(ticket.number)} fechado. ` +
              'O canal permaneceu na categoria atual e o relatório resumido foi enviado.'
          });

        } catch (error) {
          console.error('Erro ao fechar ticket:', error);

          return interaction.editReply({
            content: 'Ocorreu um erro ao fechar o ticket. Confira as permissões do bot e o canal de relatórios.'
          });
        }
      }
    }

  } catch (error) {
    console.error('Erro na interação:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocorreu um erro ao executar esta ação.',
        ephemeral: true
      }).catch(() => {});
    } else if (interaction.deferred) {
      await interaction.editReply({
        content: 'Ocorreu um erro ao executar esta ação.'
      }).catch(() => {});
    }
  }
});

// =====================================================
// VALIDAR CONFIGURAÇÕES
// =====================================================

const required = {
  DISCORD_TOKEN: TOKEN,
  CLIENT_ID,
  GUILD_ID,
  CATEGORY_ID,
  LOG_CHANNEL_ID,
  SUPPORT_ROLE_ID
};

const missing = Object.entries(required)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  throw new Error(`Faltam configurações nos Secrets: ${missing.join(', ')}`);
}

// =====================================================
// INICIAR BOT
// =====================================================

client.login(TOKEN);
