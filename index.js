// ================== IMPORTS ==================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
} = require("@whiskeysockets/baileys");
const P = require("pino");
const express = require("express");
const axios = require("axios");
const QRCode = require("qrcode");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
require("dotenv").config();

const { tratarMensagemLavanderia } = require("./lavanderia");
const { tratarMensagemEncomendas } = require("./encomendas");

// ================== CONFIG ==================
const SHEETDB_URLS = {
  lavanderia: "https://sheetdb.io/api/v1/6h68ahmnmf21d",
  jk: "https://sheetdb.io/api/v1/8u96k45bg8b1x",
};

let sock;
let qrCodeAtual = null;
let tentandoReconectar = false;
let eventosDoDia = [];

// ================== EMAIL ==================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ================== FUNÇÕES ==================
async function registrarEvento(tipoPlanilha, numero, nomeGrupo, mensagem) {
  const dataHora = new Date().toLocaleString("pt-BR", {
    timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
  });
  const url = SHEETDB_URLS[tipoPlanilha];
  if (!url)
    return console.warn("⚠️ URL do SheetDB não configurada para", tipoPlanilha);

  eventosDoDia.push({
    usuario: `@${numero}`,
    mensagem,
    grupo: nomeGrupo,
    dataHora,
  });

  try {
    await axios.post(url, {
      data: [{ usuario: `@${numero}`, mensagem, grupo: nomeGrupo, dataHora }],
    });
    console.log(`✅ Evento registrado (${tipoPlanilha}): ${mensagem}`);
  } catch (err) {
    console.warn("⚠️ Erro ao registrar evento no SheetDB:", err.message);
  }
}

function gerarPDFs(eventos, dataHoje) {
  const MAX_EVENTOS_POR_PDF = 1000;
  const pdfPaths = [];

  for (let i = 0; i < eventos.length; i += MAX_EVENTOS_POR_PDF) {
    const doc = new PDFDocument({ margin: 30, size: "A4" });
    const parte = eventos.slice(i, i + MAX_EVENTOS_POR_PDF);
    const filename = `Relatorio_${dataHoje.replace(/\//g, "-")}_parte${
      Math.floor(i / MAX_EVENTOS_POR_PDF) + 1
    }.pdf`;
    doc.pipe(fs.createWriteStream(filename));

    doc
      .fontSize(16)
      .text(
        `Relatório diário - ${dataHoje} (Parte ${
          Math.floor(i / MAX_EVENTOS_POR_PDF) + 1
        })`,
        { align: "center" }
      );
    doc.moveDown();
    doc.fontSize(12);
    parte.forEach((e) =>
      doc.text(`${e.dataHora} - ${e.grupo} - ${e.usuario} - ${e.mensagem}`)
    );

    doc.end();
    pdfPaths.push(filename);
  }

  return pdfPaths;
}

function enviarRelatorioPDF() {
  if (eventosDoDia.length === 0) return;

  const dataHoje = new Date().toLocaleDateString("pt-BR");
  const pdfPaths = gerarPDFs(eventosDoDia, dataHoje);

  pdfPaths.forEach((pdfPath, i) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.RELATORIO_EMAIL || process.env.EMAIL_USER,
      subject: `📊 Relatório diário - ${dataHoje} (Parte ${i + 1})`,
      text: `Segue em anexo o relatório diário de eventos e mensagens.`,
      attachments: [{ filename: pdfPath, path: pdfPath }],
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.error("❌ Erro ao enviar e-mail:", err.message);
      else
        console.log(
          `✅ Relatório PDF enviado (Parte ${i + 1}):`,
          info.response
        );

      fs.unlink(pdfPath, (err) => {
        if (err) console.error("❌ Erro ao deletar PDF:", err.message);
      });
    });
  });

  eventosDoDia = [];
}

// Agendar envio diário
const agora = new Date();
const msAteMeiaNoite =
  new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() + 1,
    0,
    0,
    5
  ) - agora;
setTimeout(function enviarEReagendar() {
  enviarRelatorioPDF();
  setInterval(enviarRelatorioPDF, 24 * 60 * 60 * 1000);
}, msAteMeiaNoite);

