const makeWASocket = require("@whiskeysockets/baileys").default;
const { useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const P = require("pino");
const moment = require("moment-timezone");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true,
    logger: P({ level: "silent" })
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (!msg.message || msg.key.fromMe || !sock.user) return;

    // 🔍 Identifique aqui os IDs reais dos grupos:
    const grupoLavanderia = "1203630xxxxxx@g.us";
    const grupoEncomendas = "1203630yyyyyy@g.us";

    if (remetente === grupoLavanderia) {
      await tratarMensagemLavanderia(sock, msg);
    } else if (remetente === grupoEncomendas) {
      await tratarMensagemEncomendas(sock, msg);
    }
  });
}

iniciar();
