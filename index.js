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
const express = require("express"); // usado na parte 10




//Parte 2 — Variáveis globais e função de horário
let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.format("HH:mm");
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



const DisconnectReason = require("@whiskeysockets/baileys").DisconnectReason;

// Parte 4 — Monitoramento da conexão
sock.ev.on("connection.update", (update) => {
  const { connection, lastDisconnect } = update;

  if (connection === "close") {
    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 428 && statusCode !== 440;

    console.log(`⚠️ Conexão encerrada. Código: ${statusCode} — Reconectar?`, shouldReconnect);

    if (shouldReconnect) iniciar();
    else console.log("❌ Não será reconectado. Verifique a sessão ou o QR.");
  } else if (connection === "open") {
    console.log("✅ Bot conectado com sucesso!");
  }
});

// ✅ Parte nova — Boas-vindas em grupos
sock.ev.on("group-participants.update", async (update) => {
  const { id, participants, action } = update;

  if (action === "add") {
    for (let participante of participants) {
      const numero = participante.split("@")[0];
      const contato = await sock.onWhatsApp(participante);
      const nomeUsuario = contato?.[0]?.notify || `@${numero}`;

      await sock.sendMessage(id, {
        text: `👋 Olá ${nomeUsuario}, seja bem-vindo(a) ao grupo da lavanderia!\nDigite *Menu* para ver as opções disponíveis.`,
        mentions: [participante],
      });
    }
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
  text: `👋 Olá ${nomeUsuario}, seja bem-vindo(a) à lavanderia! Envie *Iniciar* ou *Menu* para ver as opções.`
});
}


//Parte 7 — Lógica de comandos (1 a 5)

