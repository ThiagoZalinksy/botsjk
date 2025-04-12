const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, MessageType } = require('@whiskeysockets/baileys')
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

  // Evento de quando há alteração de participantes no grupo
  sock.ev.on('group-participants-update', async (notification) => {
    const { id, participants, action } = notification
    const groupName = id.split('@')[0] // Extrair o nome do grupo

    for (let participant of participants) {
      if (action === 'add') {
        // Enviar mensagem de boas-vindas ao novo membro
        const message = `Bem-vindo ao grupo, @${participant.split('@')[0]}! 🎉`
        await sock.sendMessage(id, message, MessageType.text, { contextInfo: { mentionedJid: [participant] } })
      }
    }
  })
}

iniciar()
