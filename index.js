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

let sock;
let reconectando = false;
let qrCodeAtual = null;

// 🚀 Início da função principal
async function iniciar() {
  if (sock?.ev) {
    try {
      await sock.logout();
      console.log("🧹 Sessão anterior encerrada.");
    } catch (err) {
      console.warn("⚠️ Falha ao encerrar sessão anterior:", err.message);
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" }),
    browser: ["JKBot", "Chrome", "120.0.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  // 📩 Mensagens recebidas
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

    console.log("💬 Mensagem recebida de", remetente);

    try {
      await tratarMensagemLavanderia(sock, msg);
      await tratarMensagemEncomendas(sock, msg);
    } catch (err) {
      console.error("❗ Erro ao tratar mensagem:", err.message);
      try {
        await sock.sendMessage(remetente, {
          text: "⚠️ Ocorreu um erro ao processar sua mensagem. Tente novamente."
        });
      } catch {}
    }
  });

  // 👥 Entrada e saída de membros (boas-vindas global)
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);
      const nomeGrupo = metadata.subject;
      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        if (update.action === "add") {
          // ✨ Boas-vindas personalizada
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}! Seja bem-vindo(a) ao grupo *${nomeGrupo}* 🎉\n\nDigite *menu* para acessar o sistema de lavanderia 🧺 ou *0* para acessar o sistema de encomendas 📦.`,
            mentions: [participante],
          });
          console.log(`✅ Novo integrante no grupo ${nomeGrupo}: ${numero}`);

          // Registra no SheetDB
          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [{ usuario: `@${numero}`, mensagem: `Entrou em ${nomeGrupo}`, dataHora }]
          });

        } else if (update.action === "remove") {
          // 📴 Despedida
          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${nomeGrupo}*`,
            mentions: [participante],
          });
          console.log(`ℹ️ Integrante saiu do grupo ${nomeGrupo}: ${numero}`);

          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [{ usuario: `@${numero}`, mensagem: `Saiu de ${nomeGrupo}`, dataHora }]
          });
        }
      }
    } catch (err) {
      console.error("❌ Erro no evento de participante:", err.message);
    }
  });

  // 🔄 Conexão e reconexão
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        qrCodeAtual = await QRCode.toDataURL(qr);
        console.log("📱 QR Code disponível em /qr");
      } catch (err) {
        console.error("❌ Erro ao gerar QR:", err.message);
      }
    }

    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexão encerrada (${code})`);
      if (!reconectando && code !== DisconnectReason.loggedOut) {
        reconectando = true;
        console.log("🔄 Tentando reconectar em 15s...");
        await new Promise(r => setTimeout(r, 15000));
        await iniciar();
      } else {
        qrCodeAtual = null;
        console.log("❌ Sessão finalizada. Escaneie o QR novamente.");
      }
    } else if (connection === "open") {
      reconectando = false;
      qrCodeAtual = null;
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// ▶️ Iniciar
iniciar();

// 🌐 Servidor web para status e QR
const app = express();

app.get("/", (_, res) => {
  res.send(`
    <html><head><meta charset="utf-8"/><title>Bot Status</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0;">
      <h1>🤖 WhatsApp Bot Universal</h1>
      <p>Status: <b>Rodando com sucesso!</b></p>
      <p>O bot responde automaticamente em qualquer grupo conectado.</p>
      <a href="/qr" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">📱 Ver QR Code</a>
    </body></html>
  `);
});

app.get("/qr", (_, res) => {
  if (qrCodeAtual) {
    res.send(`
      <html><body style="text-align:center;font-family:sans-serif;padding:30px;">
        <h1>📱 QR Code WhatsApp</h1>
        <img src="${qrCodeAtual}" style="border:10px solid #25D366;border-radius:10px"/>
        <p>Abra o WhatsApp → Dispositivos Conectados → Conectar um dispositivo</p>
        <a href="/">← Voltar</a>
      </body></html>
    `);
  } else {
    res.send("<h2>✅ Bot já conectado ou aguardando novo QR...</h2>");
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 Servidor web rodando na porta ${PORT}`)
);
