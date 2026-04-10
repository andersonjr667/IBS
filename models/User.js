/**
 * ==================== MODELO DE USUÁRIO ====================
 * Arquivo: models/User.js
 * Descrição: Schema de usuário com hash de senha e roles
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');

// ==================== SCHEMA DE USUÁRIO ====================

const userSchema = new mongoose.Schema({
    // Informações Pessoais
    nome: {
        type: String,
        required: [true, 'Nome é obrigatório'],
        trim: true,
        maxlength: [50, 'Nome não pode ter mais de 50 caracteres']
    },

    email: {
        type: String,
        required: [true, 'Email é obrigatório'],
        unique: true,
        lowercase: true,
        validate: [validator.isEmail, 'Email inválido']
    },

    telefone: {
        type: String,
        trim: true,
        validate: {
            validator: function(v) {
                return !v || validator.isMobilePhone(v, 'pt-BR');
            },
            message: 'Telefone inválido'
        }
    },

    // Segurança
    senha: {
        type: String,
        required: [true, 'Senha é obrigatória'],
        minlength: [6, 'Senha deve ter no mínimo 6 caracteres'],
        select: false
    },

    senhaConfirmacao: {
        type: String,
        validate: {
            validator: function(v) {
                return v === this.senha;
            },
            message: 'Senhas não coincidem'
        },
        select: false
    },

    senhaAlteradoEm: Date,
    tokenRecuperacao: String,
    TokenRecuperacaoExpira: Date,

    // Perfil
    role: {
        type: String,
        enum: ['usuario', 'moderador', 'pastor', 'admin'],
        default: 'usuario'
    },

    // Status
    ativo: {
        type: Boolean,
        default: true
    },

    emailVerificado: {
        type: Boolean,
        default: false
    },

    tokenVerificacao: String,

    // Informações Adicionais
    bio: {
        type: String,
        maxlength: [500, 'Bio não pode ter mais de 500 caracteres']
    },

    foto: {
        type: String,
        default: null
    },

    // Preferências
    receberNotificacoes: {
        type: Boolean,
        default: true
    },

    receberNewsletter: {
        type: Boolean,
        default: false
    },

    // Timestamps
    dataCriacao: {
        type: Date,
        default: Date.now
    },

    dataAtualizacao: {
        type: Date,
        default: Date.now
    },

    ultimoLogin: Date

}, { timestamps: true });

// ==================== ÍNDICES ====================

userSchema.index({ email: 1 });
userSchema.index({ dataCriacao: -1 });

// ==================== PRÉ-SAVE MIDDLEWARE ====================

// Hash de senha antes de salvar
userSchema.pre('save', async function(next) {
    // Apenas fazer hash se a senha foi modificada
    if (!this.isModified('senha')) {
        return next();
    }

    try {
        // Gerar salt e fazer hash
        const salt = await bcrypt.genSalt(10);
        this.senha = await bcrypt.hash(this.senha, salt);

        // Remover campo de confirmação
        this.senhaConfirmacao = undefined;

        next();
    } catch (error) {
        next(error);
    }
});

// Atualizar data de modificação
userSchema.pre('save', function(next) {
    if (this.isModified() && !this.isNew) {
        this.dataAtualizacao = Date.now();
    }
    next();
});

// ==================== MÉTODOS DE INSTÂNCIA ====================

// Comparar senha com hash
userSchema.methods.compararSenha = async function(senhaFornecida) {
    try {
        return await bcrypt.compare(senhaFornecida, this.senha);
    } catch (error) {
        throw new Error('Erro ao comparar senhas');
    }
};

// Gerar token de recuperação de senha
userSchema.methods.gerarTokenRecuperacao = function() {
    const token = Math.random().toString(36).substring(2, 15);
    this.tokenRecuperacao = token;
    this.TokenRecuperacaoExpira = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos
    return token;
};

// Gerar token de verificação de email
userSchema.methods.gerarTokenVerificacao = function() {
    const token = Math.random().toString(36).substring(2, 15);
    this.tokenVerificacao = token;
    return token;
};

// Registrar último login
userSchema.methods.registrarLogin = async function() {
    this.ultimoLogin = Date.now();
    return this.save();
};

// ==================== MÉTODOS ESTÁTICOS ====================

// Buscar usuário por email
userSchema.statics.buscarPorEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

// Buscar usuário ativo por email
userSchema.statics.buscarAtivosPorRole = function(role) {
    return this.find({ role, ativo: true });
};

// ==================== VIRTUAL ====================

// Apenas para retorno de API
userSchema.set('toJSON', {
    transform: function(doc, ret) {
        delete ret.senha;
        delete ret.senhaConfirmacao;
        delete ret.tokenRecuperacao;
        delete ret.TokenRecuperacaoExpira;
        delete ret.tokenVerificacao;
        return ret;
    }
});

// ==================== MODELO ====================

module.exports = mongoose.model('User', userSchema);
