async function tratarMensagemLavanderia(sock, msg) {
  const texto = msg.message?.conversation || "";
  if (texto.toLowerCase() === "menu") {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "🧺 Menu da Lavanderia:\n1. Iniciar lavagem\n2. Finalizar lavagem\n3. Ver fila",
    });
  } else {
    await sock.sendMessage(msg.key.remoteJid, {
      text: "👕 Lavanderia recebeu: " + texto,
    });
  }
}

module.exports = { tratarMensagemLavanderia };