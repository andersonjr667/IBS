/**
 * ==================== MODELO DE CONTATO ====================
 * Arquivo: models/Contato.js
 * Descrição: Schema para mensagens de contato do formulário
 */

const mongoose = require('mongoose');
const validator = require('validator');

const contatoSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: [true, 'Nome é obrigatório'],
        trim: true,
        maxlength: [100, 'Nome não pode ter mais de 100 caracteres']
    },

    email: {
        type: String,
        required: [true, 'Email é obrigatório'],
        validate: [validator.isEmail, 'Email inválido']
    },

    assunto: {
        type: String,
        required: [true, 'Assunto é obrigatório'],
        trim: true,
        maxlength: [200, 'Assunto não pode ter mais de 200 caracteres']
    },

    mensagem: {
        type: String,
        required: [true, 'Mensagem é obrigatória'],
        trim: true,
        maxlength: [5000, 'Mensagem não pode ter mais de 5000 caracteres']
    },

    telefone: {
        type: String,
        trim: true
    },

    tipo: {
        type: String,
        enum: ['duvida', 'sugestao', 'reclamacao', 'elogio', 'outro'],
        default: 'outro'
    },

    status: {
        type: String,
        enum: ['novo', 'lido', 'respondido', 'arquivado'],
        default: 'novo'
    },

    resposta: {
        mensagem: String,
        respondidoEm: Date,
        respondidoPor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },

    dataEnvio: {
        type: Date,
        default: Date.now
    },

    enderecoIP: String,
    userAgent: String

}, { timestamps: true });

// Índices
contatoSchema.index({ email: 1 });
contatoSchema.index({ status: 1 });
contatoSchema.index({ dataEnvio: -1 });

// Esquema de Doação
/**
 * ==================== MODELO DE DOAÇÃO ====================
 * Arquivo: models/Doacao.js
 * Descrição: Schema para registrar doações
 */

const doacaoSchema = new mongoose.Schema({
    // Informações do Doador
    doador: {
        nome: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            validate: [validator.isEmail, 'Email inválido']
        },
        telefone: String,
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        }
    },

    // Valor e Forma de Pagamento
    valor: {
        type: Number,
        required: [true, 'Valor é obrigatório'],
        min: [0.01, 'Valor deve ser maior que zero']
    },

    moeda: {
        type: String,
        default: 'BRL'
    },

    tipo: {
        type: String,
        enum: ['pix', 'cartao', 'transferencia', 'boleto', 'presencial'],
        required: true
    },

    // Referência de Pagamento
    transacaoId: String,
    recibo: String,

    // Status
    status: {
        type: String,
        enum: ['pendente', 'processando', 'confirmada', 'recusada', 'cancelada'],
        default: 'pendente'
    },

    // Categorização
    categoria: {
        type: String,
        enum: ['dizimo', 'oferta', 'projeto_social', 'manutencao', 'outro'],
        default: 'oferta'
    },

    // Isento de Imposto (Lei Rouanet)
    podesSerTratadoComoDoacaoFISCAL: {
        type: Boolean,
        default: false
    },

    // Mensagem do Doador
    mensagem: String,

    // Preferências
    recebeComprovante: {
        type: Boolean,
        default: true
    },

    permitePublicar: {
        type: Boolean,
        default: false
    },

    // Recorrência (Doação Mensal)
    recorrente: {
        type: Boolean,
        default: false
    },

    frequenciaRecorrencia: {
        type: String,
        enum: ['mensal', 'trimestral', 'semestral', 'anual'],
        default: 'mensal'
    },

    proximaDoacao: Date,
    ultimaDoacao: Date,

    // Timestamps
    dataCriacao: {
        type: Date,
        default: Date.now
    }

}, { timestamps: true });

// Índices
doacaoSchema.index({ 'doador.email': 1 });
doacaoSchema.index({ status: 1 });
doacaoSchema.index({ dataCriacao: -1 });
doacaoSchema.index({ tipo: 1 });

// Esquema de Culto
/**
 * ==================== MODELO DE CULTO ====================
 * Arquivo: models/Culto.js
 * Descrição: Schema para informações de cultos
 */

const cultoSchema = new mongoose.Schema({
    nome: {
        type: String,
        required: [true, 'Nome do culto é obrigatório'],
        trim: true
    },

    descricao: {
        type: String,
        maxlength: [1000, 'Descrição não pode ter mais de 1000 caracteres']
    },

    diaSemana: {
        type: String,
        enum: ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sabado'],
        required: true
    },

    horario: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}$/ // Formato HH:MM
    },

    local: {
        endereco: String,
        sala: String,
        latitude: Number,
        longitude: Number
    },

    tipo: {
        type: String,
        enum: ['celebracao', 'familia', 'oracao', 'doutrina', 'jovens', 'criancas', 'adoro', 'outro'],
        default: 'celebracao'
    },

    ministro: {
        nome: String,
        funcao: String
    },

    participantes: {
        type: Number,
        default: 0
    },

    transmissaoAoVivo: {
        type: Boolean,
        default: false
    },

    linkTransmissao: String,

    ativo: {
        type: Boolean,
        default: true
    },

    dataCriacao: {
        type: Date,
        default: Date.now
    }

}, { timestamps: true });

// Modelos
const Contato = mongoose.model('Contato', contatoSchema);
const Doacao = mongoose.model('Doacao', doacaoSchema);
const Culto = mongoose.model('Culto', cultoSchema);

module.exports = { Contato, Doacao, Culto };
