const express = require('express');
const bodyParser = require('body-parser');
const moment = require('moment-timezone');
const axios = require('axios');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const hgBrasilAPIKey = 'c657e670';
let fila = [];
let lavagens = [];

const uri = "mongodb+srv://jkuniversitario421:<M@iden25654545>@cluster0.jz5ul.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Funções de banco de dados
async function criarUsuario(telefone, nome) {
    try {
        await client.connect();
        const db = client.db("botdb");
        const usuariosCollection = db.collection('usuarios');
        const usuarioExistente = await usuariosCollection.findOne({ telefone });
        if (usuarioExistente) return 'Usuário já existe!';
        const result = await usuariosCollection.insertOne({ telefone, nome });
        return result.acknowledged ? `Usuário ${nome} criado com sucesso!` : 'Falha ao criar usuário!';
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        return 'Erro ao criar usuário!';
    }
}

async function buscarUsuarioPorTelefone(telefone) {
    try {
        await client.connect();
        const db = client.db("botdb");
        const usuariosCollection = db.collection('usuarios');
        const usuario = await usuariosCollection.findOne({ telefone });
        return usuario ? usuario.nome : 'Usuário';
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        return 'Usuário';
    }
}

async function excluirUsuario(telefone) {
    try {
        await client.connect();
        const db = client.db("botdb");
        const usuariosCollection = db.collection('usuarios');
        const result = await usuariosCollection.deleteOne({ telefone });
        return result.deletedCount ? 'Usuário excluído com sucesso.' : 'Usuário não encontrado.';
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        return 'Erro ao excluir usuário!';
    }
}

// Funções auxiliares
function isValidTimeToUseMachine() {
    const now = moment().tz("America/Sao_Paulo").hour();
    return now >= 7 && now < 22;
}

const menuOptions = `
Escolha uma das opções abaixo:
1️⃣ Para saber como usar 🤷‍♀️🤷‍♂️
2️⃣ Informações técnicas 🧰
3️⃣ Iniciar lavagem 🔛
4️⃣ Finalizar lavagem 🔚
5️⃣ Entrar na fila de lavagem 🚶🚶🚶
6️⃣ Desistir da fila de lavagem 🚶🚶
7️⃣ Tabela de peso das roupas 👖🩲👗👕👚
8️⃣ Horário de funcionamento 🕒🕗🕤
9️⃣ Previsão do tempo ⛈️☀️🌤️🌨️
🔟 Dias de coleta de lixo ♻️
`;