if (texto === "1") {
  await enviar({ text: "🧼 Dicas de uso: https://youtu.be/2O_PWz-0qic" });
} else if (texto === "2") {
  await enviar({ text: "🧾 *Informações tecnicas da lavadora* \nLavadora de Roupas Electrolux\nCapacidade: 8,5Kg \nModelo: LT09E Top Load Turbo Agitação Super\nProgramas de Lavagem: 9\nNíveis de Água: 4\nCor: Branca\n*CARACTERÍSTICAS*\nCapacidade (kg de roupas): 8,5Kg\nAcesso ao cesto: Superior\nÁgua quente: Não\nEnxágues: 1\nCentrifugação: Sim \nDispenser para sabão: Sim\nDispenser para amaciante: Sim\nDispenser para alvejante: Sim\nElimina fiapos: Sim - através do filtro\nNíveis de água: Extra, Baixo, Médio, Alto\nESPECIFICAÇÕES TÉCNICAS\nConsumo: (kWh) 0,25kWh/ciclo\nControles: Eletromecânicos\nVelocidade de centrifugação: (rpm) 660\nTensão/Voltagem: 220V\nAcabamento do cesto: Polipropileno\nConsumo de Energia: A (menos 25% de consumo)\nConsumo de água: 112 litros por ciclo\nEficiência Energética: A" });
} else if (texto === "3") {
    const agora = moment().tz("America/Sao_Paulo");
    const fim = agora.clone().add(2, "hours");

    // Função para determinar a saudação
    const obterSaudacao = (hora) => {
        if (hora >= 7 && hora < 12) {
            return "Bom dia";
        } else if (hora >= 12 && hora < 18) {
            return "Boa tarde";
        } else {
            return "Boa noite";
        }
    };

    const saudacao = obterSaudacao(agora.hour());

    // Obtendo o nome do usuário
// Se a mensagem for de um grupo, pega o número do participante que enviou (ex: 5511999999999@s.whatsapp.net).
// Se for de um chat privado, usa o próprio remetente como ID.
    const usuarioId = msg.key.participant || remetente;
// Formata o nome para menção usando "@" + o número do usuário (ex: @5511999999999)
    const nomeUsuario = '@' + usuarioId.split('@')[0];

    lavagemAtiva = {
        usuario: nomeUsuario,
        numero: remetente,
        inicio: agora.toDate(),
        fim: fim.toDate()
    };

    // Enviar a mensagem mencionando o usuário
    await enviar({
        text: `${saudacao} ${nomeUsuario} ! 🧺 Lavagem iniciada às ${formatarHorario(agora)}.\n⏱️ Termina às ${formatarHorario(fim)}`,
        mentions: [usuarioId]  // Usando o ID completo do remetente, sem '@g.us'
    });

    setTimeout(async () => {
        // Enviar notificação de término
        await enviar({
            text: `🔔 ${nomeUsuario}, sua lavagem vai finalizar em 5 minutos.`,
            mentions: [usuarioId]  // Novamente, mencionando pelo ID completo
        });
    }, 1.55 * 60 * 60 * 1000); // 1 hora e 33 minutos
  

} else if (texto === "4") {
  if (!lavagemAtiva || lavagemAtiva.numero !== remetente) {
    await enviar({ text: `⚠️ Nenhuma lavagem ativa ou você não está usando.` });
    return;
  }

  const fimLavagem = moment.tz("America/Sao_Paulo");
  const duracao = moment.duration(fimLavagem.diff(moment(lavagemAtiva.inicio)));
  const duracaoStr = `${duracao.hours()}h ${duracao.minutes()}min`;
  
  const usuarioId = msg.key.participant || remetente;
  const nomeUsuario = '@' + usuarioId.split('@')[0];

  let resposta = `✅ Lavagem finalizada!\n👤 ${nomeUsuario}\n🕒 Duração: ${duracaoStr}\n`;

  if (duracao.asHours() > 2) {
    resposta += `⚠️ Tempo ultrapassado, ${nomeUsuario}!\nTente ser mais pontual da próxima vez.`;
  } else {
    resposta += `🎉 Bom trabalho, ${nomeUsuario}! Você concluiu dentro do tempo.`;
  }

  await enviar({ text: resposta, mentions: [usuarioId] });

  lavagemAtiva = null;

  // Notifica próximo da fila, se houver
  if (filaDeEspera.length > 0) {
    const proximo = filaDeEspera.shift();
    await enviar({
      text: `🔔 @${proximo.split("@")[0]}, a máquina está livre!\n👉 Use a opção *3* para iniciar sua lavagem.`,
      mentions: [proximo]
    });
  }


  } else if (texto === "5") {
  const usuarioId = msg.key.participant || remetente;
  const nomeUsuario = '@' + usuarioId.split('@')[0];

  //if (lavagemAtiva && lavagemAtiva.numero === remetente) {
    //await enviar({
     // text: `⚠️ ${nomeUsuario}, você já está usando o sistema de lavagem.`,
     // mentions: [usuarioId]
   // });
    //return;
 // }

  if (lavagemAtiva && lavagemAtiva.numero !== remetente) {
    const agora = moment.tz("America/Sao_Paulo");
    const fim = moment(lavagemAtiva.fim);
    const duracaoRestante = moment.duration(fim.diff(agora));
    const minutosRestantes = duracaoRestante.asMinutes();
    
    const restanteStr =
      minutosRestantes <= 0
        ? "a lavagem está prestes a terminar."
        : `faltam aproximadamente ${Math.floor(duracaoRestante.asHours())}h ${duracaoRestante.minutes()}min para finalizar.`;

    await enviar({
      text: `⏳ A máquina já está sendo usada por ${lavagemAtiva.usuario}.\n🕒 ${restanteStr}`,
      mentions: [lavagemAtiva.usuario.replace("@", "") + "@s.whatsapp.net"]
    });
    return;
  }

  if (filaDeEspera.includes(remetente)) {
    const posicao = filaDeEspera.indexOf(remetente) + 1;
    const esperaHoras = posicao * 2;
    await enviar({
      text: `⏳ ${nomeUsuario}, você já está na fila (posição ${posicao}). Tempo estimado: ~${esperaHoras} hora(s).`,
      mentions: [usuarioId]
    });
    return;
  }

  if (!lavagemAtiva) {
    await enviar({
      text: `✅ A máquina está *livre* no momento.\n👉 Use a opção *3* para iniciar a lavagem.`
    });
    return;
  }

  filaDeEspera.push(remetente);
  const posicao = filaDeEspera.indexOf(remetente) + 1;
  const esperaHoras = posicao * 2;

  await enviar({
    text: `📝 ${nomeUsuario}, você foi adicionado à fila!\n🔢 Posição: ${posicao}\n🕒 Tempo estimado: ~${esperaHoras} hora(s).`,
    mentions: [usuarioId]
  });
}


