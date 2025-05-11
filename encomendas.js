// 📦 Módulo de Encomendas com controle por lista
const axios = require("axios");
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";

let estadosUsuarios = {}; // Estado da sessão
let timeoutUsuarios = {}; // Timers de expiração
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000; // 5 minutos

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return;

    const remetente = msg.key.remoteJid;
    const textoUsuario = msg.message.conversation?.toLowerCase().trim() || "";
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const escolha = parseInt(textoUsuario, 10);

    const enviar = async (mensagem) => {
      await sock.sendMessage(
        remetente,
        typeof mensagem === "string" ? { text: mensagem } : mensagem
      );
    };

    // Só inicia ou continua sessão se usuário enviar "0" ou já estiver em sessão
    const sessaoAtiva = estadosUsuarios[idSessao];

    if (!sessaoAtiva && textoUsuario !== "0") return;

    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar("🔐 Iniciando módulo de encomendas...");
      await enviar(
        "Escolha uma opção:\n1. Registrar Encomenda\n2. Ver todas as Encomendas\n3. Confirmar Recebimento"
      );
      estadosUsuarios[idSessao].etapa = "aguardandoEscolha";
      return;
    }

    iniciarTimeout(idSessao);
    const estado = estadosUsuarios[idSessao];

    switch (estado.etapa) {
      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviar("Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);

          if (!data.length) {
            await enviar("📭 Nenhuma encomenda registrada ainda.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const agrupado = {};
          data.forEach((e) => {
            const nome = e.nome?.toLowerCase().trim() || "desconhecido";
            if (!agrupado[nome]) agrupado[nome] = [];
            agrupado[nome].push(e);
          });

          let resposta = `📦 Encomendas registradas:\n\n`;
          for (const [nome, encomendas] of Object.entries(agrupado)) {
            resposta += `👤 ${nome}\n`;
            encomendas.forEach((e, i) => {
              resposta += `${i + 1}. 🛒 ${e.local} — ${e.data}\n📍 Status: ${
                e.status
              }`;
              if (e.recebido_por)
                resposta += `\n📬 Recebido por: ${e.recebido_por}`;
              resposta += `\n\n`;
            });
          }

          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "confirmarNome";
          await enviar("👤 Qual o nome da pessoa que fez a compra?");
        } else {
          await enviar("Opção inválida. Por favor, escolha 1, 2 ou 3.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("Qual a data estimada de entrega? (Ex: dia/mês/ano)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[\/.-]/);
        if (partes.length !== 3)
          return await enviar("Formato inválido. Use dia/mês/ano.");

        let [dia, mes, ano] = partes.map((p) => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        const dataObj = new Date(ano, mes - 1, dia);
        if (dataObj.getDate() !== dia || dataObj.getMonth() !== mes - 1) {
          return await enviar("Data inválida.");
        }

        estado.data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(
          2,
          "0"
        )}/${ano}`;
        estado.etapa = "obterLocal";
        await enviar(
          "Onde a compra foi realizada? (Ex: Amazon, Mercado Livre)"
        );
        break;
      }

      case "obterLocal":
        estado.local = textoUsuario;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [
          {
            nome: estado.nome,
            data: estado.data,
            local: estado.local,
            status: "Aguardando Recebimento",
          },
        ]);
        await enviar(
          `✅ Encomenda registrada para ${estado.nome}!\n🗓️ Chegada em: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;

      case "confirmarNome":
        estado.nomeConfirmado = textoUsuario;
        const { data: encomendas } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const pendentes = encomendas.filter(
          (e) =>
            e.nome.toLowerCase() === textoUsuario &&
            e.status === "Aguardando Recebimento"
        );

        if (!pendentes.length) {
          await enviar("Nenhuma encomenda pendente encontrada.");
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.listaPendentes = pendentes;
        estado.etapa = "selecionarEncomenda";
        let listaTexto = `🔍 Encomendas pendentes para ${textoUsuario}:\n\n`;
        pendentes.forEach((e, i) => {
          listaTexto += `${i + 1}. 🛒 ${e.local} — ${e.data}\n`;
        });
        listaTexto += "\n✏️ Digite o número da encomenda que está recebendo:";
        await enviar(listaTexto);
        break;

      case "selecionarEncomenda": {
        const index = parseInt(textoUsuario, 10) - 1;
        const selecionada = estado.listaPendentes?.[index];

        if (!selecionada) {
          await enviar("Número inválido. Tente novamente.");
          return;
        }

        estado.encomendaSelecionada = selecionada;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        await axios.patch(
          `${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(enc.nome)}`,
          {
            status: "Recebida",
            recebido_por: recebidoPor,
          }
        );

        await enviar(
          `✅ Recebimento registrado!\n📦 ${enc.nome} — ${enc.local} em ${enc.data}\n📬 Recebido por: ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviar("Algo deu errado. Envie '0' para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
