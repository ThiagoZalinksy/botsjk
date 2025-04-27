// 📦 Módulo de Encomendas com prevenção contra duplicidade, controle de estado, logs, timeout e formatação de data
const axios = require("axios");
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";

let estadosUsuarios = {};       // Estado da sessão
let timeoutUsuarios = {};       // Timers de expiração
const TEMPO_EXPIRACAO_MS = 5 * 60 * 1000; // 5 minutos

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
      await sock.sendMessage(remetente, typeof mensagem === "string" ? { text: mensagem } : mensagem);
    };

    console.log(`📩 Mensagem de ${idSessao}: "${textoUsuario}"`);

    if (!estadosUsuarios[idSessao]) {
      if (textoUsuario === "0") {
        estadosUsuarios[idSessao] = { etapa: "menu" };
        iniciarTimeout(idSessao);
        console.log(`🆕 Nova sessão iniciada para ${idSessao}`);
      } else {
        return;
      }
    } else {
      iniciarTimeout(idSessao);
    }

    const estado = estadosUsuarios[idSessao];
    console.log(`🔄 Etapa atual de ${idSessao}: ${estado.etapa}`);

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
          clearTimeout(timeoutUsuarios[idSessao]);
        } else if (escolha === 3) {
          estado.etapa = "confirmarNome";
          await enviar("De quem é essa encomenda?");
        } else {
          await enviar("Opção inválida. Por favor, escolha 1, 2 ou 3.");
        }
        break;

      case "obterNome":
        if (!textoUsuario) return await enviar("Por favor, digite um nome válido.");
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("Qual a data estimada de entrega? (Ex: dia/mês/ano)");
        break;

      case "obterData":
        if (!textoUsuario) return await enviar("Digite uma data válida.");

        // Tenta interpretar e formatar a data
        const partes = textoUsuario.split(/[\/\-\.]/); // aceita barra, traço ou ponto
        if (partes.length !== 3) {
          return await enviar("Formato inválido. Use dia/mês/ano.");
        }

        let [dia, mes, ano] = partes.map(p => parseInt(p, 10));
        if (ano < 100) ano += 2000;

        const dataObj = new Date(ano, mes - 1, dia);
        if (dataObj.getDate() !== dia || dataObj.getMonth() !== mes - 1 || dataObj.getFullYear() !== ano) {
          return await enviar("Data inválida. Verifique se digitou corretamente.");
        }

        const dataFormatada = `${String(dia).padStart(2, "0")}/${String(mes).padStart(2, "0")}/${ano}`;

        estado.data = dataFormatada;
        estado.etapa = "obterLocal";
        await enviar("Onde a compra foi realizada? (Ex: Amazon, Mercado Livre)");
        break;

      case "obterLocal":
        if (!textoUsuario) return await enviar("Digite um local válido.");
        estado.local = textoUsuario;
        await axios.post(URL_SHEETDB_ENCOMENDAS, [{
          nome: estado.nome,
          data: estado.data,
          local: estado.local,
          status: "Aguardando Recebimento"
        }]);
        await enviar(`Ok, ${estado.nome}! Sua encomenda chegará no dia ${estado.data} e foi comprada em ${estado.local}.`);
        delete estadosUsuarios[idSessao];
        clearTimeout(timeoutUsuarios[idSessao]);
        break;

      case "confirmarNome":
        if (!textoUsuario) return await enviar("Digite um nome válido.");
        estado.nomeConfirmado = textoUsuario;
        estado.etapa = "confirmarRecebedor";
        await enviar("Quem está recebendo a encomenda?");
        break;

      case "confirmarRecebedor":
        if (!textoUsuario) return await enviar("Digite o nome de quem está recebendo.");
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
        clearTimeout(timeoutUsuarios[idSessao]);
        break;

      default:
        await enviar("Algo deu errado. Envie '0' para recomeçar.");
        delete estadosUsuarios[idSessao];
        clearTimeout(timeoutUsuarios[idSessao]);
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
