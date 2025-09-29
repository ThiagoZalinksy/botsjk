const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");
const express = require("express");
const axios = require("axios");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let sock; // 🔄 conexão global
let grupos = { lavanderia: [], encomendas: [] };
const caminhoGrupos = "grupos.json";
let reconectando = false;

// Carrega grupos registrados
if (fs.existsSync(caminhoGrupos)) {
  grupos = JSON.parse(fs.readFileSync(caminhoGrupos, "utf-8"));
  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);
}

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

    try {
      const metadata = await sock.groupMetadata(remetente);
      const nomeGrupo = metadata.subject.toLowerCase();

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

  // 🔔 Detecta entrada/saída de participantes no grupo
  sock.ev.on("group-participants.update", async (update) => {
    try {
      const metadata = await sock.groupMetadata(update.id);

      for (let participante of update.participants) {
        const numero = participante.split("@")[0];
        const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

        if (update.action === "add") {
          // ✅ Mensagem de boas-vindas
          await sock.sendMessage(update.id, {
            text: `👋 Olá @${numero}!\n\nSeja bem-vindo(a) ao grupo *${metadata.subject}* 🎉\n\nDigite *menu* para ver as opções.`,
            mentions: [participante],
          });
          console.log(`✅ Novo integrante no grupo ${metadata.subject}: ${numero}`);

          // Salva no SheetDB
          await axios.post("https://sheetdb.io/api/v1/7x5ujfu3x3vyb", {
            data: [
              { usuario: `@${numero}`, mensagem: "Entrou no grupo", dataHora }
            ]
          });

        } else if (update.action === "remove") {
          // ❌ Mensagem de despedida
          await sock.sendMessage(update.id, {
            text: `👋 @${numero} saiu do grupo *${metadata.subject}*`,
            mentions: [participante],
          });
          console.log(`ℹ️ Integrante saiu do grupo ${metadata.subject}: ${numero}`);

          // Salva no SheetDB
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
    const { connection, lastDisconnect } = update;

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
      }
    } else if (connection === "open") {
      reconectando = false;
      console.log("✅ Bot conectado ao WhatsApp!");
    }
  });
}

// ▶️ Inicia o bot
iniciar();

// 🌐 Web server (UptimeRobot / Ping)
const app = express();
app.get("/", (req, res) => {
  res.send("🤖 Bot WhatsApp rodando com sucesso!");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
