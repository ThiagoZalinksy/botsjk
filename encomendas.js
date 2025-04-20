// 📦 Módulo de Encomendas com prevenção contra duplicidade e controle de estado
const axios = require("axios");
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";

// Armazena estado de cada usuário
let estadosUsuarios = {};

// Define palavras-chave para ativar o bot
function verificaPalavrasChave(texto) {
  const palavrasChave = [
    "menu", "0", "entrega", "entregou", "encomenda", "recebi",
    "chegou", "chegada", "vai chegar", "está para chegar",
    "alguém recebeu", "quem recebeu"
  ];
  return palavrasChave.some(p => texto.includes(p));
}

// Função principal exportada para responder
async function tratarMensagemEncomendas(sock, msg) {
  try {
    if (!msg.message || msg.key.fromMe || msg.messageStubType) return; // ignora mensagens de status ou do próprio bot

    const remetente = msg.key.remoteJid;
    const textoUsuario = msg.message.conversation?.toLowerCase() || "";
    const idSessao = remetente + "_" + (msg.key.participant || "");
    const escolha = parseInt(textoUsuario, 10);
    const enviar = async (mensagem) => {
      await sock.sendMessage(remetente, typeof mensagem === "string" ? { text: mensagem } : mensagem);
    };

    // Inicializa sessão se relevante
    if (!estadosUsuarios[idSessao]) {
      if (verificaPalavrasChave(textoUsuario) || !isNaN(escolha)) {
        estadosUsuarios[idSessao] = { etapa: "menu" };
      } else {
        return; // ignora mensagens irrelevantes
      }
    }

    const estado = estadosUsuarios[idSessao];

    // Etapas do fluxo de mensagens
    switch (estado.etapa) {
      case "menu":
        await enviar("Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento");
        estado.etapa = "aguardandoEscolha";
        break;

      case "aguardandoEscolha":
        if (escolha === 1) {
          estado.etapa = "obterNome";
          await enviar("Qual o seu nome?");
        } else if (escolha === 2) {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          const resposta = data.length ? data.map(e =>
            `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : ""}`
          ).join("\n\n") : "Nenhuma encomenda encontrada.";
          await enviar(resposta);
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "confirmarNome";
          await enviar("De quem é essa encomenda?");
        } else {
          await enviar("Opção inválida. Por favor, escolha 1, 2 ou 3.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("Qual a data estimada de entrega? (Ex: dia/mês/ano)");
        break;

      case "obterData":
        estado.data = textoUsuario;
        estado.etapa = "obterLocal";
        await enviar("Onde a compra foi realizada? (Ex: Amazon, Mercado Livre)");
        break;

      case "obterLocal":
        estado.local = textoUsuario;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento"
        }]);
        await enviar(`Ok, ${estado.nome}! Sua encomenda chegará no dia ${estado.data} e foi comprada em ${estado.local}.`);
        delete estadosUsuarios[idSessao];
        break;

      case "confirmarNome":
        estado.nomeConfirmado = textoUsuario;
        estado.etapa = "confirmarRecebedor";
        await enviar("Quem está recebendo a encomenda?");
        break;

      case "confirmarRecebedor":
        const recebidoPor = textoUsuario;
        const { data: lista } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = lista.find(e => e.nome.toLowerCase() === estado.nomeConfirmado.toLowerCase() && e.status === "Aguardando Recebimento");

        if (encomenda) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(encomenda.nome)}`, {
            status: "Recebida",
            recebido_por: recebidoPor
          });
          await enviar(`Recebimento confirmado! ${encomenda.nome} recebeu sua encomenda, registrada por ${recebidoPor}.`);
        } else {
          await enviar(`Nenhuma encomenda pendente encontrada para ${estado.nomeConfirmado}.`);
        }
        delete estadosUsuarios[idSessao];
        break;

      default:
        await enviar("Algo deu errado. Envie 'Menu' para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
