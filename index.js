// Importações principais do Baileys e bibliotecas auxiliares
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

// 🔁 Carregamento inicial dos grupos a partir do arquivo JSON
let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

// ⏳ Função utilitária para evitar flood
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// 🚀 Função principal de inicialização do bot
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

  // 🎯 Trata cada nova mensagem recebida
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;
    const texto = msg.message?.conversation?.toLowerCase() || "";

    // Ignora mensagens fora de grupos
    if (!msg.message || !remetente.endsWith("@g.us")) return;

    try {
      // 🔍 Recupera metadados do grupo
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      // 🧺 Registra grupos de lavanderia (nome contém "lavanderia")
      if (
        !grupos.lavanderia.includes(remetente) &&
        nomeGrupo.includes("lavanderia")
      ) {
        grupos.lavanderia.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo da lavanderia registrado:", remetente);
      }

      // 📦 Registra grupos de encomendas (nome contém "pousada" ou "teste")
      else if (
        !grupos.encomendas.includes(remetente) &&
        (nomeGrupo.includes("pousada") || nomeGrupo.includes("teste"))
      ) {
        grupos.encomendas.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo de encomendas registrado:", remetente);
      }

      // ⏳ Delay para evitar limite de envio
      await delay(1000);

      // ✅ Redirecionamento para o módulo correto conforme o grupo
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

  // 🔄 Lida com eventos de conexão
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
        setTimeout(() => iniciar(), 3000); // ⏱️ Reconecta após 3 segundos
      }
    } else if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// 🌐 Inicializa servidor web (exigência do Render)
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});

// 🔄 Inicia o bot
iniciar();
