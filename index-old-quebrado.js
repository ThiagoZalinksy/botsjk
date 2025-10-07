const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let sock; // 🔄 conexão global
let reconectando = false;
let qrCodeAtual = null; // 📱 QR code atual para exibir na web

async function iniciar() {
  // 🔌 Finaliza instância anterior, se existir
  if (sock?.ev) {
    try {
      await sock.logout();
      console.log("🧹 Sessão anterior encerrada com sucesso.");
    } catch (e) {
      console.warn("⚠️ Falha ao encerrar sessão anterior:", e.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" }),
    browser: ["JKBot", "Chrome", "120.0.0.0"] // 🧠 navegador personalizado
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 Recebendo mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage ||
      !remetente.endsWith("@g.us")
    ) return;

    console.log("🔔 Mensagem recebida de", remetente);

    try {
      // 🔓 Agora qualquer grupo pode usar os módulos
      await tratarMensagemLavanderia(sock, msg);
      await tratarMensagemEncomendas(sock, msg);
    } catch (e) {
      console.error("❗ Erro ao tratar mensagem:", e.message);
    }
  });

  // 👥 Boas-vindas e despedida
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);

      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        if (update.action === "add") {
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}!\n\nSeja bem-vindo(a) ao grupo *${metadata.subject}* 🎉\n\nDigite *menu* para lavanderia ou *0* para encomendas.`,
            mentions: [participante],
          });
          console.log(`✅ Novo integrante no grupo ${metadata.subject}: ${numero}`);

          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [
              { usuario: `@${numero}`, mensagem: "Entrou no grupo", dataHora }
            ]
          });

        } else if (update.action === "remove") {
          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${metadata.subject}*`,
            mentions: [participante],
          });
          console.log(`ℹ️ Integrante saiu do grupo ${metadata.subject}: ${numero}`);

          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [
              { usuario: `@${numero}`, mensagem: "Saiu do grupo", dataHora }
            ]
          });
        }
      }
    } catch (err) {
      console.error("❌ Erro no evento de participante:", err.message);
    }
  });

  // 🔄 Atualização de conexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // 📱 Captura QR code para exibir na web
    if (qr) {
      try {
        qrCodeAtual = await QRCode.toDataURL(qr);
        console.log("📱 QR Code gerado! Acesse /qr para visualizar");
      } catch (err) {
        console.error("❌ Erro ao gerar QR code:", err.message);
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada. Motivo: ${statusCode}`);

      if (!reconectando && statusCode !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Tentando reconectar em 15 segundos...");
        await new Promise(resolve => setTimeout(resolve, 15000));
        await iniciar(); // 🔁 reconecta com nova sessão
      } else {
        console.log("❌ Sessão encerrada. Escaneie o QR novamente.");
        qrCodeAtual = null;
      }
    } else if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// ▶️ Inicia o bot
iniciar();

// 🌐 Servidor web para status e QR code
const app = express();

app.get("/", (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp Bot - Status</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 20px; background: #f0f0f0; }
            .container { max-width: 500px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .status { font-size: 24px; margin: 20px 0; }
            .qr-link { display: inline-block; margin: 20px 0; padding: 15px 30px; background: #25D366; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
            .qr-link:hover { background: #20b358; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🤖 WhatsApp Bot</h1>
            <div class="status">Status: Rodando com sucesso!</div>
            <p>Bot para gerenciar lavanderia e encomendas</p>
            <a href="/qr" class="qr-link">📱 Ver QR Code para Conectar</a>
            <br><br>
            <small>Desenvolvido para automatizar serviços</small>
        </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.get("/qr", (req, res) => {
  if (qrCodeAtual) {
    res.send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR Code - WhatsApp Bot</title>
      </head>
      <body style="text-align:center;font-family:Arial;padding:20px;">
          <h1>📱 QR Code WhatsApp</h1>
          <img src="${qrCodeAtual}" alt="QR Code" style="border:10px solid #25D366;border-radius:10px;" />
          <p>Abra o WhatsApp → Dispositivos Conectados → Conectar um dispositivo</p>
          <a href="/qr">🔄 Atualizar</a>
          <br><a href="/">← Voltar</a>
      </body>
      </html>
    `);
  } else {
    res.send("<h2>✅ Bot já conectado ou aguardando geração do QR code...</h2>");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