// ================== START BOT ==================
async function iniciar() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState("auth");
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger: P({ level: "silent" }),
      browser: ["JKBot", "Chrome", "120.0.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);

    // 📩 Mensagens recebidas
    sock.ev.on("messages.upsert", async ({ messages }) => {
      const msg = messages[0];
      const remetente = msg.key.remoteJid;

      if (
        !msg.message ||
        msg.key.fromMe ||
        msg.message.protocolMessage ||
        msg.message.reactionMessage
      )
        return;

      console.log("💬 Mensagem recebida de", remetente);

      try {
        await tratarMensagemLavanderia(sock, msg);
        await tratarMensagemEncomendas(sock, msg);

        // Registrar no log diário
        const numero = msg.key.participant?.split("@")[0] || "desconhecido";
        const nomeGrupo = msg.key.remoteJid || "privado";
        const tipo = nomeGrupo.toLowerCase().includes("lavanderia")
          ? "lavanderia"
          : "jk";
        const texto = msg.message.conversation;
        await registrarEvento(tipo, numero, nomeGrupo, `Mensagem: ${texto}`);
      } catch (err) {
        console.error("❗ Erro ao tratar mensagem:", err.message);
        try {
          await sock.sendMessage(remetente, {
            text: "⚠️ Ocorreu um erro ao processar sua mensagem.",
          });
        } catch {}
      }
    });

    // 👥 Entrada/Saída de membros
    sock.ev.on("group-participants.update", async (update) => {
      try {
        const metadata = await sock.groupMetadata(update.id);
        const nomeGrupo = metadata.subject;
        for (let participante of update.participants) {
          const numero = participante.split("@")[0];
          const tipo = nomeGrupo.toLowerCase().includes("lavanderia")
            ? "lavanderia"
            : "jk";
          const dataHora = new Date().toLocaleString("pt-BR", {
            timeZone: process.env.TIMEZONE || "America/Sao_Paulo",
          });

          if (update.action === "add") {
            await sock.sendMessage(update.id, {
              text: `👋 Olá @${numero}! Seja bem-vindo(a) ao grupo *${nomeGrupo}* 🎉\n\nDigite *menu* para lavanderia 🧺 ou *0* para encomendas 📦.`,
              mentions: [participante],
            });
            console.log(`✅ Novo integrante no grupo ${nomeGrupo}: ${numero}`);
            await registrarEvento(tipo, numero, nomeGrupo, `Entrou no grupo`);
          } else if (update.action === "remove") {
            await sock.sendMessage(update.id, {
              text: `👋 @${numero} saiu do grupo *${nomeGrupo}*`,
              mentions: [participante],
            });
            console.log(`ℹ️ Integrante saiu do grupo ${nomeGrupo}: ${numero}`);
            await registrarEvento(tipo, numero, nomeGrupo, `Saiu do grupo`);
          }
        }
      } catch (err) {
        console.error("❌ Erro no evento de participante:", err.message);
      }
    });

    // 🔄 Conexão e QR code
    sock.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          qrCodeAtual = await QRCode.toDataURL(qr);
          console.log("📱 QR Code disponível em /qr");
        } catch (err) {
          console.error("❌ Erro ao gerar QR:", err.message);
        }
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        console.log(`⚠️ Conexão encerrada (${code})`);
        if (!tentandoReconectar && code !== DisconnectReason.loggedOut) {
          tentandoReconectar = true;
          console.log("🔄 Tentando reconectar em 15s...");
          setTimeout(async () => {
            tentandoReconectar = false;
            await iniciar();
          }, 15000);
        } else {
          qrCodeAtual = null;
          console.log(
            "❌ Sessão finalizada. Será necessário escanear o QR novamente."
          );
        }
      } else if (connection === "open") {
        tentandoReconectar = false;
        qrCodeAtual = null;
        console.log("✅ Bot conectado ao WhatsApp!");
      }
    });
  } catch (err) {
    console.error("❌ Erro crítico no iniciar():", err.message);
    console.log("🔁 Reiniciando em 20 segundos...");
    setTimeout(iniciar, 20000);
  }
}

// ▶️ Inicia o bot
iniciar().catch((err) => console.error("❌ Erro ao iniciar WhatsApp:", err));

// ================== SERVIDOR WEB ==================
const app = express();

app.get("/", (_, res) => {
  res.send(`
    <html><head><meta charset="utf-8"/><title>Bot Status</title></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#f0f0f0;">
      <h1>🤖 WhatsApp Bot Render Edition</h1>
      <p>Status: <b>Rodando com sucesso!</b></p>
      <p>O bot responde automaticamente em qualquer grupo.</p>
      <a href="/qr" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">📱 Ver QR Code</a>
    </body></html>
  `);
});

app.get("/qr", (_, res) => {
  if (qrCodeAtual) {
    res.send(`
      <html><body style="text-align:center;font-family:sans-serif;padding:30px;">
        <h1>📱 QR Code WhatsApp</h1>
        <img src="${qrCodeAtual}" style="border:10px solid #25D366;border-radius:10px"/>
        <p>Abra o WhatsApp → Dispositivos Conectados → Conectar um dispositivo</p>
        <a href="/">← Voltar</a>
      </body></html>
    `);
  } else {
    res.send("<h2>✅ Bot já conectado ou aguardando novo QR...</h2>");
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 Servidor web rodando na porta ${PORT}`)
);
