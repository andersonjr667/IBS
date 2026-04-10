const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const runtimeStore = {
    contatos: [],
    doacoes: [],
    cultos: [
        {
            _id: 'culto-domingo-manha',
            nome: 'Culto de Celebração',
            descricao: 'Celebração com louvor, comunhão e mensagem bíblica para toda a família.',
            diaSemana: 'domingo',
            horario: '10:00',
            tipo: 'celebracao',
            participantes: 0,
            transmissaoAoVivo: false,
            ativo: true,
            local: {
                endereco: 'Rua Aiuruoca, 125 - São Paulo, Belo Horizonte - MG'
            },
            ministro: {
                nome: 'Equipe Pastoral',
                funcao: 'Liderança espiritual'
            }
        },
        {
            _id: 'culto-domingo-noite',
            nome: 'Culto da Família',
            descricao: 'Encontro de adoração, acolhimento e fortalecimento da fé para todas as gerações.',
            diaSemana: 'domingo',
            horario: '19:00',
            tipo: 'familia',
            participantes: 0,
            transmissaoAoVivo: false,
            ativo: true,
            local: {
                endereco: 'Rua Aiuruoca, 125 - São Paulo, Belo Horizonte - MG'
            },
            ministro: {
                nome: 'Equipe Pastoral',
                funcao: 'Liderança espiritual'
            }
        },
        {
            _id: 'culto-quinta-noite',
            nome: 'Culto de Oração',
            descricao: 'Culto voltado para intercessão, estudo bíblico e fortalecimento espiritual.',
            diaSemana: 'quinta',
            horario: '20:00',
            tipo: 'oracao',
            participantes: 0,
            transmissaoAoVivo: false,
            ativo: true,
            local: {
                endereco: 'Rua Aiuruoca, 125 - São Paulo, Belo Horizonte - MG'
            },
            ministro: {
                nome: 'Equipe Pastoral',
                funcao: 'Liderança espiritual'
            }
        }
    ]
};

function isDatabaseReady() {
    return mongoose.connection.readyState === 1;
}

function createRuntimeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

let cachedTransporter;

function getMailer() {
    if (cachedTransporter !== undefined) {
        return cachedTransporter;
    }

    const {
        SMTP_HOST,
        SMTP_PORT,
        SMTP_USER,
        SMTP_PASS
    } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
        cachedTransporter = null;
        return cachedTransporter;
    }

    cachedTransporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    return cachedTransporter;
}

async function sendEmailSafe(payload) {
    const transporter = getMailer();

    if (!transporter) {
        return { sent: false, reason: 'smtp_not_configured' };
    }

    try {
        await transporter.sendMail(payload);
        return { sent: true };
    } catch (error) {
        console.warn('⚠️ Falha ao enviar email:', error.message);
        return { sent: false, reason: error.message };
    }
}

module.exports = {
    runtimeStore,
    isDatabaseReady,
    createRuntimeId,
    sendEmailSafe
};
