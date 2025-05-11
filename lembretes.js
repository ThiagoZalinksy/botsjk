const fs = require("fs");
const path = require("path");
const moment = require("moment-timezone");

const caminhoArquivo = path.join(__dirname, "lembretes.json");

// Carrega lembretes salvos (se existirem)
let lembretes = [];
if (fs.existsSync(caminhoArquivo)) {
  try {
    const dados = fs.readFileSync(caminhoArquivo, "utf-8");
    lembretes = JSON.parse(dados);
    console.log(`📂 ${lembretes.length} lembretes carregados do arquivo.`);
  } catch (e) {
    console.warn("⚠️ Erro ao carregar lembretes salvos:", e.message);
  }
}

// Salva os lembretes no arquivo JSON
const salvarLembretes = () => {
  try {
    fs.writeFileSync(caminhoArquivo, JSON.stringify(lembretes, null, 2));
    console.log("💾 Lembretes salvos com sucesso.");
  } catch (e) {
    console.error("❗ Erro ao salvar lembretes:", e.message);
  }
};

// Extrai dados do lembrete da mensagem do usuário
const parseReminder = (text) => {
  const regex = /lembrar (.*) no dia (\d{2})\/(\d{2}) às (\d{2}):(\d{2})/i;
  const match = text.match(regex);
  if (match) {
    return {
      texto: match[1].trim(),
      dia: parseInt(match[2], 10),
      mes: parseInt(match[3], 10),
      hora: parseInt(match[4], 10),
      minuto: parseInt(match[5], 10),
    };
  }
  return null;
};

// Formata a data a partir dos dados extraídos
const formatDate = (dia, mes, hora, minuto) => {
  return moment()
    .set("date", dia)
    .set("month", mes - 1)
    .set("hour", hora)
    .set("minute", minuto)
    .set("second", 0)
    .set("millisecond", 0)
    .toDate();
};

// Agenda o lembrete (setTimeout)
const agendarLembrete = (data, texto, destinatario, sock) => {
  const delay = data.getTime() - Date.now();

  if (delay <= 0) {
    console.warn("⚠️ Lembrete com data no passado ignorado:", texto);
    return;
  }

  setTimeout(() => {
    sock.sendMessage(destinatario, {
      text: `⏰ Lembrete: ${texto}`,
    });
  }, delay);
};

// Reagenda lembretes salvos ao iniciar o bot
const reagendarTodos = (sock) => {
  const agora = Date.now();
  lembretes.forEach((l) => {
    const tempoRestante = l.timestamp - agora;
    if (tempoRestante > 0) {
      agendarLembrete(new Date(l.timestamp), l.texto, l.destinatario, sock);
    } else {
      console.log("⚠️ Ignorando lembrete expirado:", l.texto);
    }
  });
};

module.exports = {
  lembretes,
  salvarLembretes,
  parseReminder,
  formatDate,
  agendarLembrete,
  reagendarTodos,
};
