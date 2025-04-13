const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const moment = require("moment-timezone");
const axios = require('axios');

let usuariosNaFila = [];
let lavagemAtiva = null;

function formatarHorario(data) {
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
async function iniciar() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state,
    logger: P({ level: 'silent' })
  });

  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) iniciar();
    } else if (connection === "open") {
      console.log("✅ Bot conectado com sucesso!");
    }
  }); // fim do sock.ev.on('connection.update')
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0];
    const remetente = msg.key.remoteJid;

    if (!msg.message || msg.key.fromMe) return;

    let texto = '';
    if (msg.message?.conversation) {
      texto = msg.message.conversation;
    } else if (msg.message?.extendedTextMessage) {
      texto = msg.message.extendedTextMessage.text;
    } else if (msg.message?.imageMessage?.caption) {
      texto = msg.message.imageMessage.caption;
    }

    const nomeUsuario = msg.pushName || "usuário";
    const agora = moment().tz("America/Sao_Paulo");
    const horaAtual = agora.format("HH:mm");

    console.log(`📩 Mensagem recebida: "${texto}" de ${remetente}`);
    if (!global.usuarios) global.usuarios = [];

    if (!global.usuarios.includes(remetente)) {
      global.usuarios.push(remetente);
      await sock.sendMessage(remetente, {
        text: `👋 Olá ${nomeUsuario}, seja bem-vindo(a) à lavanderia! Envie *iniciar* para ver as opções.`
      });
    }

    if (texto === '1') {
      await sock.sendMessage(remetente, {
        text: `🧼 Siga as dicas para uma boa utilização pelo link:\nhttps://youtu.be/2O_PWz-0qic`
      });
    } else if (texto === '2') {
      await sock.sendMessage(remetente, {
        text: `🧾 *INFORMAÇÕES TÉCNICAS*\n\nLavadora Electrolux LT09E - 8,5Kg\nCentrifugação: Sim - 660 rpm\nConsumo: 0,25kWh/ciclo\nVoltagem: 220V\n...`
      });
    } else if (texto === '3') {
      const fim = agora.clone().add(2, 'hours');

      lavagemAtiva = {
        usuario: nomeUsuario,
        numero: remetente,
        inicio: agora.toDate(),
        fim: fim.toDate()
      };

      await sock.sendMessage(remetente, {
        text: `🧺 Lavagem iniciada às ${formatarHorario(agora.toDate())}.\n⏱️ Finaliza às ${formatarHorario(fim.toDate())}.\n⛔ Tempo máximo: 2 horas.`
      });

      setTimeout(async () => {
        await sock.sendMessage(remetente, {
          text: `🔔 @${remetente.split("@")[0]} sua lavagem vai finalizar em 5 minutos.`,
          mentions: [remetente]
        });
      }, 1.55 * 60 * 60 * 1000);

      if (agora.hour() >= 20) {
        await sock.sendMessage(remetente, {
          text: `⚠️ Essa é a última lavagem do dia, ${nomeUsuario}. A lavanderia fecha às 22h.`
        });
      }
    } else if (texto === '4') {
      if (!lavagemAtiva) {
        await sock.sendMessage(remetente, {
          text: `🔔 Não há nenhuma lavagem ativa no momento.`
        });
        return;
      }

      if (lavagemAtiva.numero !== remetente) {
        await sock.sendMessage(remetente, {
          text: `⚠️ A máquina está em uso por *${lavagemAtiva.usuario}*.`
        });
        return;
      }

      await sock.sendMessage(remetente, {
        text: `✅ Lavagem finalizada com sucesso. Obrigado por utilizar a lavanderia, ${nomeUsuario}!`
      });

      lavagemAtiva = null;

      if (usuariosNaFila.length > 0) {
        const proximo = usuariosNaFila.shift();
        await sock.sendMessage(proximo.numero, {
          text: `🚨 Olá ${proximo.nome}, a máquina está liberada para você utilizar.`
        });
        await sock.sendMessage(remetente, {
          text: `📣 ${proximo.nome} foi avisado que pode usar a máquina agora.`
        });
      }
    } else if (texto === '5') {
      if (!global.usuariosNaFila) global.usuariosNaFila = [];

      const posicao = global.usuariosNaFila.findIndex(u => u.numero === remetente);
      if (posicao === -1) {
        global.usuariosNaFila.push({ nome: nomeUsuario, numero: remetente, hora: new Date() });

        await sock.sendMessage(remetente, {
          text: `📌 Olá @${remetente.split("@")[0]}, você foi adicionado à fila!\n✅ Sua posição é *${global.usuariosNaFila.length}º*.\nAguarde sua vez!`,
          mentions: [remetente]
        });
      } else {
        let tempoRestante = 0;
        if (global.lavagemAtiva) {
          const fim = new Date(global.lavagemAtiva.fim);
          tempoRestante = Math.max(0, Math.floor((fim - new Date()) / 60000));
        }

        await sock.sendMessage(remetente, {
          text: `📍 Olá @${remetente.split("@")[0]}, você já está na fila!\n🪪 Sua posição: *${posicao + 1}º*.\n⏳ Tempo estimado: ${tempoRestante} min.`,
          mentions: [remetente]
        });
      }

      await sock.sendMessage(remetente, {
        text: `⏰ A hora atual no Brasil é: *${horaAtual}*`
      });
    } else if (texto === '6') {
      const index = usuariosNaFila.findIndex(u => u.numero === remetente);
      if (index === -1) {
        await sock.sendMessage(remetente, {
          text: `⚠️ Você não está na fila atualmente.`
        });
      } else {
        usuariosNaFila.splice(index, 1);
        await sock.sendMessage(remetente, {
          text: `🚫 Você saiu da fila às ${formatarHorario(new Date())}.`
        });
      }
    } else if (texto === '7') {
      const roupas = [ /* mesma lista */ ];
      let combinacao = [];
      let pesoTotal = 0;

      while (pesoTotal < 8) {
        const item = roupas[Math.floor(Math.random() * roupas.length)];
        if (pesoTotal + item.peso <= 8) {
          combinacao.push(item);
          pesoTotal += item.peso;
        } else break;
      }

      let resposta = `🎲 *Sorteio de Lavagem*:\n\n`;
      combinacao.forEach(r => resposta += `• ${r.nome} (${r.peso.toFixed(2)}kg)\n`);
      resposta += `\n📦 Peso total estimado: *${pesoTotal.toFixed(2)}kg*`;

      await sock.sendMessage(remetente, { text: resposta });
    } else if (texto === '8') {
      await sock.sendMessage(remetente, {
        text: `🕒 Horário de funcionamento: 07h às 22h`
      });
    } else if (texto === '9') {
      try {
        const { data } = await axios.get(`https://api.hgbrasil.com/weather?key=c657e670&city_name=Viamão,RS`);
        const info = data.results;
        await sock.sendMessage(remetente, {
          text: `🌦️ *Previsão para Viamão, RS:*\n📅 ${info.date}\n🌡️ ${info.temp}°C\n💧 Umidade: ${info.humidity}%`
        });
      } catch {
        await sock.sendMessage(remetente, { text: `❌ Não foi possível obter a previsão.` });
      }
    } else if (texto === '10') {
      await sock.sendMessage(remetente, {
        text: `🚛 *Dias de coleta de lixo:* Terça, Quinta e Sábado`
      });
    } else if (texto.toLowerCase() === 'menu' || texto.toLowerCase() === 'iniciar') {
      await sock.sendMessage(remetente, {
        text: `📋 *Menu de opções:*\n1 - Dicas\n2 - Info Lavadora\n3 - Iniciar lavagem\n4 - Finalizar\n5 - Entrar na fila\n6 - Sair da fila\n7 - Sortear roupas\n8 - Horário\n9 - Tempo\n10 - Lixo`
      });
    }
  }); // fim do messages.upsert
} // fim da função iniciar

iniciar();