//Parte 8 — Gerenciamento da fila (comandos 5, 6)

else if (texto === "6") {
    const indice = filaDeEspera.indexOf(remetente);
  
    if (indice === -1) {
      await enviar({ text: `❌ Você 🫵🏻 não está na fila.` });
      return;
    }
  
    filaDeEspera.splice(indice, 1);
  
    await enviar({ text: `🚪 Você saiu da fila com sucesso.` });
  
    if (filaDeEspera.length > 0) {
      const atualizada = filaDeEspera.map((num, idx) => `🔢 ${idx + 1} - @${num.split("@")[0]}`).join("\n");
      await enviar({
        text: `📋 Fila atualizada:\n${atualizada}`,
        mentions: filaDeEspera
      });
    } else {
      await enviar({ text: `🆓 A fila agora está vazia.` });
    }
  }

//Parte 9 — Recursos adicionais: sorteio, previsão do tempo, lixo

else if (texto.startsWith("7")) {
    const proibidos = ["boné", "bonés", "tenis", "tênis", "travesseiro", "bicho", "pelucia", "pelúcia", "couro", "cobertor", "edredom"];
    const pesos = {
      camiseta: 0.3,
      calca: 0.6,
      calça: 0.6,
      toalha: 0.5,
      cama: 1.2,
      meia: 0.1,
      intima: 0.15,
      íntima: 0.15
    };
  
    const input = texto.slice(1).trim(); // Remove o "7"
    const entradas = input.split(/\s|,/).filter(e => e.includes(":"));
    let totalKg = 0;
    let alertaProibido = [];
    let listaDetalhada = [];
  
    for (let entrada of entradas) {
      let [tipo, qtd] = entrada.split(":");
      tipo = tipo.toLowerCase();
      qtd = parseInt(qtd);
  
      const tipoNormalizado = Object.keys(pesos).find(p => tipo.includes(p));
      const contemProibido = proibidos.some(p => tipo.includes(p));
  
      if (contemProibido) {
        alertaProibido.push(tipo);
        continue;
      }
  
      if (tipoNormalizado && !isNaN(qtd)) {
        const peso = pesos[tipoNormalizado] * qtd;
        totalKg += peso;
        listaDetalhada.push(`${qtd}x ${tipoNormalizado} (~${peso.toFixed(1)}kg)`);
      }
    }
  
    let mensagem = `🧮 Cálculo da carga:\n${listaDetalhada.join("\n")}\n\n⚖️ Peso total estimado: *${totalKg.toFixed(2)}kg*\n`;
  
    if (totalKg > 8) {
      mensagem += `⚠️ *Ultrapassou o limite de 8kg!* Retire algumas peças.`;
    } else {
      mensagem += `✅ Dentro do limite! Pode lavar tranquilo.`;
    }
  
    if (alertaProibido.length > 0) {
      mensagem += `\n\n🚫 Itens não permitidos detectados: ${alertaProibido.join(", ")}.\nEstes não devem ser lavados na máquina!`;
    }
  
    await enviar({ text: mensagem });
  }
  else if (texto === "8") {
    const agora = moment.tz("America/Sao_Paulo"); // Pega a hora atual de São Paulo
    const horaAtualmente = agora.hour(); // Hora atual no formato de 24h
    const fechamento = 22; // A lavagem só pode ir até 22h
  
    let mensagem = "🕒 Horário de funcionamento: 07h às 22h.\n";
  
    // Se for 20h ou mais tarde, alerta sobre a lavagem que terminará no fechamento
    if (horaAtualmente >= 20) {
      mensagem += `⚠️ Você está tentando iniciar uma lavagem após as 20h, o que significa que a lavagem terminará por volta das 22h, quando o funcionamento fecha.`;
      mensagem += `\n👉 Recomendamos que inicie antes das 20h para garantir que tenha tempo suficiente.`;
    }
  
    // Informa o horário de funcionamento de forma geral
    mensagem += `\n⏰ Se você iniciar sua lavagem antes das 20h, a máquina poderá funcionar normalmente até 22h, como o horário de funcionamento estabelecido.`;
  
    await enviar({ text: mensagem });
  }
  else if (texto === "9") {
    try {
      const { data } = await axios.get("https://api.hgbrasil.com/weather?key=c657e670&city_name=Viamão,RS");
      const info = data.results;
      
      // Determina o clima (ex: "quente", "frio", etc)
      const temperatura = info.temp;
      let climaDescricao = "Desconhecido";
      if (temperatura > 30) climaDescricao = "quente";
      else if (temperatura > 20) climaDescricao = "agradável";
      else climaDescricao = "frio";
  
      // Determina o tipo de clima (sol, chuva, etc)
      let condicaoClima = info.condition;
      if (condicaoClima === "clouds") condicaoClima = "nublado";
      if (condicaoClima === "rain") condicaoClima = "chuva";
      if (condicaoClima === "clear") condicaoClima = "ensolarado";
      if (condicaoClima === "snow") condicaoClima = "neve";
  
      const dataUltimaAtualizacao = new Date(info.date);
      const horaUltimaAtualizacao = `${dataUltimaAtualizacao.getHours()}:${dataUltimaAtualizacao.getMinutes().toString().padStart(2, '0')}`;
  
      // Montando a mensagem com emojis
      let mensagem = `🌦️ **Clima Atual em Viamão**\n\n`;
      mensagem += `📅 **Última atualização**: Hoje às ${horaUltimaAtualizacao}\n`;
      mensagem += `🌡️ **Temperatura**: ${temperatura}°C - Está considerado ${climaDescricao} para o momento.\n`;
      mensagem += `🌤️ **Condição**: ${condicaoClima}\n`;
      mensagem += `💧 **Umidade**: ${info.humidity}%\n`;
      mensagem += `💨 **Vento**: ${info.wind_speed} km/h`;
  
      // Emoji para clima
      if (condicaoClima === "chuva") {
        mensagem += ` 🌧️`;
      } else if (condicaoClima === "ensolarado") {
        mensagem += ` 🌞`;
      } else if (condicaoClima === "nublado") {
        mensagem += ` ☁️`;
      } else if (condicaoClima === "neve") {
        mensagem += ` ❄️`;
      }
  
      await enviar({ text: mensagem });
    } catch (error) {
      await enviar({ text: "❌ Não foi possível obter a previsão do tempo. Tente novamente mais tarde." });
    }
  }
  else if (texto === "10") {
    // Mensagem de coleta de lixo mais envolvente
    const mensagem = `🗑️ **Dias de Coleta de Lixo em Viamão**\n\n` +
                     `📅 **Dias de coleta**: Terça, Quinta e Sábado\n\n` +
                     `⏰ **Horário**: A coleta pode ocorrer entre 8h e 22h, por isso, não se esqueça de colocar o lixo fora no início da manhã! 🕗\n\n` +
                     `🚫 **Itens que não podem ser descartados**: Materiais perigosos, baterias, eletrônicos, etc. Consulte as orientações no site da prefeitura para mais detalhes.\n` +
                     `🗑️ **Dica**: Coloque o lixo em sacos bem fechados para evitar que os animais espalhem. 🐾`;
  
    await enviar({ text: mensagem });
  }
   else if (
  texto.toLowerCase() === "menu" ||
  texto.toLowerCase() === "iniciar"
) await enviar({
    text: `📋 *Menu de Opções*:\n\n` +
          `1️⃣ Dicas 📝\n` +
          `2️⃣ Info Lavadora 🧺\n` +
          `3️⃣ Iniciar Lavagem 🧼\n` +
          `4️⃣ Finalizar Lavagem ✅\n` +
          `5️⃣ Entrar na Fila ⏳\n` +
          `6️⃣ Sair da Fila 🚶‍♂️\n` +
          `7️⃣ Sortear Roupas 🎲\n` +
          `8️⃣ Horário de Funcionamento ⏰\n` +
          `9️⃣ Previsão do Tempo 🌦️\n` +
          `🔟 Coleta de Lixo 🗑️\n\n` +
          `*Digite o número correspondente à opção desejada.*`
  });
  
}); // fim do messages.upsert
} // fim da função iniciar
iniciar();

// Parte 10 — Express: mantém o serviço ativo na Render
const app = express();

app.get("/", (req, res) => {
res.send("🟢 Bot de lavanderia rodando na Render!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`🌐 Servidor web escutando na porta ${PORT}`);
});
