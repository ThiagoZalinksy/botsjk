const axios = require("axios");
const URL_SHEETDB_ENCOMENDAS = "https://sheetdb.io/api/v1/g6f3ljg6px6yr";

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 5 * 60 * 1000;

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
    const textoUsuario =
      msg.message?.conversation?.toLowerCase().trim() ||
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
      "";

    const idSessao = remetente + "_" + (msg.key.participant || "");
    const enviar = async (mensagem) => {
      await sock.sendMessage(
        remetente,
        typeof mensagem === "string" ? { text: mensagem } : mensagem
      );
    };

    if (!estadosUsuarios[idSessao]) {
      if (textoUsuario === "0") {
        estadosUsuarios[idSessao] = { etapa: "menu" };
        iniciarTimeout(idSessao);
      } else return;
    } else iniciarTimeout(idSessao);

    const estado = estadosUsuarios[idSessao];

    switch (estado.etapa) {
      case "menu":
        await sock.sendMessage(remetente, {
          text: "📦 Bem-vindo ao sistema de encomendas. Escolha uma opção:",
          buttons: [
            {
              buttonId: "registrar",
              buttonText: { displayText: "1. Registrar Encomenda" },
              type: 1,
            },
            {
              buttonId: "consultar",
              buttonText: { displayText: "2. Consultar Encomendas" },
              type: 1,
            },
            {
              buttonId: "confirmar",
              buttonText: { displayText: "3. Confirmar Recebimento" },
              type: 1,
            },
          ],
          headerType: 1,
        });
        estado.etapa = "aguardandoEscolhaBotao";
        break;

      case "aguardandoEscolhaBotao":
        if (textoUsuario === "registrar") {
          estado.etapa = "obterNome";
          await enviar("👤 Qual o seu nome?");
        } else if (textoUsuario === "consultar") {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          const nomesUnicos = [...new Set(data.map((e) => e.nome))];

          await sock.sendMessage(remetente, {
            text: "👥 Escolha o nome para consultar as encomendas:",
            sections: [
              {
                title: "Clientes",
                rows: nomesUnicos.map((nome) => ({
                  title: nome,
                  rowId: `consultar_${nome.toLowerCase()}`,
                })),
              },
            ],
            buttonText: "Ver Nomes",
            headerType: 1,
          });

          estado.etapa = "aguardandoNomeConsulta";
        } else if (textoUsuario === "confirmar") {
          const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
          const nomesPendentes = [
            ...new Set(
              data
                .filter((e) => e.status === "Aguardando Recebimento")
                .map((e) => e.nome)
            ),
          ];

          if (!nomesPendentes.length) {
            await enviar("Nenhuma encomenda pendente.");
            delete estadosUsuarios[idSessao];
            return;
          }

          await sock.sendMessage(remetente, {
            text: "👥 Quem está recebendo a encomenda?",
            sections: [
              {
                title: "Clientes Pendentes",
                rows: nomesPendentes.map((nome) => ({
                  title: nome,
                  rowId: `confirmar_${nome.toLowerCase()}`,
                })),
              },
            ],
            buttonText: "Ver Nomes",
            headerType: 1,
          });

          estado.etapa = "aguardandoNomeConfirmacao";
        }
        break;

      case "aguardandoNomeConsulta": {
        if (!textoUsuario.startsWith("consultar_")) return;
        const nome = textoUsuario.replace("consultar_", "").trim();
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const lista = data.filter((e) => e.nome.toLowerCase() === nome);

        if (!lista.length) {
          await enviar("Nenhuma encomenda encontrada.");
          delete estadosUsuarios[idSessao];
          return;
        }

        await sock.sendMessage(remetente, {
          text: `📦 Encomendas para ${nome}`,
          sections: [
            {
              title: "Encomendas Encontradas",
              rows: lista.map((e, i) => ({
                title: `${e.local} — ${e.data}`,
                description: `Status: ${e.status}`,
                rowId: `detalhes_${i}`,
              })),
            },
          ],
          buttonText: "Ver Encomendas",
          headerType: 1,
        });

        estado.listaConsultada = lista;
        estado.etapa = "aguardandoSelecaoEncomenda";
        break;
      }

      case "aguardandoSelecaoEncomenda": {
        if (!textoUsuario.startsWith("detalhes_")) return;
        const index = parseInt(textoUsuario.replace("detalhes_", ""), 10);
        const encomenda = estado.listaConsultada?.[index];

        if (!encomenda) {
          await enviar("Encomenda inválida.");
          return;
        }

        await enviar(
          `📦 *Detalhes da Encomenda:*\n\n🛒 Loja: ${
            encomenda.local
          }\n📅 Data: ${encomenda.data}\n📍 Status: ${encomenda.status}${
            encomenda.recebido_por
              ? `\n📬 Recebido por: ${encomenda.recebido_por}`
              : ""
          }`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Qual a data estimada de entrega? (Ex: 11/05/2025)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[\/\-.]/);
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
        await enviar("🛍️ Onde a compra foi realizada?");
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
          `✅ Encomenda registrada!\n\n👤 Nome: ${estado.nome}\n📅 Data: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;

      case "aguardandoNomeConfirmacao": {
        if (!textoUsuario.startsWith("confirmar_")) return;
        const nome = textoUsuario.replace("confirmar_", "").trim();
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const pendentes = data.filter(
          (e) =>
            e.nome.toLowerCase() === nome &&
            e.status === "Aguardando Recebimento"
        );

        if (!pendentes.length) {
          await enviar("Nenhuma encomenda pendente para este nome.");
          delete estadosUsuarios[idSessao];
          return;
        }

        await sock.sendMessage(remetente, {
          text: `📦 Encomendas pendentes para ${nome}`,
          sections: [
            {
              title: "Selecione a encomenda recebida",
              rows: pendentes.map((e, i) => ({
                title: `${e.local} — ${e.data}`,
                rowId: `receber_${i}`,
              })),
            },
          ],
          buttonText: "Ver Encomendas",
          headerType: 1,
        });

        estado.listaPendentes = pendentes;
        estado.nomeConfirmado = nome;
        estado.etapa = "aguardandoSelecaoRecebimento";
        break;
      }

      case "aguardandoSelecaoRecebimento": {
        if (!textoUsuario.startsWith("receber_")) return;
        const index = parseInt(textoUsuario.replace("receber_", ""), 10);
        const selecionada = estado.listaPendentes?.[index];

        if (!selecionada) return await enviar("Encomenda inválida.");
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
          `✅ Recebimento registrado!\n📦 ${enc.local} em ${enc.data}\n📬 Recebido por: ${recebidoPor}`
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
