// lavanderia.js
const moment = require("moment-timezone");
const axios = require("axios");

let filaDeEspera = [];
let lavagemAtiva = null;

function formatarHorario(momentObj) {
  return momentObj.format("HH:mm");
}

async function tratarMensagemLavanderia(sock, msg) {
  const texto = msg.message?.conversation?.toLowerCase() || "";
  const remetente = msg.key.remoteJid;
  const nomeUsuario = msg.pushName || "usuário";

  // 📍 Seção 1 — Saudação automática e boas-vindas
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
      text: `👋 Olá ${nomeUsuario}, seja bem-vindo(a) à lavanderia! Envie *Iniciar* ou *Menu* para ver as opções.`,
    });
  }

  // 📍 Seção 2 — Menu principal
  if (texto === "menu" || texto === "iniciar") {
    return await enviar({
      text:
        `📋 *Menu de Opções*:\n\n` +
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
        `*Digite o número correspondente à opção desejada.*`,
    });
  }

  // 📍 Seção 3 — Opção 1: Dicas de uso
  if (texto === "1") {
    return await enviar({ text: "🧼 Dicas de uso: https://youtu.be/2O_PWz-0qic" });
  }

  // 📍 Seção 4 — Opção 2: Info técnica da lavadora
  if (texto === "2") {
    return await enviar({
      text:
        "🧾 *Informações tecnicas da lavadora*\n" +
        "Lavadora de Roupas Electrolux\n" +
        "Capacidade: 8,5Kg \nModelo: LT09E Top Load Turbo Agitação Super\n" +
        "Programas de Lavagem: 9\nNíveis de Água: 4\nCor: Branca\n" +
        "*CARACTERÍSTICAS*\nAcesso ao cesto: Superior\nÁgua quente: Não\n" +
        "Enxágues: 1\nCentrifugação: Sim\n" +
        "Dispenser para sabão/amaciante/alvejante: Sim\nElimina fiapos: Sim\n" +
        "*ESPECIFICAÇÕES*\nConsumo de energia: 0,25kWh/ciclo\n" +
        "Cesto: Polipropileno\nEficiência Energética: A\nConsumo de água: 112 litros",
    });
  }

  // 📍 Seção 5 — Opção 3: Iniciar lavagem
  if (texto === "3") {
    const fim = agora.clone().add(2, "hours");
    const saudacao = agora.hour() < 12 ? "Bom dia" : agora.hour() < 18 ? "Boa tarde" : "Boa noite";
    const usuarioId = msg.key.participant || remetente;
    const nomeFormatado = "@" + usuarioId.split("@")[0];

    lavagemAtiva = {
      usuario: nomeFormatado,
      numero: remetente,
      inicio: agora.toDate(),
      fim: fim.toDate(),
    };

    await enviar({
      text: `${saudacao} ${nomeFormatado}! 🧺 Lavagem iniciada às ${formatarHorario(
        agora
      )}.\n⏱️ Termina às ${formatarHorario(fim)}`,
      mentions: [usuarioId],
    });

    setTimeout(async () => {
      await enviar({
        text: `🔔 ${nomeFormatado}, sua lavagem vai finalizar em 5 minutos.`,
        mentions: [usuarioId],
      });
    }, 1.55 * 60 * 60 * 1000);

    return;
  }

  // 📍 Seção 6 — Opção 4: Finalizar lavagem
  if (texto === "4") {
    if (!lavagemAtiva || lavagemAtiva.numero !== remetente) {
      return await enviar({ text: `⚠️ Nenhuma lavagem ativa ou você não está usando.` });
    }

    const fimLavagem = moment.tz("America/Sao_Paulo");
    const duracao = moment.duration(fimLavagem.diff(moment(lavagemAtiva.inicio)));
    const usuarioId = msg.key.participant || remetente;
    const nomeFormatado = "@" + usuarioId.split("@")[0];

    let resposta = `✅ Lavagem finalizada!\n👤 ${nomeFormatado}\n🕒 Duração: ${duracao.hours()}h ${duracao.minutes()}min\n`;
    resposta += duracao.asHours() > 2
      ? `⚠️ Tempo ultrapassado, ${nomeFormatado}!`
      : `🎉 Bom trabalho, ${nomeFormatado}!`;

    lavagemAtiva = null;
    await enviar({ text: resposta, mentions: [usuarioId] });

    if (filaDeEspera.length > 0) {
      const proximo = filaDeEspera.shift();
      await enviar({
        text: `🔔 @${proximo.split("@")[0]}, a máquina está livre!`,
        mentions: [proximo],
      });
    }
    return;
  }

  // 📍 Seção 7 — Opção 5: Entrar na fila
  if (texto === "5") {
    const usuarioId = msg.key.participant || remetente;
    const nomeFormatado = "@" + usuarioId.split("@")[0];

    if (filaDeEspera.includes(remetente)) {
      return await enviar({
        text: `⏳ ${nomeFormatado}, você já está na fila.`,
        mentions: [usuarioId],
      });
    }

    if (!lavagemAtiva) {
      return await enviar({
        text: `✅ A máquina está *livre*. Use a opção *3* para iniciar.`,
      });
    }

    filaDeEspera.push(remetente);
    const posicao = filaDeEspera.length;
    await enviar({
      text: `📝 ${nomeFormatado}, você foi adicionado à fila!\n🔢 Posição: ${posicao}`,
      mentions: [usuarioId],
    });
    return;
  }

  // 📍 Seção 8 — Opção 6: Sair da fila
  if (texto === "6") {
    const indice = filaDeEspera.indexOf(remetente);
    if (indice === -1) return await enviar({ text: `❌ Você não está na fila.` });

    filaDeEspera.splice(indice, 1);
    await enviar({ text: `🚪 Você saiu da fila.` });
    return;
  }

  // 📍 Seção 9 — Opção 7: Sortear roupas
  if (texto === "7") {
    const tipos = {
      camiseta: 0.3,
      calça: 0.6,
      toalha: 0.5,
      cama: 1.2,
      meia: 0.1,
      íntima: 0.15,
    };
    const proibidos = ["boné", "tênis", "travesseiro", "couro", "edredom", "tapete"];

    let totalKg = 0, lista = [];
    const chaves = Object.keys(tipos);
    while (totalKg < 7.5) {
      const tipo = chaves[Math.floor(Math.random() * chaves.length)];
      const qtd = Math.floor(Math.random() * 3) + 1;
      const peso = tipos[tipo] * qtd;
      if (totalKg + peso > 8) break;
      totalKg += peso;
      lista.push(`${qtd}x ${tipo} (~${peso.toFixed(1)}kg)`);
    }

    let mensagem = `🧺 *Exemplo de carga ideal:*\n\n${lista.join("\n")}\n\n⚖️ Total: ${totalKg.toFixed(2)}kg`;
    mensagem += `\n\n🚫 Não lavar:\n${proibidos.map(p => `- ${p}`).join("\n")}`;
    return await enviar({ text: mensagem });
  }

  // 📍 Seção 10 — Opção 8: Horário de funcionamento
  if (texto === "8") {
    const hora = agora.hour();
    let msg = "🕒 Horário: 07h às 22h.";
    if (hora >= 20) {
      msg += `\n⚠️ Após 20h a lavagem pode terminar no horário limite.`;
    }
    return await enviar({ text: msg });
  }

  // 📍 Seção 11 — Opção 9: Clima
  if (texto === "9") {
    try {
      const { data } = await axios.get("https://api.hgbrasil.com/weather?key=c657e670&city_name=Viamão,RS");
      const info = data.results;
      let descricao = info.temp > 30 ? "quente" : info.temp > 20 ? "agradável" : "frio";
      return await enviar({
        text: `🌦️ Clima em Viamão:\n🌡️ ${info.temp}°C - ${descricao}\n💧 Umidade: ${info.humidity}%\n💨 Vento: ${info.wind_speed} km/h`,
      });
    } catch (e) {
      return await enviar({ text: "❌ Erro ao obter o clima." });
    }
  }

  // 📍 Seção 12 — Opção 10: Coleta de lixo
  if (texto === "10") {
    return await enviar({
      text:
        `🗑️ *Coleta de Lixo em Viamão*\n\n` +
        `📅 Terça, Quinta e Sábado\n` +
        `⏰ Entre 8h e 22h\n` +
        `🚫 Sem materiais perigosos/baterias/etc.\n` +
        `🐾 Sacos fechados evitam bagunça.`,
    });
  }
}

module.exports = { tratarMensagemLavanderia };
