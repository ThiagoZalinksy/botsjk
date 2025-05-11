const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");
const moment = require("moment-timezone");

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

// Funções do módulo de lembretes
const parseReminder = (text) => {
  const regex = /lembrar (.*) no dia (\d{2})\/(\d{2}) às (\d{2}):(\d{2})/i;
  const match = text.match(regex);
  if (match) {
    return {
      texto: match[1],
      dia: match[2],
      mes: match[3],
      hora: match[4],
      minuto: match[5],
    };
  }
  return null;
};

const formatDate = (dia, mes, hora, minuto) => {
  return moment()
    .set("date", dia)
    .set("month", mes - 1)
    .set("hour", hora)
    .set("minute", minuto)
    .set("second", 0)
    .set("millisecond", 0)
    .toDate();
};

const lembretes = [];

const agendarLembrete = (data, texto, destinatario, sock) => {
  const delay = data.getTime() - Date.now();
  if (delay > 0) {
    setTimeout(() => {
      sock.sendMessage(destinatario, {
        text: `⏰ Lembrete: ${texto}`,
      });
    }, delay);
  }
};

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

    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.message.protocolMessage ||
      msg.message.reactionMessage
    )
      return;

    // 💬 Trata lembretes em conversas privadas
    if (!remetente.endsWith("@g.us")) {
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        "";

      const reminder = parseReminder(body);
      if (reminder) {
        const data = formatDate(
          reminder.dia,
          reminder.mes,
          reminder.hora,
          reminder.minuto
        );
        lembretes.push({
          texto: reminder.texto,
          timestamp: data.getTime(),
          destinatario: remetente,
        });
        agendarLembrete(data, reminder.texto, remetente, sock);
        await sock.sendMessage(remetente, {
          text: `✅ Ok! Vou te lembrar de "${reminder.texto}" no ${moment(
            data
          ).format("DD/MM [às] HH:mm")}.`,
        });
        return;
      }
    }

    // 🔍 Trata grupos
    if (!remetente.endsWith("@g.us")) return;

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
