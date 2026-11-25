
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
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const SUPPORT_ROLE_ID = process.env.SUPPORT_ROLE_ID;

const ARCHIVE_CATEGORY_ID = "1575193077608480778";
const LOG_CHANNEL_ID = "1575193296299626617";

const TICKET_TYPES = {
  denuncia: {
    name: "Denúncia",
    emoji: "🚨",
    prefix: "denuncia",
    color: "#A43E42"
  },
  internos: {
    name: "Assuntos Internos",
    emoji: "📋",
    prefix: "internos",
    color: "#365C8C"
  },
  revogacoes: {
    name: "Revogações",
    emoji: "📁",
    prefix: "revogacoes",
    color: "#397451"
  }
};

// ==========================================
// COMANDO ADMINISTRATIVO
// ==========================================

const commands = [
  new SlashCommandBuilder()
    .setName("painel")
    .setDescription("Publicar o painel da Central de Atendimento")
].map(command => command.toJSON());

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

function sanitizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 75);
}

function createTopic(ticket) {
  return [
    "ticket",
    `owner=${ticket.ownerId}`,
    `type=${ticket.type}`,
    `opened=${ticket.openedAt}`,
    `opener=${encodeURIComponent(ticket.openerName)}`,
    `claimed=${ticket.claimedId || "none"}`,
    `claimer=${encodeURIComponent(ticket.claimerName || "")}`
  ].join("|");
}

