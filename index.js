const makeWASocket = require("@whiskeysockets/baileys").default;
const {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const moment = require("moment-timezone");

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

// Função para tratar o lembrete
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
    .set("month", mes - 1) // meses começam em 0
    .set("hour", hora)
    .set("minute", minuto)
    .set("second", 0)
    .set("millisecond", 0)
    .toDate();
};

// Função para salvar os lembretes
const lembretes = [];

const salvarLembretes = () => {
  // Aqui você pode implementar o código para salvar os lembretes em um arquivo ou banco de dados
};

// Função para agendar o lembrete
const agendarLembrete = (data, texto, destinatario, sock) => {
  setTimeout(() => {
    sock.sendMessage(destinatario, {
      text: `⏰ Lembrete: ${texto}`,
    });
  }, data.getTime() - Date.now());
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

    if (!msg.message || msg.key.fromMe || !sock.user) return;

    // Verifica se a mensagem é de um grupo ou de conversa privada
    if (!remetente.endsWith("@g.us")) {
      // Só responde em chats privados
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
        salvarLembretes();
        agendarLembrete(data, reminder.texto, remetente, sock);

        await sock.sendMessage(remetente, {
          text: `✅ Ok! Vou te lembrar de ${reminder.texto} no ${moment(
            data
          ).format("dddd [às] HH:mm")}.`,
        });
      }
    }

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
