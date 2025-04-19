// encomendas.js
async function tratarMensagemEncomendas(sock, msg) {
  const texto = msg.message.conversation || "";

  if (texto.includes("encomenda") || texto === "0") {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "📦 Opções de encomendas: \n1. Registrar\n2. Consultar\n3. Confirmar",
    });
  }

  // ...adapte aqui com base no que estava no webhook
}

module.exports = { tratarMensagemEncomendas };
