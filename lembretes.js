const fs = require("fs");
const path = require("path");
const { parse, format, addDays, isBefore } = require("date-fns");
const pt = require("date-fns/locale/pt");

const lembretesPath = path.join(__dirname, "lembretes.json");
let lembretes = [];

// Carrega lembretes do arquivo
if (fs.existsSync(lembretesPath)) {
lembretes = JSON.parse(fs.readFileSync(lembretesPath, "utf-8"));
}

// Expressão regular para interpretar mensagens
const parseReminder = (message) => {
const regex = /me lembre de (.+) (no|em|na|nesse|neste)? (.+) às? (\d{1,2})[:h]?(\d{0,2})?/i;
const match = message.match(regex);
if (match) {
const texto = match[1].trim();
const dia = match[3].trim();
const hora = parseInt(match[4]);
const minuto = match[5] ? parseInt(match[5]) : 0;
return { texto, dia, hora, minuto };
}
return null;
};

// Retorna a próxima data futura com base no dia da semana
const getNextDate = (diaTexto, hora, minuto) => {
const agora = new Date();
const alvo = parse(diaTexto, "EEEE", new Date(), { locale: pt });
let diff = (alvo.getDay() - agora.getDay() + 7) % 7;
const dia = addDays(agora, diff);
dia.setHours(hora);
dia.setMinutes(minuto);
dia.setSeconds(0);
if (isBefore(dia, agora)) dia.setDate(dia.getDate() + 7);
return dia;
};

// Salva lembretes no arquivo
const salvarLembretes = () => {
fs.writeFileSync(lembretesPath, JSON.stringify(lembretes, null, 2));
};

// Agendamento em tempo real
const agendarLembrete = (data, texto, destinatario, sock) => {
const timeout = data.getTime() - Date.now();
if (timeout <= 0) return;

setTimeout(() => {
sock.sendMessage(destinatario, { text: ⏰ Lembrete: ${texto} });
}, timeout);
};

// Recarrega lembretes agendados ao iniciar o bot
const carregarLembretes = (sock) => {
lembretes.forEach((l) => {
const data = new Date(l.timestamp);
if (data > new Date()) {
agendarLembrete(data, l.texto, l.destinatario, sock);
}
});
};

// Lógica principal do módulo
const tratarMensagemLembretes = async (sock, msg) => {
const remetente = msg.key.remoteJid;
const body =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
"";

const reminder = parseReminder(body);
if (reminder) {
const data = getNextDate(reminder.dia, reminder.hora, reminder.minuto);
lembretes.push({
texto: reminder.texto,
timestamp: data.getTime(),
destinatario: remetente,
});
salvarLembretes();
agendarLembrete(data, reminder.texto, remetente, sock);
await sock.sendMessage(remetente, {
text: ✅ Ok! Vou te lembrar de "${reminder.texto}" no ${format( data, "EEEE 'às' HH:mm", { locale: pt } )}.,
});
}
};

module.exports = {
tratarMensagemLembretes,
carregarLembretes,
};
