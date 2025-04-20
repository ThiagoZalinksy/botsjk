const makeWASocket = require("@whiskeysockets/baileys").default;
const { tratarMensagemLavanderia } = require("lavanderia");
const { tratarMensagemEncomendas } = require("encomendas");
const { useMultiFileAuthState } = require("@whiskeysockets/baileys");
const express = require("express");

const nomesGrupos = {
  "Lavanderia JK": "120363099999999@g.us",
  "Teste Lavanderia 2": "120363088888888@g.us",
  "Pousada JK Universitário": "120363077777777@g.us",
  "Grupo JK Teste": "120363066666666@g.us"
};

const gruposLavanderia = [
  nomesGrupos["Lavanderia JK"],
  nomesGrupos["Teste Lavanderia 2"]
];

const gruposEncomendas = [
  nomesGrupos["Pousada JK Universitário"],
  nomesGrupos["Grupo JK Teste"]
];

// 🔍 Log de todos os grupos carregados
console.log("📋 IDs dos grupos carregados:");
for (const [nome, id] of Object.entries(nomesGrupos)) {
  console.log(`🔹 ${nome}: ${id}`);
}

async function iniciarBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const grupoId = msg.key.remoteJid;

    if (gruposLavanderia.includes(grupoId)) {
      await tratarMensagemLavanderia(sock, msg);
    } else if (gruposEncomendas.includes(grupoId)) {
      await tratarMensagemEncomendas(sock, msg);
    }
  });

  console.log("✅ Grupos carregados:");
  console.log("🧺 Lavanderia:", gruposLavanderia);
  console.log("📦 Encomendas:", gruposEncomendas);
  console.log("✅ Bot conectado ao WhatsApp!");
}

// Inicializa o servidor web (opcional, para manter o Render.com ativo)
const app = express();
const PORT = process.env.PORT || 10000;
app.get("/", (req, res) => res.send("Bot está rodando!"));
app.listen(PORT, () => {
  console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});

iniciarBot();
