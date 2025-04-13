// Parte 1 — Importação de módulos
const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason
  } = require("@whiskeysockets/baileys");
  
  const P = require("pino");
  const fs = require("fs");
  const moment = require("moment-timezone");
  const axios = require("axios");
//Parte 2 — Variáveis globais e função de horário
let usuariosNaFila = [];
let lavagemAtiva = null;

function formatarHorario(data) {
  return data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
// Parte 3 — Função principal iniciar e conexão com o WhatsApp
async function iniciar() {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const { version } = await fetchLatestBaileysVersion();
  
    const sock = makeWASocket({
      version,
      printQRInTerminal: true,
      auth: state,
      logger: P({ level: "silent" }),
    });
  
    sock.ev.on("creds.update", saveCreds);
//Parte 4 — Monitoramento da conexão (conectado / desconectado)
sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log("⚠️ Conexão encerrada. Reconectar?", shouldReconnect);
      if (shouldReconnect) iniciar();
    } else if (connection === "open") {
      console.log("✅ Bot conectado com sucesso!");
    }
  });
  //Parte 5 — Recepção de mensagens
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (!msg.message || msg.key.fromMe || !sock.user) return;

    let texto = "";
    if (msg.message?.conversation) {
      texto = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage) {
      texto = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
      texto = msg.message.imageMessage.caption;
    }
//Parte 6 — Saudação automática e função enviar()
const nomeUsuario = msg.pushName || "usuário";
const agora = moment().tz("America/Sao_Paulo");
const horaAtual = agora.format("HH:mm");

console.log(`📩 Mensagem recebida: "${texto}" de ${remetente}`);

const enviar = async (mensagem) => {
  try {
    await sock.sendMessage(remetente, mensagem);
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem:", err.message);
  }
};

if (!global.usuarios) global.usuarios = [];

if (!global.usuarios.includes(remetente)) {
  global.usuarios.push(remetente);
  await enviar({
    text: `👋 Olá ${nomeUsuario}, seja bem-vindo(a) à lavanderia! Envie *iniciar* para ver as opções.`
  });
}
//Parte 7 — Lógica de comandos (1 a 5)
if (texto === "1") {
    await enviar({ text: "🧼 Dicas de uso: https://youtu.be/2O_PWz-0qic" });
  } else if (texto === "2") {
    await enviar({ text: "🧾 Informações da lavadora..." });
  } else if (texto === "3") {
    const fim = agora.clone().add(2, "hours");
    lavagemAtiva = { usuario: nomeUsuario, numero: remetente, inicio: agora.toDate(), fim: fim.toDate() };
    await enviar({ text: `🧺 Lavagem iniciada...` });
    setTimeout(async () => {
      await enviar({
        text: `🔔 @${remetente.split("@")[0]} sua lavagem vai finalizar em 5 minutos.`,
        mentions: [remetente]
      });
    }, 1.55 * 60 * 60 * 1000);
  } else if (texto === "4") {
    if (!lavagemAtiva || lavagemAtiva.numero !== remetente) {
      await enviar({ text: `⚠️ Nenhuma lavagem ativa ou você não está usando.` });
      return;
    }
    await enviar({ text: `✅ Lavagem finalizada!` });
    lavagemAtiva = null;
  } else if (texto === "5") {
    // adiciona na fila
  }
//Parte 8 — Gerenciamento da fila (comandos 5, 6)
else if (texto === "6") {
    const index = usuariosNaFila.findIndex((u) => u.numero === remetente);
    if (index === -1) {
      await enviar({ text: "⚠️ Você não está na fila." });
    } else {
      usuariosNaFila.splice(index, 1);
      await enviar({ text: `🚫 Você saiu da fila às ${formatarHorario(new Date())}` });
    }
  }
//Parte 9 — Recursos adicionais: sorteio, previsão do tempo, lixo
else if (texto === "7") {
    // sorteia roupas fictícias até 8kg
  } else if (texto === "8") {
    await enviar({ text: "🕒 Horário de funcionamento: 07h às 22h" });
  } else if (texto === "9") {
    try {
      const { data } = await axios.get("https://api.hgbrasil.com/weather?key=c657e670&city_name=Viamão,RS");
      const info = data.results;
      await enviar({ text: `🌦️ Clima em Viamão: ${info.temp}°C, Umidade: ${info.humidity}%` });
    } catch {
      await enviar({ text: "❌ Não foi possível obter a previsão." });
    }
  } else if (texto === "10") {
    await enviar({ text: "🚛 Dias de coleta de lixo: Terça, Quinta e Sábado" });
  }
//Parte 10 — Exibição do menu
else if (
    texto.toLowerCase() === "menu" ||
    texto.toLowerCase() === "iniciar"
  ) {
    await enviar({
      text: `📋 *Menu de opções:*\n1 - Dicas\n2 - Info Lavadora\n3 - Iniciar lavagem\n4 - Finalizar\n5 - Entrar na fila\n6 - Sair da fila\n7 - Sortear roupas\n8 - Horário\n9 - Tempo\n10 - Lixo`
    });
  }
}); // fim do messages.upsert
} // fim da função iniciar

iniciar();
