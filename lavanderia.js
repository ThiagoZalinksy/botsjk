const moment = require("moment-timezone");
const axios = require("axios");

let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.format("HH:mm");
}

async function tratarMensagemLavanderia(sock, msg) {
  const remetente = msg.key.remoteJid;

  let texto = "";
  if (msg.message?.conversation) {
    texto = msg.message.conversation;
  } else if (msg.message?.extendedTextMessage) {
    texto = msg.message.extendedTextMessage.text;
  } else if (msg.message?.imageMessage?.caption) {
    texto = msg.message.imageMessage.caption;
  }

  const textoLower = texto.toLowerCase();
  const usuarioId = msg.key.participant || remetente;
  const nomeUsuario = "@" + usuarioId.split("@")[0];
  const agora = moment().tz("America/Sao_Paulo");

  const enviar = async (mensagem) => {
    try {
      await sock.sendMessage(remetente, mensagem);
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem:", err.message);
    }
  };

  if (textoLower === "menu" || textoLower === "iniciar") {
    await enviar({
      text: `📋 *Menu de Opções*:\n
1️⃣ Dicas 📝
2️⃣ Info Lavadora 🧺
3️⃣ Iniciar Lavagem 🧼
4️⃣ Finalizar Lavagem ✅
5️⃣ Entrar na Fila ⏳
6️⃣ Sair da Fila 🚶‍♂️
7️⃣ Sortear Roupas 🎲
8️⃣ Horário de Funcionamento ⏰
9️⃣ Previsão do Tempo 🌦️
🔟 Coleta de Lixo 🗑️

*Digite o número correspondente à opção desejada.*`,
    });
    return;
  }

  // Opção 1: Dicas
  else if (texto === "1") {
    await enviar({ text: "🧼 Dicas de uso: https://youtu.be/2O_PWz-0qic" });
  }

  // Opção 2: Info Lavadora
  else if (texto === "2") {
    await enviar({
      text: "🧾 *Informações técnicas da lavadora*\nLavadora de Roupas Electrolux\nCapacidade: 8,5Kg\nModelo: LT09E Top Load Turbo Agitação Super\nProgramas de Lavagem: 9\nNíveis de Água: 4\nCor: Branca\n*CARACTERÍSTICAS*\nCapacidade (kg de roupas): 8,5Kg\nAcesso ao cesto: Superior\nÁgua quente: Não\nEnxágues: 1\nCentrifugação: Sim\nDispenser para sabão: Sim\nDispenser para amaciante: Sim\nDispenser para alvejante: Sim\nElimina fiapos: Sim - através do filtro\nNíveis de água: Extra, Baixo, Médio, Alto\nESPECIFICAÇÕES TÉCNICAS\nConsumo: (kWh) 0,25kWh/ciclo\nControles: Eletromecânicos\nVelocidade de centrifugação: (rpm) 660\nTensão/Voltagem: 220V\nAcabamento do cesto: Polipropileno\nConsumo de Energia: A (menos 25% de consumo)\nConsumo de água: 112 litros por ciclo\nEficiência Energética: A",
    });
  }

  // Opção 3: Iniciar Lavagem
else if (texto === "3") {
    // Bloquear se for após as 20h
    if (agora.hour() >= 20) {
        await enviar({
            text: `❌ ${nomeUsuario}, não é possível iniciar a lavagem após as 20h.\n🕗 As lavagens devem ser iniciadas entre 07h e 20h para garantir o funcionamento adequado e o respeito aos horários de silêncio.`
        });
        return;
    }

    const tempoAvisoAntesDoFim = 10;
    const fim = agora.clone().add(2, "hours");
    const saudacao =
        agora.hour() < 12
            ? "Bom dia"
            : agora.hour() < 18
                ? "Boa tarde"
                : "Boa noite";

    lavagemAtiva = {
        usuario: nomeUsuario,
        numero: remetente,
        inicio: agora.toDate(),
        fim: fim.toDate(),
    };

    await enviar({
        text: `${saudacao} ${nomeUsuario}! 🧺 Lavagem iniciada às ${formatarHorario(
            agora
        )}.\n⏱️ Termina às ${formatarHorario(fim)}`,
        mentions: [usuarioId],
    });

    setTimeout(async () => {
        await enviar({
            text: `🔔 ${nomeUsuario}, sua lavagem vai finalizar em ${tempoAvisoAntesDoFim} minutos.`,
            mentions: [usuarioId],
        });
    }, (120 - tempoAvisoAntesDoFim) * 60 * 1000);
}

  // Opção 4: Finalizar Lavagem
  else if (texto === "4") {
    if (!lavagemAtiva || lavagemAtiva.numero !== remetente) {
      await enviar({
        text: `⚠️ Nenhuma lavagem ativa ou você não está usando a máquina.`,
      });
      return;
    }

    const fimLavagem = moment.tz("America/Sao_Paulo");
    const duracao = moment.duration(
      fimLavagem.diff(moment(lavagemAtiva.inicio))
    );
    const duracaoStr = `${duracao.hours()}h ${duracao.minutes()}min`;

    let resposta = `✅ Lavagem finalizada!\n👤 ${nomeUsuario}\n🕒 Duração: ${duracaoStr}\n`;
    resposta +=
      duracao.asHours() > 2
        ? `⚠️ Tempo ultrapassado, ${nomeUsuario}!`
        : `🎉 Bom trabalho, ${nomeUsuario}!`;

    await enviar({ text: resposta, mentions: [usuarioId] });

    lavagemAtiva = null;

    if (filaDeEspera.length > 0) {
      const proximo = filaDeEspera.shift();
      await enviar({
        text: `🔔 @${
          proximo.split("@")[0]
        }, a máquina está livre!\n👉 Use a opção *3* para iniciar sua lavagem.`,
        mentions: [proximo],
      });
    }
  }

  // Opção 5: Entrar na Fila
  else if (texto === "5") {
    if (filaDeEspera.includes(remetente)) {
      const posicao = filaDeEspera.indexOf(remetente) + 1;
      await enviar({
        text: `⏳ ${nomeUsuario}, você já está na fila (posição ${posicao}).`,
        mentions: [usuarioId],
      });
      return;
    }

    if (!lavagemAtiva) {
      await enviar({
        text: `✅ A máquina está *livre* no momento.\n👉 Use a opção *3* para iniciar a lavagem.`,
      });
      return;
    }

    filaDeEspera.push(remetente);
    const posicao = filaDeEspera.indexOf(remetente) + 1;
    const totalNaFila = filaDeEspera.length;
    await enviar({
      text: `📝 ${nomeUsuario}, você foi adicionado à fila!\n🔢 Posição: ${posicao}\n👥 Total na fila: ${totalNaFila} pessoa(s)`,
      mentions: [usuarioId],
    });
  }

  // Opção 6: Sair da Fila
  else if (texto === "6") {
    const indice = filaDeEspera.indexOf(remetente);
    if (indice === -1) {
      await enviar({ text: `❌ Você 🫵🏻 não está na fila.` });
      return;
    }

    filaDeEspera.splice(indice, 1);
    await enviar({ text: `🚪 Você saiu da fila com sucesso.` });

    if (filaDeEspera.length > 0) {
      const atualizada = filaDeEspera
        .map((num, idx) => `🔢 ${idx + 1} - @${num.split("@")[0]}`)
        .join("\n");
      await enviar({
        text: `📋 Fila atualizada:\n${atualizada}`,
        mentions: filaDeEspera,
      });
    } else {
      await enviar({ text: `🆓 Menos 1 na fila.` });
    }
  }

  // Opção 7: Sortear roupas
  else if (texto === "7") {
    const roupasDisponiveis = [
      { nome: "Peça intima - masculina", peso: 0.1 },
      { nome: "Peça intima - feminina", peso: 0.1 },
      { nome: "Sutiã", peso: 0.15 },
      { nome: "Meia", peso: 0.05 },
      { nome: "Camiseta", peso: 0.2 },
      { nome: "Calça Jeans", peso: 0.6 },
      { nome: "Moletom", peso: 0.8 },
      { nome: "Toalha de banho", peso: 0.4 },
      { nome: "Fronha", peso: 0.1 },
      { nome: "Lençol", peso: 0.5 },
      { nome: "Calça Legging", peso: 0.5 },
      { nome: "Blusa de Frio", peso: 0.6 },
      { nome: "Camiseta de manga longa", peso: 0.3 },
      { nome: "Bermuda", peso: 0.4 },
      { nome: "Shorts", peso: 0.3 },
      { nome: "Blusa de frio masculina", peso: 0.7 },
      { nome: "Blusa de frio feminina", peso: 0.7 },
      { nome: "Saia", peso: 0.3 },
      { nome: "Vestido", peso: 0.4 },
      { nome: "Pijama", peso: 0.6 },
      { nome: "Regata", peso: 0.2 },
    ];

    const pesoMaximo = 8.0;
    let pesoAtual = 0;
    let roupasSelecionadas = [];

    for (let i = 0; i < 100; i++) {
      const roupa =
        roupasDisponiveis[Math.floor(Math.random() * roupasDisponiveis.length)];
      if (pesoAtual + roupa.peso <= pesoMaximo) {
        roupasSelecionadas.push(roupa.nome);
        pesoAtual += roupa.peso;
      } else {
        break;
      }
    }

    const listaFinal = roupasSelecionadas.reduce((acc, nome) => {
      acc[nome] = (acc[nome] || 0) + 1;
      return acc;
    }, {});

    const mensagemRoupas = Object.entries(listaFinal)
      .map(([nome, qtd]) => `- ${qtd}x ${nome}`)
      .join("\n");

    await enviar({
      text: `🧺 Lavagem sorteada (até 8kg):\n${mensagemRoupas}\n\nPeso total estimado: ${pesoAtual.toFixed(
        2
      )}kg`,
    });
  }

  // Opção 8: Horário de Funcionamento
  else if (texto === "8") {
    await enviar({
      text: "⏰ *Horário de Funcionamento*\n🗓️ Segunda a Domingo\n🕗 Das 07h às 22h",
    });
  }

  // Opção 9: Previsão do Tempo
  else if (texto === "9") {
    try {
      const { data } = await axios.get(
        "https://api.hgbrasil.com/weather?key=31f0dad0&city_name=Viamão,RS"
      );
      const info = data.results;
      await enviar({
        text: `🌤️ *Previsão do Tempo - ${info.city}*\n\n📅 *Data:* ${info.date}\n🌡️ *Temperatura:* ${info.temp}°C\n☁️ *Condição:* ${info.description}\n💨 *Vento:* ${info.wind_speedy}\n🌅 *Nascer do sol:* ${info.sunrise}\n🌇 *Pôr do sol:* ${info.sunset}`,
      });
    } catch (err) {
      console.error(err.message);
      await enviar({ text: "⚠️ Erro ao obter previsão do tempo." });
    }
  }

  // Opção 10: Coleta de Lixo
  else if (texto === "10" || texto === "🔟") {
    await enviar({
      text: "🗑️ *Dias de Coleta de Lixo:*\n\n🗓️ *Terça, Quinta e Sábado*",
    });
  }
}

module.exports = { tratarMensagemLavanderia };
