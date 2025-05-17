const { google } = require("googleapis");
const fs = require("fs");

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const CREDENTIALS = JSON.parse(fs.readFileSync("credenciais.json")); // credenciais da conta de serviço
const SHEET_ID = "1-1or4UJu64CTPE4D7dba0De4UOqqMvUBNf0bgWBtIRo"; // substitua pelo ID da planilha

const auth = new google.auth.JWT(
  CREDENTIALS.client_email,
  null,
  CREDENTIALS.private_key,
  SCOPES
);
const sheets = google.sheets({ version: "v4", auth });

let estadosUsuarios = {};
let timeoutUsuarios = {};
const TEMPO_EXPIRACAO_MS = 10 * 60 * 1000;

function iniciarTimeout(idSessao) {
  if (timeoutUsuarios[idSessao]) clearTimeout(timeoutUsuarios[idSessao]);
  timeoutUsuarios[idSessao] = setTimeout(() => {
    console.log(`⌛ Sessão expirada: ${idSessao}`);
    delete estadosUsuarios[idSessao];
    delete timeoutUsuarios[idSessao];
  }, TEMPO_EXPIRACAO_MS);
}

async function lerSheet(nomeAba) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${nomeAba}!A1:Z1000`,
  });

  const [cabecalho, ...linhas] = res.data.values;
  return linhas.map((linha) =>
    Object.fromEntries(
      cabecalho.map((col, i) => [
        col.toLowerCase().replace(/\s/g, "_"),
        linha[i] || "",
      ])
    )
  );
}

async function escreverNaSheet(dados, aba = "Página1") {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${aba}!A1`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [dados] },
  });
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

    const sessaoAtiva = estadosUsuarios[idSessao];
    if (!sessaoAtiva && textoUsuario !== "0") return;

    if (textoUsuario === "0") {
      estadosUsuarios[idSessao] = { etapa: "menu" };
      iniciarTimeout(idSessao);
      await enviar("🔐 Iniciando módulo de encomendas...");
      await enviar(
        "Escolha uma opção:\n1. Registrar Encomenda\n2. Ver todas as Encomendas\n3. Confirmar Recebimento (via ID)\n4. Ver Histórico de Encomendas"
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
          const data = await lerSheet("Página1");
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
            encomendas.forEach((e) => {
              resposta += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                resposta += `\n📬 Recebido por: ${e.recebido_por}`;
              resposta += `\n\n`;
            });
          }

          await enviar(resposta.trim());
          delete estadosUsuarios[idSessao];
        } else if (escolha === 3) {
          estado.etapa = "informarID";
          await enviar("📦 Qual o ID da encomenda que deseja confirmar?");
        } else if (escolha === 4) {
          const historico = await lerSheet("Histórico");
          const preenchidos = historico.filter((linha) =>
            Object.values(linha).some((v) => v?.trim() !== "")
          );

          if (!preenchidos.length) {
            await enviar("📭 O histórico está vazio.");
            delete estadosUsuarios[idSessao];
            return;
          }

          const blocos = [];
          for (let i = 0; i < preenchidos.length; i += 5) {
            blocos.push(preenchidos.slice(i, i + 5));
          }

          for (const bloco of blocos) {
            let mensagem = "📜 Histórico de Encomendas:\n\n";
            bloco.forEach((e) => {
              mensagem += `🆔 ${e.id} 🛒 ${e.local} — ${e.data}\n👤 ${e.nome}\n📍 Status: ${e.status}`;
              if (e.recebido_por)
                mensagem += `\n📬 Recebido por: ${e.recebido_por}`;
              mensagem += `\n\n`;
            });
            await enviar(mensagem.trim());
          }

          delete estadosUsuarios[idSessao];
        } else {
          await enviar("Opção inválida. Por favor, escolha 1, 2, 3 ou 4.");
        }
        break;

      case "obterNome":
        estado.nome = textoUsuario;
        estado.etapa = "obterData";
        await enviar("Qual a data estimada de entrega? (Ex: dia/mês/ano)");
        break;

      case "obterData": {
        const partes = textoUsuario.split(/[./-]/);
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
          "Onde a compra foi realizada? (Ex: Shopee, Mercado Livre)"
        );
        break;
      }

      case "obterLocal": {
        estado.local = textoUsuario;
        const dados = await lerSheet("Página1");
        const ids = dados.map((e) => parseInt(e.id)).filter((n) => !isNaN(n));
        const proximoId = (Math.max(0, ...ids) + 1).toString();

        await escreverNaSheet(
          [
            proximoId,
            estado.nome,
            estado.data,
            estado.local,
            "Aguardando Recebimento",
          ],
          "Página1"
        );

        await enviar(
          `✅ Encomenda registrada para ${estado.nome}!\n🆔 ID: ${proximoId}\n🗓️ Chegada em: ${estado.data}\n🛒 Loja: ${estado.local}`
        );
        delete estadosUsuarios[idSessao];
        break;
      }

      case "informarID": {
        estado.idConfirmar = textoUsuario;
        const encomendas = await lerSheet("Página1");
        const enc = encomendas.find((e) => e.id === estado.idConfirmar);

        if (!enc || enc.status !== "Aguardando Recebimento") {
          await enviar("❌ ID inválido ou encomenda já recebida.");
          delete estadosUsuarios[idSessao];
          return;
        }

        estado.encomendaSelecionada = enc;
        estado.etapa = "confirmarRecebedor";
        await enviar("✋ Quem está recebendo essa encomenda?");
        break;
      }

      case "confirmarRecebedor": {
        const recebidoPor = textoUsuario;
        const enc = estado.encomendaSelecionada;

        // ⚠️ Atualizar célula específica na planilha exige índice (não incluso aqui por simplificação)
        await escreverNaSheet(
          [enc.id, enc.nome, enc.data, enc.local, "Recebida", recebidoPor],
          "Histórico"
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
