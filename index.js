const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");
const moment = require("moment-timezone");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

// ✅ Lista de grupos permitidos por tipo
const nomesGruposPermitidos = {
  lavanderia: ["lavanderia jk", "teste lavanderia 2"],
  encomendas: ["pousada jk universitário", "grupo jk teste"],
};

let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

// ✅ Carrega grupos salvos (grupos.json)
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

// 🔁 Delay para evitar flood (rate limit)
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
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

  // 📩 Recebe mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;
    const texto = msg.message?.conversation?.toLowerCase() || "";

    if (!msg.message || !remetente.endsWith("@g.us")) return;

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      // ✅ Verifica e registra grupo da lavanderia
      if (
        nomesGruposPermitidos.lavanderia.includes(nomeGrupo) &&
        !grupos.lavanderia.includes(remetente)
      ) {
        grupos.lavanderia.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo da lavanderia registrado:", remetente);
      }

      // ✅ Verifica e registra grupo de encomendas
      if (
        nomesGruposPermitidos.encomendas.includes(nomeGrupo) &&
        !grupos.encomendas.includes(remetente)
      ) {
        grupos.encomendas.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo de encomendas registrado:", remetente);
      }

      await delay(1000); // 🕒 Prevê excesso de mensagens

      if (grupos.lavanderia.includes(remetente)) {
        await tratarMensagemLavanderia(sock, msg);
      } else if (grupos.encomendas.includes(remetente)) {
        await tratarMensagemEncomendas(sock, msg);
      } else {
        console.log("🔍 Mensagem de grupo não registrado:", remetente);
      }
    } catch (err) {
      console.error("❌ Erro ao processar mensagem:", err.message);
    }
  });

  // 🔄 Reconexão automática segura
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    if (connection === "close") {
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(
        `⚠️ Conexão encerrada. Código: ${statusCode} — Reconectar?`,
        shouldReconnect
      );

      if (shouldReconnect) {
        console.log("♻️ Reiniciando processo para reconectar...");
        process.exit(); // 🔄 Render reinicia automaticamente
      } else {
        console.log("🚪 Sessão encerrada manualmente. Não reconectará.");
      }
    } else if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// 🚀 Inicializa o bot
iniciar();

// 🌐 Servidor web da Render (apenas para manter serviço ativo)
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
