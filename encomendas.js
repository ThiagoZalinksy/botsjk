async function tratarMensagemEncomendas(sock, msg) {
  const texto = msg.message?.conversation || "";
  if (texto.toLowerCase() === "0") {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "📦 Menu de Encomendas:\n1. Registrar\n2. Consultar\n3. Confirmar recebimento",
    });
  } else {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "📬 Encomendas recebeu: " + texto,
    });
  }
}

module.exports = { tratarMensagemEncomendas };