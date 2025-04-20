const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const P = require('pino');
const encomendas = require('./encomendas');
const lavanderia = require('./lavanderia');

// IDs dos grupos autorizados para cada módulo
const gruposLavanderia = ['120363199237079135@g.us', '120363022448389291@g.us'];
const gruposEncomendas = ['120363192568615063@g.us', '120363200415230206@g.us'];

async function startSock() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        version: [2, 2323, 4]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (let msg of messages) {
            if (!msg.message) return;

            const from = msg.key.remoteJid;
            const mensagemTexto = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

            // Log: ID dos grupos
            console.log(`Mensagem recebida do grupo: ${from} | Conteúdo: ${mensagemTexto}`);

            // Ignora se não for grupo
            if (!from.endsWith('@g.us')) return;

            if (gruposLavanderia.includes(from)) {
                await lavanderia.handle(sock, msg);
            } else if (gruposEncomendas.includes(from)) {
                await encomendas.handle(sock, msg);
            } else {
                console.log(`Grupo ${from} não está autorizado para nenhum módulo.`);
            }
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão encerrada. Reconectar?', shouldReconnect);
            if (shouldReconnect) {
                startSock();
            }
        } else if (connection === 'open') {
            console.log('✅ Conectado com sucesso ao WhatsApp');
        }
    });
}

startSock();
