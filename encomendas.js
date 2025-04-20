const axios = require("axios");
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";

let estadosUsuarios = {};
let ultimasMensagens = {}; // evita processar a mesma msg várias vezes

function verificaPalavrasChave(texto) {
  const palavrasChave = [
    "menu", "0", "entrega", "entregou", "encomenda", "recebi",
    "chegou", "chegada", "vai chegar", "está para chegar",
    "alguém recebeu", "quem recebeu"
  ];
  return palavrasChave.some(p => texto.includes(p));
}

async function tratarMensagemEncomendas(sock, msg) {
  const remetente = msg.key.remoteJid;
  const idSessao = remetente;
  const textoUsuario = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    ""
  ).trim().toLowerCase();

  // ignora mensagens vazias ou repetidas
  if (!textoUsuario) return;
  if (ultimasMensagens[remetente] === textoUsuario) return;
  ultimasMensagens[remetente] = textoUsuario;

  const escolha = parseInt(textoUsuario, 10);
  let respostaTexto = "";

  if (!estadosUsuarios[idSessao]) {
    const ehNumero = !isNaN(escolha);
    const temPalavraChave = verificaPalavrasChave(textoUsuario);

    if (temPalavraChave || ehNumero) {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      // Reseta estado após 5 minutos
      setTimeout(() => delete estadosUsuarios[idSessao], 5 * 60 * 1000);
    } else {
      return;
    }
  }

  const estadoUsuario = estadosUsuarios[idSessao];

  const enviar = async (mensagem) => {
    try {
      await sock.sendMessage(remetente, { text: mensagem });
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem:", err.message);
    }
  };

  try {
    switch (estadoUsuario.etapa) {
      case "menu":
      case "aguardandoEscolha":
        if (!isNaN(escolha)) {
          if (escolha === 0) {
            respostaTexto = "Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento";
            estadoUsuario.etapa = "aguardandoEscolha";
          } else if (escolha === 1) {
            estadoUsuario.etapa = "obterNome";
            respostaTexto = "Qual o seu nome?";
          } else if (escolha === 2) {
            const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
            respostaTexto = data.length
              ? data.map(e =>
                  `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : ""}`
                ).join("\n\n")
              : "Nenhuma encomenda encontrada.";
            delete estadosUsuarios[idSessao];
          } else if (escolha === 3) {
            estadoUsuario.etapa = "confirmarNome";
            respostaTexto = "De quem é essa encomenda?";
          } else {
            respostaTexto = "Opção inválida. Por favor, escolha 1, 2 ou 3.";
          }
        } else {
          if (textoUsuario.includes("encomenda")) {
            respostaTexto = "Escolha uma opção:\n1. Registrar Encomenda\n2. Consultar Encomendas\n3. Confirmar Recebimento";
            estadoUsuario.etapa = "aguardandoEscolha";
          } else if (textoUsuario.includes("consultar")) {
            const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
            respostaTexto = data.length
              ? data.map(e =>
                  `Nome: ${e.nome}\nData Estimada: ${e.data}\nCompra em: ${e.local}\nStatus: ${e.status}${e.recebido_por ? `\nRecebido por: ${e.recebido_por}` : ""}`
                ).join("\n\n")
              : "Nenhuma encomenda encontrada.";
            delete estadosUsuarios[idSessao];
          } else if (textoUsuario.includes("confirmar") || textoUsuario.includes("recebi")) {
            estadoUsuario.etapa = "confirmarNome";
            respostaTexto = "De quem é essa encomenda?";
          } else {
            respostaTexto = "Desculpe, não entendi. Envie \"0\" para ver o menu.";
          }
        }
        break;

      case "obterNome":
        estadoUsuario.nome = textoUsuario;
        estadoUsuario.etapa = "obterData";
        respostaTexto = "Qual a data estimada de entrega? (Ex: dia/mês/ano)";
        break;

      case "obterData":
        estadoUsuario.data = textoUsuario;
        estadoUsuario.etapa = "obterLocal";
        respostaTexto = "Onde a compra foi realizada? (Ex: Amazon, Mercado Livre, Farmácia Delivery)";
        break;

      case "obterLocal":
        estadoUsuario.local = textoUsuario;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          nome: estadoUsuario.nome,
          data: estadoUsuario.data,
          local: estadoUsuario.local,
          status: "Aguardando Recebimento"
        }]);
        respostaTexto = `Ok, ${estadoUsuario.nome}! Sua encomenda chegará no dia ${estadoUsuario.data} e foi comprada em ${estadoUsuario.local}.`;
        delete estadosUsuarios[idSessao];
        break;

      case "confirmarNome":
        estadoUsuario.nomeConfirmado = textoUsuario;
        estadoUsuario.etapa = "confirmarRecebedor";
        respostaTexto = "Quem está recebendo a encomenda?";
        break;

      case "confirmarRecebedor":
        const recebidoPor = textoUsuario;
        const { data: lista } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const encomenda = lista.find(e => e.nome === estadoUsuario.nomeConfirmado && e.status === "Aguardando Recebimento");

        if (encomenda) {
          await axios.patch(`${URL_SHEETDB_ENCOMENDAS}/nome/${encodeURIComponent(estadoUsuario.nomeConfirmado)}`, {
            status: "Recebida",
            recebido_por: recebidoPor
          });
          respostaTexto = `Recebimento confirmado! ${estadoUsuario.nomeConfirmado} recebeu sua encomenda, registrada por ${recebidoPor}.`;
        } else {
          respostaTexto = `Nenhuma encomenda pendente encontrada para ${estadoUsuario.nomeConfirmado}.`;
        }
        delete estadosUsuarios[idSessao];
        break;

      default:
        respostaTexto = "Algo deu errado, tente novamente.";
        delete estadosUsuarios[idSessao];
    }

    await enviar(respostaTexto);
  } catch (error) {
    console.error("Erro:", error);
    await enviar("Ocorreu um erro, tente novamente mais tarde.");
    delete estadosUsuarios[idSessao];
  }
}

module.exports = { tratarMensagemEncomendas };
