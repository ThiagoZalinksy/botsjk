// [Mantém-se os imports e variáveis iniciais inalterados]

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
      msg.message.conversation?.toLowerCase().trim() ||
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
          text: "🧭 *Menu Principal*",
          buttonText: "Ver opções",
          sections: [
            {
              title: "📋 Selecione uma ação:",
              rows: [
                { title: "1 📝 Registrar Encomenda", rowId: "registrar" },
                { title: "2 🔍 Consultar Encomendas", rowId: "consultar" },
                { title: "3 📬 Confirmar Recebimento", rowId: "confirmar" },
              ],
            },
          ],
        });
        estado.etapa = "aguardandoEscolha";
        break;

      case "aguardandoEscolha":
        if (textoUsuario === "registrar") {
          estado.etapa = "obterNome";
          await enviar("🧑 Qual o *nome do destinatário*?");
        } else if (textoUsuario === "consultar") {
          estado.etapa = "consultarPorNome";
          await enviar(
            "🔎 Informe o *nome da pessoa* para consultar suas encomendas:"
          );
        } else if (textoUsuario === "confirmar") {
          estado.etapa = "confirmarNome";
          await enviar("✉️ Qual o *nome do comprador* da encomenda recebida?");
        } else {
          await enviar("⚠️ Opção inválida. Envie *0* para recomeçar.");
          delete estadosUsuarios[idSessao];
        }
        break;

      case "consultarPorNome": {
        const { data } = await axios.get(URL_SHEETDB_ENCOMENDAS);
        const lista = data.filter((e) => e.nome.toLowerCase() === textoUsuario);

        if (!lista.length) {
          await enviar("📭 Nenhuma encomenda encontrada para esse nome.");
          delete estadosUsuarios[idSessao];
          return;
        }

        let resposta = `📦 *Encomendas para* ${textoUsuario}:\n\n`;
        lista.forEach((e, i) => {
          resposta +=
            `*${i + 1}.* 🛍️ *${e.local}* - ${e.data}\n` +
            `📍 Status: ${e.status}${
              e.recebido_por ? `\n📬 Recebido por: ${e.recebido_por}` : ""
            }\n\n`;
        });

        await enviar(resposta.trim());
        delete estadosUsuarios[idSessao];
        break;
      }

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("📅 Informe a *data de entrega* (formato: dia/mês/ano):");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[\/\-.]/);
        if (partes.length !== 3)
          return await enviar("⚠️ Formato inválido. Use *dia/mês/ano*.");

        let [dia, mes, ano] = partes.map((p) => parseInt(p, 10));
        if (ano < 100) ano += 2000;
        const dataObj = new Date(ano, mes - 1, dia);
        if (dataObj.getDate() !== dia || dataObj.getMonth() !== mes - 1) {
          return await enviar("⚠️ Data inválida. Verifique e tente novamente.");
        }

        estado.data = `${String(dia).padStart(2, "0")}/${String(mes).padStart(
          2,
          "0"
        )}/${ano}`;
        estado.etapa = "obterLocal";
        await enviar("🏪 Onde a compra foi feita? (Ex: Amazon, Shopee)");
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
          `✅ Encomenda registrada!\n\n🧑 *Nome:* ${estado.nome}\n🗓️ *Entrega:* ${estado.data}\n🛍️ *Loja:* ${estado.local}`
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
          await enviar("📭 Nenhuma encomenda pendente encontrada.");
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.listaPendentes = pendentes;
        estado.etapa = "selecionarEncomenda";

        await sock.sendMessage(remetente, {
          text: `📬 *Encomendas pendentes para* ${textoUsuario}:`,
          buttonText: "Selecionar",
          sections: [
            {
              title: "Selecione qual encomenda foi recebida:",
              rows: pendentes.map((e, i) => ({
                title: `${e.local} — ${e.data}`,
                rowId: `encomenda_${i}`,
              })),
            },
          ],
        });

        break;

      case "selecionarEncomenda":
        if (!textoUsuario.startsWith("encomenda_")) {
          await enviar("⚠️ Escolha inválida. Tente novamente usando o menu.");
          return;
        }

        const index = parseInt(textoUsuario.split("_")[1], 10);
        const selecionada = estado.listaPendentes?.[index];

        if (!selecionada) {
          await enviar("⚠️ Número inválido.");
          return;
        }

        estado.encomendaSelecionada = selecionada;
        estado.etapa = "confirmarRecebedor";
        await enviar("🙋 Quem está *recebendo* a encomenda?");
        break;

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
          `✅ *Recebimento confirmado!*\n\n📦 ${enc.nome} — ${enc.local} em ${enc.data}\n📬 *Recebido por:* ${recebidoPor}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      default:
        await enviar("⚠️ Algo deu errado. Envie *0* para recomeçar.");
        delete estadosUsuarios[idSessao];
    }
  } catch (error) {
    console.error("❌ Erro no tratarMensagemEncomendas:", error.message);
  }
}

module.exports = { tratarMensagemEncomendas };
