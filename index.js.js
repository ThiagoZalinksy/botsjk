
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let grupos = { lavanderia: [], encomendas: [] };

// Carrega grupos previamente registrados

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
      const nomeGrupo = metadata.subject.toLowerCase();
      const nomeNormalizado = nomeGrupo.trim().toLowerCase();

      const gruposPermitidos = {
        "pousada jk universitário": "encomendas",
        "grupo jk teste": "encomendas",
        "lavanderia jk": "lavanderia",
        "teste lavanderia 2": "lavanderia"
      };

      const tipoGrupo = gruposPermitidos[nomeNormalizado];

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

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

iniciar();

// Web server para Render
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
