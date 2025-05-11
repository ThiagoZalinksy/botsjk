const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" }),
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (!msg.message || !remetente.endsWith("@g.us")) return;

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase().trim();

      const gruposPermitidos = {
        "pousada jk universitário": "encomendas",
        "grupo jk teste": "encomendas",
        "lavanderia jk": "lavanderia",
        "teste lavanderia 2": "lavanderia"
      };

      const tipoGrupo = gruposPermitidos[nomeGrupo];

      if (tipoGrupo === "encomendas") {
        await tratarMensagemEncomendas(sock, msg);
      } else if (tipoGrupo === "lavanderia") {
        await tratarMensagemLavanderia(sock, msg);
      } else {
        console.log("❌ Ignorado: grupo não autorizado:", nomeGrupo);
      }
    } catch (e) {
      console.warn("❌ Erro ao obter metadados do grupo:", e.message);
    }
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
      const chats = await sock.groupFetchAllParticipating();
      console.log("📋 Lista de grupos:");
      Object.values(chats).forEach((grupo) => {
        console.log(`📌 Nome: ${grupo.subject} | JID: ${grupo.id}`);
      });
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log("⚠️ Conexão encerrada. Motivo:", reason);

      if (reason !== DisconnectReason.loggedOut) {
        console.log("🔄 Tentando reconectar...");
        iniciar(); // Recurse para reconectar
      } else {
        console.log("🔒 Sessão expirada. Exclua a pasta 'auth' e escaneie o QR novamente.");
      }
    }
  });

  return sock;
}

iniciar();

// Web server para manter Render ativo
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
