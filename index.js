const { tratarMensagemLavanderia } = require('./lavanderia');
const { tratarMensagemEncomendas } = require('./encomendas');
const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox']
  }
});

// Grupos autorizados para cada módulo
const gruposLavanderia = [
  'Lavanderia JK',
  'Teste Lavanderia 2'
];

const gruposEncomendas = [
  'Pousada JK Universitário',
  'Grupo JK Teste'
];

client.on('message', async msg => {
  const chat = await msg.getChat();

  if (!chat.isGroup) return;

  console.log(`📨 Mensagem recebida no grupo: ${chat.name} (ID: ${chat.id._serialized})`);

  if (gruposLavanderia.includes(chat.name)) {
    tratarMensagemLavanderia(msg, chat);
  } else if (gruposEncomendas.includes(chat.name)) {
    tratarMensagemEncomendas(msg, chat);
  } else {
    console.log(`⛔ Grupo "${chat.name}" não está na lista de grupos autorizados.`);
  }
});

client.on('ready', async () => {
  console.log('✅ Bot está pronto!');

  const chats = await client.getChats();
  console.log('\n📋 Lista de grupos disponíveis:');
  chats.forEach(chat => {
    if (chat.isGroup) {
      console.log(`- ${chat.name} | ID: ${chat.id._serialized}`);
    }
  });
});

client.initialize();
