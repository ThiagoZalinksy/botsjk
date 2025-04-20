const { tratarMensagemLavanderia } = require("./modulos/lavanderia");
const { tratarMensagemEncomendas } = require("./modulos/encomendas");
const express = require("express");
const { criarBot } = require("./whatsapp/bot");

const app = express();
const PORT = 10000;

(async () => {
  const { sock, grupos } = await criarBot();

  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", grupos.lavanderia);
  console.log("📦 Encomendas:", grupos.encomendas);

  // Mostrando todos os IDs no log
  const todosGrupos = [...grupos.lavanderia, ...grupos.encomendas];
  console.log("📋 Todos os IDs de grupos:");
  todosGrupos.forEach((id, i) => {
    console.log(`  ${i + 1}. ${id}`);
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    for (const msg of messages) {
      const from = msg.key.remoteJid;
      const sender = msg.key.participant || msg.key.remoteJid;
      const texto = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

      if (!texto || msg.key.fromMe) return;

      console.log(`📩 Mensagem de ${from}_${sender}: "${texto}"`);

      if (grupos.lavanderia.includes(from)) {
        await tratarMensagemLavanderia(sock, msg, sender);
      } else if (grupos.encomendas.includes(from)) {
        await tratarMensagemEncomendas(sock, msg, sender);
      }
    }
  });

  app.get("/", (_, res) => res.send("🤖 Bot online!"));
  app.listen(PORT, () => {
    console.log(`🌐 Servidor web escutando na porta ${PORT}`);
  });
})();
