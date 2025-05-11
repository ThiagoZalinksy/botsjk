const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");
const express = require("express");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");
const lembretesModulo = require("./lembretes");

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

  // Reagenda lembretes salvos ao iniciar
  lembretesModulo.reagendarTodos(sock);

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

    const body =
      msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

    // Trata lembretes em conversas privadas
    if (!remetente.endsWith("@g.us")) {
      const reminder = lembretesModulo.parseReminder(body);
      if (reminder) {
        const data = lembretesModulo.formatDate(
          reminder.dia,
          reminder.mes,
          reminder.hora,
          reminder.minuto
        );

        lembretesModulo.lembretes.push({
          texto: reminder.texto,
          timestamp: data.getTime(),
          destinatario: remetente,
        });

        lembretesModulo.salvarLembretes();
        lembretesModulo.agendarLembrete(data, reminder.texto, remetente, sock);

        await sock.sendMessage(remetente, {
          text: `✅ Ok! Vou te lembrar de "${
            reminder.texto
          }" no ${data.toLocaleDateString(
            "pt-BR"
          )} às ${data.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}.`,
        });
      }
      return;
    }

    // Trata mensagens em grupos
    let nomeGrupo = "";
    try {
      const metadata = await sock.groupMetadata(remetente);
      nomeGrupo = metadata.subject.toLowerCase();

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
      console.warn("⚠️ Erro ao buscar metadados do grupo:", remetente);
      return;
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
      iniciar();
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
