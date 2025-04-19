const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const P = require("pino");
const fs = require("fs");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

let grupos = { lavanderia: null, encomendas: null };

if (fs.existsSync("grupos.json")) {
  grupos = JSON.parse(fs.readFileSync("grupos.json", "utf-8"));
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

    if (!msg.message || !remetente.endsWith("@g.us")) return;

    if (!grupos.lavanderia) {
      grupos.lavanderia = remetente;
      fs.writeFileSync("grupos.json", JSON.stringify(grupos, null, 2));
      console.log("📌 Grupo da lavanderia registrado:", remetente);
    } else if (!grupos.encomendas && remetente !== grupos.lavanderia) {
      grupos.encomendas = remetente;
      fs.writeFileSync("grupos.json", JSON.stringify(grupos, null, 2));
      console.log("📌 Grupo de encomendas registrado:", remetente);
    }

    if (remetente === grupos.lavanderia) {
      await tratarMensagemLavanderia(sock, msg);
    } else if (remetente === grupos.encomendas) {
      await tratarMensagemEncomendas(sock, msg);
    }
  });
}

iniciar();