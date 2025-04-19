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

let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";

if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

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

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;
    const texto = msg.message?.conversation?.toLowerCase() || "";

    if (!msg.message || !remetente.endsWith("@g.us")) return;

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

      // Registro automático
      if (
        !grupos.lavanderia.includes(remetente) &&
        nomeGrupo.includes("lavanderia")
      ) {
        grupos.lavanderia.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo da lavanderia registrado:", remetente);
      } else if (
        !grupos.encomendas.includes(remetente) &&
        nomeGrupo.includes("jk")
      ) {
        grupos.encomendas.push(remetente);
        fs.writeFileSync(caminhoGrupos, JSON.stringify(grupos, null, 2));
        console.log("📌 Grupo de encomendas registrado:", remetente);
      }

      await delay(1000); // evitar flood
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

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    const statusCode = lastDisconnect?.error?.output?.statusCode;

    if (connection === "close") {
      const shouldReconnect =
        statusCode !== DisconnectReason.loggedOut &&
        statusCode !== DisconnectReason.connectionClosed &&
        statusCode !== 428;

      console.log(
        `⚠️ Conexão encerrada. Código: ${statusCode} — Reconectar?`,
        shouldReconnect
      );

      if (
        statusCode === 428 ||
        statusCode === DisconnectReason.connectionClosed
      ) {
        console.log("🧹 Sessão pode estar corrompida. Deletando pasta auth...");
        try {
          fs.rmSync("auth", { recursive: true, force: true });
          console.log("✅ Pasta auth removida com sucesso.");
        } catch (e) {
          console.error("❌ Erro ao remover a pasta auth:", e.message);
        }
      }

      if (shouldReconnect) {
        setTimeout(() => iniciar(), 3000);
      }
    } else if (connection === "open") {
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

iniciar();

const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