function readTopic(topic) {
  if (!topic || !topic.startsWith("ticket|")) {
    return null;
  }

  const data = {};

  for (const part of topic.split("|").slice(1)) {
    const index = part.indexOf("=");

    if (index === -1) continue;

    const key = part.slice(0, index);
    const value = part.slice(index + 1);

    data[key] = value;
  }

  if (!data.owner || !data.opened || !data.type) {
    return null;
  }

  try {
    return {
      ownerId: data.owner,
      type: data.type,
      openedAt: Number(data.opened),
      openerName: decodeURIComponent(data.opener || ""),
      claimedId: data.claimed === "none" ? null : data.claimed,
      claimerName: decodeURIComponent(data.claimer || "")
    };
  } catch {
    return null;
  }
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function getStaff(interaction) {
  return interaction.guild.members.fetch(interaction.user.id);
}

async function isStaff(interaction) {
  const member = await getStaff(interaction);

  return member.roles.cache.has(SUPPORT_ROLE_ID);
}

async function findExistingTicket(guild, userId) {
  const channels = await guild.channels.fetch();

  return channels.find(channel => {
    if (!channel || channel.type !== ChannelType.GuildText) {
      return false;
    }

    const ticket = readTopic(channel.topic);

    return (
      ticket &&
      ticket.ownerId === userId &&
      channel.parentId !== ARCHIVE_CATEGORY_ID
    );
  });
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

client.once("ready", async () => {
  console.log(`Online como ${client.user.tag}`);

  try {
    const rest = new REST({ version: "10" }).setToken(TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log("Comando /painel registrado!");
  } catch (error) {
    console.error("Erro ao registrar comandos:", error);
  }
});

// ==========================================
// INTERAÇÕES
// ==========================================

client.on("interactionCreate", async interaction => {
  try {
    const guild = interaction.guild;

    if (!guild) return;

    // --------------------------------------
    // PUBLICAR PAINEL
    // --------------------------------------

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== "painel") return;

      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.reply({
          content: "Você não tem permissão para publicar o painel.",
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setColor("#17365D")
        .setTitle("🎖️ CENTRAL DE ATENDIMENTO")
        .setDescription(
          "Bem-vindo à Central de Atendimento!\n\n" +
          "Selecione abaixo o tipo de atendimento desejado.\n\n" +
          "🚨 **Denúncia**\n" +
          "Para registrar denúncias e irregularidades.\n\n" +
          "📋 **Assuntos Internos**\n" +
          "Para tratar de questões administrativas e internas.\n\n" +
          "📁 **Revogações**\n" +
          "Para solicitar análise de revogações.\n\n" +
          "📌 Selecione apenas uma opção por atendimento."
        )
        .setFooter({
          text: "Central de Atendimento • Sistema Oficial"
        });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("abrir:denuncia")
          .setLabel("Denúncia")
          .setEmoji("🚨")
          .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
          .setCustomId("abrir:internos")
          .setLabel("Assuntos Internos")
          .setEmoji("📋")
          .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
          .setCustomId("abrir:revogacoes")
          .setLabel("Revogações")
          .setEmoji("📁")
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({
        embeds: [embed],
        components: [buttons]
      });
    }

    // --------------------------------------
    // ABRIR TICKETS
    // --------------------------------------

    if (interaction.isButton()) {

      if (interaction.customId.startsWith("abrir:")) {
        const typeKey = interaction.customId.split(":")[1];
        const type = TICKET_TYPES[typeKey];

        if (!type) {
          return interaction.reply({
            content: "Tipo de atendimento inválido.",
            ephemeral: true
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const existing = await findExistingTicket(
          guild,
          interaction.user.id
        );

        if (existing) {
          return interaction.editReply({
            content: `Você já possui um atendimento aberto: ${existing}`
          });
        }

        const member = await guild.members.fetch(
          interaction.user.id
        );

        const openedAt = Date.now();

        const ticketData = {
          ownerId: interaction.user.id,
          type: typeKey,
          openedAt,
          openerName: member.displayName,
          claimedId: null,
          claimerName: ""
        };

        const channelName = sanitizeName(
          `${type.prefix}-${interaction.user.username}`
        );

        try {
          const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: CATEGORY_ID,
            topic: createTopic(ticketData),

            permissionOverwrites: [
              {
                id: guild.id,
                deny: [
                  PermissionFlagsBits.ViewChannel
                ]
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

          const embed = new EmbedBuilder()
            .setColor(type.color)
            .setTitle(`${type.emoji} ${type.name.toUpperCase()}`)
            .setDescription(
              `Olá, <@${interaction.user.id}>!\n\n` +
              `Seu atendimento de **${type.name}** foi criado.\n\n` +
              "Descreva sua solicitação e aguarde um membro da equipe.\n\n" +
              `**Responsável:** Não reivindicado\n` +
              `**Abertura:** ${formatDate(openedAt)}`
            )
            .setFooter({
              text: "Central de Atendimento"
            });

          const controls = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId("reivindicar_ticket")
              .setLabel("Reivindicar")
              .setEmoji("🙋")
              .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
              .setCustomId("renomear_ticket")
              .setLabel("Renomear")
              .setEmoji("✏️")
              .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
              .setCustomId("fechar_ticket")
              .setLabel("Fechar com motivo")
              .setEmoji("🔒")
              .setStyle(ButtonStyle.Danger)
          );

          await channel.send({
            content:
              `<@${interaction.user.id}> <@&${SUPPORT_ROLE_ID}>`,
            embeds: [embed],
            components: [controls]
          });

          return interaction.editReply({
            content: `✅ Seu atendimento foi criado: ${channel}`
          });

        } catch (error) {
          console.error("Erro ao criar ticket:", error);

          return interaction.editReply({
            content:
              "Não foi possível criar o ticket. " +
              "Verifique as permissões do bot e a categoria configurada."
          });
        }
      }

      // ------------------------------------
      // VERIFICAR SE É UM TICKET
      // ------------------------------------

      const channel = interaction.channel;
      const ticket = readTopic(channel?.topic);

      if (!ticket) {
        return interaction.reply({
          content: "Este canal não é um ticket válido.",
          ephemeral: true
        });
      }

      // ------------------------------------
      // REIVINDICAR
      // ------------------------------------

      if (interaction.customId === "reivindicar_ticket") {

        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: "Somente o cargo de atendimento pode reivindicar.",
            ephemeral: true
          });
        }

        if (ticket.claimedId) {
          return interaction.reply({
            content: `Este ticket já foi reivindicado por ${ticket.claimerName}.`,
            ephemeral: true
          });
        }

        const staff = await getStaff(interaction);

        ticket.claimedId = interaction.user.id;
        ticket.claimerName = staff.displayName;

        await channel.setTopic(createTopic(ticket));

        await channel.send({
          content:
            `🙋 **Atendimento reivindicado por ${interaction.user}**`
        });

        return interaction.reply({
          content: "✅ Você agora é o responsável pelo atendimento!",
          ephemeral: true
        });
      }

      // ------------------------------------
      // RENOMEAR
      // ------------------------------------

      if (interaction.customId === "renomear_ticket") {

        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content: "Somente o cargo de atendimento pode renomear.",
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId("renomear_modal")
          .setTitle("Renomear atendimento");

        const nameInput = new TextInputBuilder()
          .setCustomId("novo_nome")
          .setLabel("Novo nome do ticket")
          .setPlaceholder("Ex: denuncia-administrativa")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(90);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nameInput)
        );

        return interaction.showModal(modal);
      }

      // ------------------------------------
      // FECHAR COM MOTIVO
      // ------------------------------------

      if (interaction.customId === "fechar_ticket") {

        if (!(await isStaff(interaction))) {
          return interaction.reply({
            content:
              "🔒 Apenas o cargo de atendimento pode fechar este ticket.",
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId("fechar_modal")
          .setTitle("Fechar atendimento");

        const reasonInput = new TextInputBuilder()
          .setCustomId("motivo")
          .setLabel("Motivo do fechamento")
          .setPlaceholder("Informe o motivo do encerramento...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        modal.addComponents(
          new ActionRowBuilder().addComponents(reasonInput)
        );

        return interaction.showModal(modal);
      }
    }

    // --------------------------------------
    // MODAIS
    // --------------------------------------

    if (interaction.isModalSubmit()) {

      const channel = interaction.channel;
      const ticket = readTopic(channel?.topic);

      if (!ticket) {
        return interaction.reply({
          content: "Ticket não encontrado.",
          ephemeral: true
        });
      }

      if (!(await isStaff(interaction))) {
        return interaction.reply({
          content: "Você não tem autorização para esta ação.",
          ephemeral: true
        });
      }

      // ------------------------------------
      // SALVAR NOVO NOME
      // ------------------------------------

      if (interaction.customId === "renomear_modal") {

        const rawName = interaction.fields.getTextInputValue(
          "novo_nome"
        );

        const newName = sanitizeName(rawName);

        if (!newName) {
          return interaction.reply({
            content: "Informe um nome válido.",
            ephemeral: true
          });
        }

        await channel.setName(newName);

        return interaction.reply({
          content: `✅ Ticket renomeado para **${newName}**.`,
          ephemeral: true
        });
      }

      // ------------------------------------
      // FECHAR E ARQUIVAR
      // ------------------------------------

      if (interaction.customId === "fechar_modal") {

        await interaction.deferReply({ ephemeral: true });

        const reason = interaction.fields
          .getTextInputValue("motivo")
          .trim();

        if (!reason) {
          return interaction.editReply({
            content: "O motivo do fechamento é obrigatório."
          });
        }

        try {
          const archiveCategory = await guild.channels.fetch(
            ARCHIVE_CATEGORY_ID
          );

          const logChannel = await guild.channels.fetch(
            LOG_CHANNEL_ID
          );

          if (
            !archiveCategory ||
            archiveCategory.type !== ChannelType.GuildCategory
          ) {
            return interaction.editReply({
              content: "Categoria de arquivamento não encontrada."
            });
          }

          if (
            !logChannel ||
            logChannel.type !== ChannelType.GuildText
          ) {
            return interaction.editReply({
              content: "Canal de registros não encontrado."
            });
          }

          const closedAt = Date.now();

          const closer = await guild.members.fetch(
            interaction.user.id
          );

          const type = TICKET_TYPES[ticket.type];

          // MOVER PARA ARQUIVADOS
          await channel.setParent(archiveCategory.id, {
            lockPermissions: false,
            reason: "Atendimento encerrado."
          });

          // RETIRAR ACESSO DO CLIENTE
          await channel.permissionOverwrites.edit(
            ticket.ownerId,
            {
              ViewChannel: false,
              SendMessages: false
            }
          );

          // EQUIPE PODE CONSULTAR O HISTÓRICO
          await channel.permissionOverwrites.edit(
            SUPPORT_ROLE_ID,
            {
              ViewChannel: true,
              ReadMessageHistory: true,
              SendMessages: false
            }
          );

          // REGISTRO
          const logEmbed = new EmbedBuilder()
            .setColor("#17365D")
            .setTitle("📋 REGISTRO DE ATENDIMENTO")
            .setDescription(
              "Um atendimento foi encerrado e arquivado."
            )
            .addFields(
              {
                name: "🎫 Tipo de atendimento",
                value: type ? type.name : ticket.type,
                inline: true
              },
              {
                name: "📁 Canal",
                value: `#${channel.name}\nID: ${channel.id}`,
                inline: true
              },
              {
                name: "👤 Aberto por",
                value:
                  `${ticket.openerName || "Nome não registrado"}\n` +
                  `<@${ticket.ownerId}>`,
                inline: false
              },
              {
                name: "📅 Abertura",
                value: formatDate(ticket.openedAt),
                inline: true
              },
              {
                name: "🙋 Atendente responsável",
                value: ticket.claimedId
                  ? `${ticket.claimerName || "Nome não registrado"}\n<@${ticket.claimedId}>`
                  : "Não reivindicado",
                inline: false
              },
              {
                name: "🔒 Fechado por",
                value:
                  `${closer.displayName}\n<@${interaction.user.id}>`,
                inline: false
              },
              {
                name: "📅 Fechamento",
                value: formatDate(closedAt),
                inline: true
              },
              {
                name: "📝 Motivo do fechamento",
                value: reason.slice(0, 1024),
                inline: false
              }
            )
            .setFooter({
              text: "Central de Atendimento • Histórico oficial"
            })
            .setTimestamp(closedAt);

          await logChannel.send({
            embeds: [logEmbed]
          });

          await channel.send({
            content:
              `🔒 Atendimento encerrado por ${interaction.user}.\n` +
              `**Motivo:** ${reason}`
          });

          return interaction.editReply({
            content:
              "✅ Atendimento arquivado!\n" +
              "O cliente perdeu o acesso e o registro foi publicado."
          });

        } catch (error) {
          console.error("Erro ao arquivar:", error);

          return interaction.editReply({
            content:
              "Ocorreu um erro ao arquivar o ticket. " +
              "Confira as permissões do bot e os IDs configurados."
          });
        }
      }
    }

  } catch (error) {
    console.error("Erro na interação:", error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Ocorreu um erro ao executar esta ação.",
        ephemeral: true
      }).catch(() => {});
    }
  }
});

// ==========================================
// VALIDAR CONFIGURAÇÕES
// ==========================================

if (
  !TOKEN ||
  !CLIENT_ID ||
  !GUILD_ID ||
  !CATEGORY_ID ||
  !SUPPORT_ROLE_ID
) {
  throw new Error("Faltam configurações nos Secrets!"
// ==========================================
// INICIAR
// ==========================================

client.login(TOKEN);