// Webhook
app.post('/webhook', async (req, res) => {
    const intentName = req.body.queryResult.intent.displayName;
    const option = Number(req.body.queryResult.queryText);
    const telefone = req.body.originalDetectIntentRequest.payload.data?.from || '';
    const user = await buscarUsuarioPorTelefone(telefone);

    if (intentName === 'Mostrar Menu') {
        return res.json({ fulfillmentText: menuOptions });
    }

    switch (option) {
        case 1:
            return res.json({ fulfillmentText: `👋 Olá! Para usar a lavanderia:\n1. Entre na fila (opção 5).\n2. Quando chegar sua vez, inicie a lavagem (opção 3).\n3. Finalize quando terminar (opção 4).\n4. Caso mude de ideia, desista da fila (opção 6).` });

        case 2:
            return res.json({ fulfillmentText: `🧰 Informações técnicas:\n- Capacidade: 10kg\n- Tempo médio: 2h\n- Voltagem: 220V\n- Detergente automático.` });

        case 3: {
            const now = moment().tz("America/Sao_Paulo");
            if (!isValidTimeToUseMachine()) {
                return res.json({ fulfillmentText: '⛔ Lavanderia fechada. Horário: 7:00 às 22:00.' });
            }
            if (now.hour() === 20) {
                return res.json({ fulfillmentText: '🚨 Esta é a última lavagem do dia! 🚨' });
            }
            const endTime = now.clone().add(2, 'hours');
            lavagens.push({ user, startTime: now.toISOString(), endTime: endTime.toISOString() });
            setTimeout(() => {
                const msg = `🔔 Sua lavagem vai finalizar em 5 minutos!`;
                console.log(`Lembrete: https://api.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(msg)}`);
            }, 115 * 60 * 1000);

            return res.json({
                fulfillmentText: `🔛 Lavagem iniciada para *${user}*\n🕐 Início: ${now.format('HH:mm')}\n⏰ Término: ${endTime.format('HH:mm')}`
            });
        }

        case 4: {
            const now = moment().tz("America/Sao_Paulo");
            const lavagem = lavagens.find(l => l.user === user);
            if (lavagem) {
                const duration = now.diff(moment(lavagem.startTime), 'minutes');
                lavagens = lavagens.filter(l => l.user !== user);
                const aviso = duration > 120 ? '⚠️ Passou do tempo recomendado!' : '✅ Lavagem finalizada dentro do tempo!';
                return res.json({ fulfillmentText: `🏁 Lavagem finalizada!\n⏳ Duração: ${duration} minutos\n${aviso}` });
            } else {
                return res.json({ fulfillmentText: '🚫 Nenhuma lavagem em andamento encontrada para você.' });
            }
        }

        case 5:
            if (!fila.includes(user)) {
                fila.push(user);
                return res.json({ fulfillmentText: `🚶 Você entrou na fila.\n📃 Posição atual: ${fila.length}` });
            } else {
                return res.json({ fulfillmentText: '⚠️ Você já está na fila.' });
            }

        case 6:
            if (fila.includes(user)) {
                fila = fila.filter(u => u !== user);
                return res.json({ fulfillmentText: '🚶‍♂️ Você saiu da fila com sucesso.' });
            } else {
                return res.json({ fulfillmentText: '❌ Você não está na fila.' });
            }

        case 7:
            return res.json({
                fulfillmentText: `📏 Tabela de peso (média):\n👕 Camiseta: 0.2kg\n👖 Calça jeans: 0.6kg\n🩲 Roupas íntimas: 0.1kg\n👗 Vestido: 0.4kg\n🧦 Meias: 0.05kg`
            });

        case 8: {
            const now = moment().tz("America/Sao_Paulo");
            const closing = moment().tz("America/Sao_Paulo").set({ hour: 22, minute: 0 });
            const lastStart = closing.clone().subtract(2, 'hours');
            return now.isBefore(closing) ?
                res.json({ fulfillmentText: `🕒 Horário: 7h às 22h.\nVocê ainda pode iniciar uma lavagem.` }) :
                res.json({ fulfillmentText: '⛔ A lavanderia está fechada agora.' });
        }

        case 9: {
            try {
                const response = await axios.get(`https://api.hgbrasil.com/weather?key=${hgBrasilAPIKey}&city_name=Sao_Paulo,SP`);
                const clima = response.data.results;
                return res.json({
                    fulfillmentText: `🌦️ Clima em ${clima.city}:\n🌡️ ${clima.temp}°C\n☁️ ${clima.description}\n💨 Vento: ${clima.wind_speedy}`
                });
            } catch (error) {
                console.error('Erro na previsão:', error);
                return res.json({ fulfillmentText: 'Erro ao obter a previsão do tempo.' });
            }
        }

        case 10:
        case 0: // para usuários que enviam '10' como número
            return res.json({
                fulfillmentText: `♻️ Dias de coleta de lixo:\n- Orgânico: Segunda, Quarta e Sexta\n- Reciclável: Terça e Quinta\n- Volumosos: Último sábado do mês`
            });

        default:
            return res.json({ fulfillmentText: '❌ Opção inválida. Escolha uma opção do menu.' });
    }
});

// Rotas auxiliares
app.post('/criar-usuario', async (req, res) => {
    const { telefone, nome } = req.body;
    const response = await criarUsuario(telefone, nome);
    res.json({ fulfillmentText: response });
});

app.post('/excluir-usuario', async (req, res) => {
    const { telefone } = req.body;
    const response = await excluirUsuario(telefone);
    res.json({ fulfillmentText: response });
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});
