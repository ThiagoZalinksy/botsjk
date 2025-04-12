const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, proto } = require('@whiskeysockets/baileys')
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

  // Evento para monitorar mudanças de participantes no grupo
  sock.ev.on('group-participants.update', async (update) => {
    const { groupId, participants, action } = update
    console.log('Ação de grupo detectada:', action, 'para os participantes:', participants, 'no grupo:', groupId)

    // Se alguém foi adicionado ao grupo (ação "add")
    if (action === 'add') {
      for (let participant of participants) {
        // Enviar mensagem de boas-vindas
        const welcomeMessage = `👋 Bem-vindo(a) ao grupo, @${participant.split('@')[0]}! 🎉`
        
        // Definir os botões do menu
        const buttons = [
          { buttonText: { displayText: 'Menu' }, type: 1 },
          { buttonText: { displayText: 'Sobre' }, type: 1 },
          { buttonText: { displayText: 'Ajuda' }, type: 1 },
        ]

        // Enviar mensagem com botões
        const message = {
          text: welcomeMessage,
          buttons: buttons,
          headerType: 1,
        }
        
        await sock.sendMessage(groupId, message, { mentions: [participant] })
        console.log(`Mensagem de boas-vindas enviada para @${participant.split('@')[0]}`)
      }
    }
  })

  // Lidar com botões interativos
  sock.ev.on('message', async (message) => {
    if (message.buttonsResponseMessage) {
      const { selectedButtonId } = message.buttonsResponseMessage
      const userId = message.key.remoteJid

      if (selectedButtonId === 'Menu') {
        await sock.sendMessage(userId, { text: 'Aqui estão as opções do Menu:\n1. Opção A\n2. Opção B' })
      } else if (selectedButtonId === 'Sobre') {
        await sock.sendMessage(userId, { text: 'Este é um bot de exemplo para demonstrar botões no WhatsApp.' })
      } else if (selectedButtonId === 'Ajuda') {
        await sock.sendMessage(userId, { text: 'Para obter ajuda, entre em contato com o administrador do grupo.' })
      }
    }
  })
}

iniciar()
