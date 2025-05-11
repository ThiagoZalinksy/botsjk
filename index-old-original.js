const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

// Carrega grupos previamente registrados
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

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

    // Ignora mensagens inválidas
    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage ||
      !remetente.endsWith("@g.us")
    ) return;

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      // Registro automático
      if (
        nomeGrupo.includes("lavanderia") &&
        !grupos.lavanderia.includes(remetente) &&
        !grupos.encomendas.includes(remetente)
      ) {
        grupos.lavanderia.push(remetente);
        console.log("📌 Grupo de lavanderia registrado:", remetente);
      } else if (
        nomeGrupo.includes("jk") &&
        !grupos.encomendas.includes(remetente) &&
        !grupos.lavanderia.includes(remetente)
      ) {
        grupos.encomendas.push(remetente);
        console.log("📌 Grupo de encomendas registrado:", remetente);
      }

      fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
    } catch (e) {
      console.warn("❌ Erro ao obter metadados do grupo:", e.message);
    }

    console.log("🔔 Mensagem recebida de", remetente);

    try {
      if (grupos.lavanderia.includes(remetente)) {
        console.log("💧 Chamando tratarMensagemLavanderia");
        await tratarMensagemLavanderia(sock, msg);
      } else if (grupos.encomendas.includes(remetente)) {
        console.log("📦 Chamando tratarMensagemEncomendas");
        await tratarMensagemEncomendas(sock, msg);
      } else {
        console.log("🔍 Mensagem de grupo não registrado:", remetente);
      }
    } catch (e) {
      console.error("❗ Erro ao tratar mensagem:", e.message);
    }
  });

  sock.ev.on("connection.update", ({ connection }) => {
    if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    } else if (connection === "close") {
      console.log("⚠️ Conexão encerrada. Reconectando...");
      iniciar(); // reconectar automaticamente
    }
  });
}

iniciar();

// Web server para manter o Render vivo
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
