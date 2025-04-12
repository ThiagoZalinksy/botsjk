const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys')
const P = require('pino')

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    printQRInTerminal: true, // Mostra o QR Code no terminal
    auth: state,
    logger: P({ level: 'silent' })
  })

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    console.log(update); // Log de depuração
    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        iniciar()
      }
    } else if (connection === "open") {
      console.log("conectado com sucesso")
    }
  })

  // Lidar com novos participantes no grupo
  sock.ev.on('group-participants.update', async (update) => {
    const { groupId, participants, action } = update;

    if (action === 'add') {
      for (let participant of participants) {
        // Enviar mensagem de boas-vindas
        const welcomeMessage = `👋 Bem-vindo(a) ao grupo, @${participant.split('@')[0]}! 🎉`;

        // Criar a mensagem com botões
        const messageWithButtons = {
          text: welcomeMessage,
          footer: 'Clique abaixo para escolher uma opção',
          buttons: [
            { buttonText: { displayText: 'Menu' }, type: 1 },
            { buttonText: { displayText: 'Sobre' }, type: 1 },
            { buttonText: { displayText: 'Ajuda' }, type: 1 }
          ],
          headerType: 1  // Tipo da mensagem com botões
        };

        // Enviar mensagem com botões de menu
        await sock.sendMessage(groupId, messageWithButtons, { mentions: [participant] });
        console.log(`Mensagem de boas-vindas com botões enviada para @${participant.split('@')[0]}`);
      }
    }
  })

  // Lidar com a resposta dos botões
  sock.ev.on('message', async (message) => {
    if (message.buttonsResponseMessage) {
      const { selectedButtonId } = message.buttonsResponseMessage; // O ID do botão clicado
      const userId = message.key.remoteJid; // O número de telefone do usuário que clicou

      // A partir do botão clicado, podemos enviar uma resposta personalizada
      if (selectedButtonId === 'Menu') {
        await sock.sendMessage(userId, { text: 'Aqui está o menu:\n1. Opção A\n2. Opção B' });
      } else if (selectedButtonId === 'Sobre') {
        await sock.sendMessage(userId, { text: 'Este bot foi criado para demonstrar botões interativos no WhatsApp.' });
      } else if (selectedButtonId === 'Ajuda') {
        await sock.sendMessage(userId, { text: 'Caso precise de ajuda, entre em contato com o administrador do grupo.' });
      }
    }
  })
}

iniciar()
