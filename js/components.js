const API_BASE = `${window.location.origin}/api`;

function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
}

function qs(selector, root = document) {
    return root.querySelector(selector);
}

function notify(message) {
    window.alert(message);
}

function setButtonBusy(button, text) {
    if (!button) return () => {};
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = text;
    return () => {
        button.disabled = false;
        button.innerHTML = originalText;
    };
}

async function fazerRequisicao(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    try {
        const resposta = await fetch(url, {
            ...options,
            headers,
            timeout: 15000
        });

        let data = {};
        try {
            data = await resposta.json();
        } catch (error) {
            data = { message: 'Erro ao processar resposta do servidor' };
        }

        if (!resposta.ok) {
            if (resposta.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('usuario');
            }

            // Formatações de mensagem de erro melhoradas
            let message = data.message || 'Não foi possível concluir a solicitação.';
            
            if (resposta.status === 503) {
                message = 'Servidor temporariamente indisponível. Tente novamente em alguns instantes.';
            } else if (resposta.status === 500) {
                message = data.message || 'Erro interno do servidor. Tente novamente mais tarde.';
            }
            
            throw new Error(message);
        }

        return data;
    } catch (error) {
        // Tratamento de erros de rede/timeout
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error('Erro de conexão. Verifique sua internet e tente novamente.');
        }
        throw error;
    }
}

class SistemaAutenticacao {
    constructor() {
        this.token = localStorage.getItem('token');
        this.usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
    }

    estaAutenticado() {
        return Boolean(this.token && this.usuario);
    }

    getRoleLabel(role) {
        const roles = {
            admin: 'Administrador',
            pastor: 'Pastor',
            moderador: 'Moderador',
            usuario: 'Usuário'
        };
        return roles[role] || role || 'Usuário';
    }

    async registrar(nome, email, telefone, senha, senhaConfirmacao) {
        if (senha !== senhaConfirmacao) {
            throw new Error('As senhas não coincidem.');
        }

        const resposta = await fazerRequisicao('/usuario/registrar', {
            method: 'POST',
            body: JSON.stringify({ nome, email, telefone, senha, senhaConfirmacao })
        });

        return resposta;
    }

    async login(email, senha) {
        const resposta = await fazerRequisicao('/usuario/login', {
            method: 'POST',
            body: JSON.stringify({ email, senha })
        });

        if (resposta.token) {
            localStorage.setItem('token', resposta.token);
            localStorage.setItem('usuario', JSON.stringify(resposta.usuario));
            this.token = resposta.token;
            this.usuario = resposta.usuario;
            this.atualizarUI();
        }

        return resposta;
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        this.token = null;
        this.usuario = null;
        this.atualizarUI();
        window.location.href = '/';
    }

    atualizarUI() {
        const btnLogin = qs('#btnLoginNav');
        const userMenu = qs('#userMenuNav');
        const nomeUsuario = qs('#nomeUsuarioNav');
        const roleUsuario = qs('#roleUsuarioNav');

        if (!btnLogin || !userMenu) {
            return;
        }

        if (this.estaAutenticado()) {
            btnLogin.style.display = 'none';
            userMenu.style.display = 'block';
            if (nomeUsuario) nomeUsuario.textContent = this.usuario.nome || 'Usuário';
            if (roleUsuario) roleUsuario.textContent = this.getRoleLabel(this.usuario.role);
        } else {
            btnLogin.style.display = 'block';
            userMenu.style.display = 'none';
        }
    }
}

const auth = new SistemaAutenticacao();

async function carregarComponente(seletor, caminho, callback) {
    const container = qs(seletor);
    if (!container) return;

    try {
        const response = await fetch(caminho);
        if (!response.ok) {
            throw new Error(`Erro ao carregar ${caminho}`);
        }

        container.innerHTML = await response.text();
        if (callback) callback(container);
    } catch (error) {
        console.error(error);
    }
}

function atualizarMenuAtivo() {
    const path = window.location.pathname;
    qsa('.nav-link').forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;

        const isGrSection = href === '/gr' && (path === '/gr' || path === '/grs');
        const isActive = href === path || (href === '/' && path === '/') || isGrSection;
        link.classList.toggle('active', isActive);
    });
}

function setupHeader() {
    const hamburger = qs('#hamburger');
    const navMenu = qs('#navMenu');
    const header = qs('.header');

    if (hamburger && navMenu && !hamburger.dataset.ready) {
        hamburger.dataset.ready = 'true';
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', String(navMenu.classList.contains('active')));
        });
    }

    qsa('.nav-link').forEach((link) => {
        if (link.dataset.ready) return;
        link.dataset.ready = 'true';
        link.addEventListener('click', () => {
            if (navMenu) navMenu.classList.remove('active');
            if (hamburger) hamburger.classList.remove('active');
            if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
        });
    });

    if (header && !header.dataset.scrollReady) {
        header.dataset.scrollReady = 'true';
        const syncHeaderState = () => {
            header.classList.toggle('scrolled', window.scrollY > 12);
        };
        window.addEventListener('scroll', syncHeaderState);
        syncHeaderState();
    }

    atualizarMenuAtivo();
    setupAuthBindings();
    auth.atualizarUI();
}

function setupAuthBindings() {
    qsa('[data-auth-action="open-modal"]').forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', mostrarLoginModal);
    });

    qsa('[data-auth-action="close-modal"]').forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', fecharLoginModal);
    });

    qsa('[data-auth-action="logout"]').forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', logout);
    });

    qsa('[data-auth-action="toggle-user-menu"]').forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const userMenu = button.closest('.user-menu');
            if (!userMenu) return;
            const isOpen = userMenu.classList.toggle('open');
            button.setAttribute('aria-expanded', String(isOpen));
        });
    });

    qsa('[data-auth-action="admin"]').forEach((link) => {
        if (link.dataset.bound) return;
        link.dataset.bound = 'true';
        link.addEventListener('click', irParaAdmin);
    });

    qsa('[data-auth-tab]').forEach((button) => {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', () => mostrarAba(button.dataset.authTab));
    });

    const formLogin = qs('#formLogin');
    if (formLogin && !formLogin.dataset.bound) {
        formLogin.dataset.bound = 'true';
        formLogin.addEventListener('submit', fazerLogin);
    }

    const formRegistro = qs('#formRegistro');
    if (formRegistro && !formRegistro.dataset.bound) {
        formRegistro.dataset.bound = 'true';
        formRegistro.addEventListener('submit', fazerRegistro);
    }

    if (!document.body.dataset.userMenuOutsideReady) {
        document.body.dataset.userMenuOutsideReady = 'true';
        document.addEventListener('click', (event) => {
            qsa('.user-menu.open').forEach((menu) => {
                if (menu.contains(event.target)) return;
                menu.classList.remove('open');
                const toggle = qs('[data-auth-action="toggle-user-menu"]', menu);
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
            });
        });
    }
}

function setupFooter() {
    const scrollToTop = qs('#scrollToTop');
    if (!scrollToTop || scrollToTop.dataset.ready) return;

    scrollToTop.dataset.ready = 'true';
    const syncVisibility = () => {
        scrollToTop.classList.toggle('show', window.scrollY > 300);
    };

    window.addEventListener('scroll', syncVisibility);
    syncVisibility();
    scrollToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function setupSmoothScroll() {
    qsa('a[href^="#"]').forEach((anchor) => {
        if (anchor.dataset.ready) return;
        anchor.dataset.ready = 'true';
        anchor.addEventListener('click', (event) => {
            const href = anchor.getAttribute('href');
            const target = href ? qs(href) : null;
            if (!target) return;
            event.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function toggleFaq(question) {
    const answer = question.nextElementSibling;
    const icon = qs('i', question);
    if (!answer) return;

    const isOpen = answer.classList.toggle('active');
    question.classList.toggle('active', isOpen);
    question.setAttribute('aria-expanded', String(isOpen));

    if (icon) {
        icon.classList.toggle('fa-chevron-up', isOpen);
        icon.classList.toggle('fa-chevron-down', !isOpen);
    }
}

function setupFaqs() {
    qsa('.faq-question').forEach((button) => {
        if (button.dataset.ready) return;
        button.dataset.ready = 'true';
        button.setAttribute('type', 'button');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => toggleFaq(button));
    });
}

function setupFilterButtons() {
    const groups = [
        { buttonSelector: '.video-filters .filter-btn', itemSelector: '.video-card' },
        { buttonSelector: '.gallery-filters .filter-btn', itemSelector: '.gallery-item' }
    ];

    groups.forEach(({ buttonSelector, itemSelector }) => {
        const buttons = qsa(buttonSelector);
        const items = qsa(itemSelector);
        if (!buttons.length || !items.length) return;

        buttons.forEach((button) => {
            if (button.dataset.ready) return;
            button.dataset.ready = 'true';
            button.addEventListener('click', () => {
                const filterValue = button.dataset.filter || 'all';
                buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
                items.forEach((item) => {
                    const category = item.dataset.category || 'all';
                    item.style.display = filterValue === 'all' || category === filterValue ? '' : 'none';
                });
            });
        });
    });
}

function closeGalleryModal() {
    const modal = qs('#galleryModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function setupGalleryModal() {
    const modal = qs('#galleryModal');
    if (!modal) return;

    const modalImage = qs('#modalImage');
    const modalTitle = qs('#modalTitle');
    const modalDescription = qs('#modalDescription');

    qsa('.gallery-item').forEach((item) => {
        if (item.dataset.ready) return;
        item.dataset.ready = 'true';
        item.addEventListener('click', () => {
            const img = qs('img', item);
            const title = qs('.overlay-content h3', item);
            const description = qs('.overlay-content p', item);
            if (!img || !modalImage) return;

            modalImage.src = img.src;
            modalImage.alt = img.alt;
            if (modalTitle) modalTitle.textContent = title ? title.textContent : img.alt;
            if (modalDescription) modalDescription.textContent = description ? description.textContent : '';
            modal.classList.add('active');
        });
    });

    qsa('[onclick*="closeGalleryModal"], .modal-backdrop, .modal-close', modal).forEach((element) => {
        if (element.dataset.ready) return;
        element.dataset.ready = 'true';
        element.addEventListener('click', closeGalleryModal);
        element.removeAttribute('onclick');
    });

    if (!document.body.dataset.galleryEscapeReady) {
        document.body.dataset.galleryEscapeReady = 'true';
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeGalleryModal();
            }
        });
    }
}

function setupAnimations() {
    if (!('IntersectionObserver' in window)) return;
    const targets = qsa('.service-card, .info-box, .ministry-card, .message-card, .leader-card, .donation-card, .video-card, .gallery-item, .gr-card, .gr-step-card, .gr-value-card, .gr-highlight-card');
    const observer = new IntersectionObserver((entries, io) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            io.unobserve(entry.target);
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -60px 0px' });

    targets.forEach((element) => {
        if (element.dataset.animated) return;
        element.dataset.animated = 'true';
        element.style.opacity = '0';
        element.style.transform = 'translateY(20px)';
        element.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        observer.observe(element);
    });
}

function setupCopyActions() {
    qsa('[data-copy-text]').forEach((button) => {
        if (button.dataset.ready) return;
        button.dataset.ready = 'true';
        button.addEventListener('click', async () => {
            const text = button.dataset.copyText || '';
            try {
                await navigator.clipboard.writeText(text);
                notify(`Copiado: ${text}`);
            } catch (error) {
                notify(text);
            }
        });
    });
}

function setupDonationActions() {
    qsa('[data-donation-action="card"]').forEach((button) => {
        if (button.dataset.ready) return;
        button.dataset.ready = 'true';
        button.addEventListener('click', () => {
            notify('Doações por cartão serão liberadas em breve. Por enquanto, use PIX ou transferência bancária.');
        });
    });
}

function setupGrCards() {
    const cards = qsa('.gr-card');
    const detailName = qs('#grDetailName');
    const detailDescription = qs('#grDetailDescription');
    const detailRegion = qs('#grDetailRegion');
    const detailSchedule = qs('#grDetailSchedule');
    const detailLeader = qs('#grDetailLeader');
    const detailAddress = qs('#grDetailAddress');
    const detailFocus = qs('#grDetailFocus');
    const detailMap = qs('#grDetailMap');

    if (!cards.length || !detailName || !detailMap) return;

    const updateDetail = (card) => {
        cards.forEach((item) => item.classList.toggle('active', item === card));

        if (detailName) detailName.textContent = card.dataset.grName || 'Grupo de Relacionamento';
        if (detailDescription) detailDescription.textContent = card.dataset.grDescription || '';
        if (detailRegion) detailRegion.textContent = card.dataset.grRegion || '';
        if (detailSchedule) detailSchedule.textContent = `${card.dataset.grDay || ''} às ${card.dataset.grTime || ''}`.trim();
        if (detailLeader) detailLeader.textContent = card.dataset.grLeader || '';
        if (detailAddress) detailAddress.textContent = card.dataset.grAddress || '';
        if (detailFocus) detailFocus.textContent = card.dataset.grFocus || '';
        if (detailMap) detailMap.src = card.dataset.grMap || detailMap.src;
    };

    cards.forEach((card, index) => {
        if (card.dataset.ready) return;
        card.dataset.ready = 'true';
        card.addEventListener('click', () => updateDetail(card));
        if (index === 0) updateDetail(card);
    });
}

async function setupContactForm() {
    const form = qs('.contact-form[data-api-form="contato"]');
    if (!form || form.dataset.ready) return;

    form.dataset.ready = 'true';
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = qs('button[type="submit"]', form);
        const restoreButton = setButtonBusy(submitButton, 'Enviando...');
        const formData = new FormData(form);
        const payload = {
            nome: formData.get('nome'),
            email: formData.get('email'),
            telefone: formData.get('telefone') || '',
            assunto: formData.get('assunto'),
            mensagem: formData.get('mensagem'),
            tipo: formData.get('tipo') || 'outro'
        };

        try {
            await fazerRequisicao('/contato', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            form.reset();
            notify('Mensagem enviada com sucesso. Em breve entraremos em contato.');
        } catch (error) {
            notify(error.message || 'Não foi possível enviar sua mensagem.');
        } finally {
            restoreButton();
        }
    });
}

async function setupProximoCulto() {
    const dia = qs('#proximoDia');
    const horario = qs('#proximoHorario');
    if (!dia || !horario || dia.dataset.ready) return;

    dia.dataset.ready = 'true';

    try {
        const resposta = await fazerRequisicao('/cultos/proximo/agora');
        const culto = resposta.dados;
        if (!culto) return;
        const nomeDia = (culto.diaSemana || '').replace(/^./, (letra) => letra.toUpperCase());
        dia.textContent = nomeDia;
        horario.textContent = culto.horario || '--:--';
    } catch (error) {
        console.warn('Não foi possível carregar o próximo culto:', error.message);
    }
}

async function carregarHeader() {
    await carregarComponente('#header', '/header.html', setupHeader);
}

async function carregarFooter() {
    const footerContainer = qs('#footer');
    if (footerContainer) {
        footerContainer.classList.add('footer');
    }
    await carregarComponente('#footer', '/footer.html', setupFooter);
}

function mostrarLoginModal() {
    const modal = qs('#modalAuth');
    if (modal) modal.style.display = 'flex';
}

function fecharLoginModal() {
    const modal = qs('#modalAuth');
    if (modal) modal.style.display = 'none';
}

function mostrarAba(aba) {
    const abaLogin = qs('#aba-login');
    const abaRegistro = qs('#aba-registro');
    const tabBtns = qsa('.tab-btn');

    if (abaLogin) abaLogin.style.display = aba === 'login' ? 'block' : 'none';
    if (abaRegistro) abaRegistro.style.display = aba === 'registro' ? 'block' : 'none';

    tabBtns.forEach((btn) => {
        const shouldActivate = btn.textContent.toLowerCase().includes(aba);
        btn.classList.toggle('active', shouldActivate);
    });
}

async function fazerLogin(event) {
    event.preventDefault();
    const formLogin = qs('#formLogin');
    const emailInput = qs('#loginEmail');
    const senhaInput = qs('#loginSenha');
    
    if (!emailInput || !senhaInput) return;
    
    const restoreButton = setButtonBusy(qs('#formLogin button[type="submit"]'), 'Entrando...');

    try {
        const resposta = await auth.login(emailInput.value, senhaInput.value);
        notify(resposta.message || 'Login realizado com sucesso.');
        fecharLoginModal();
        window.location.reload();
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        notify(error.message || 'Não foi possível realizar o login. Verifique suas credenciais.');
    } finally {
        restoreButton();
    }
}

async function fazerRegistro(event) {
    event.preventDefault();
    const formRegistro = qs('#formRegistro');
    const nomeInput = qs('#registroNome');
    const emailInput = qs('#registroEmail');
    const telefoneInput = qs('#registroTelefone');
    const senhaInput = qs('#registroSenha');
    const senhaConfInput = qs('#registroSenhaConf');
    
    if (!nomeInput || !emailInput || !senhaInput || !senhaConfInput) return;
    
    const restoreButton = setButtonBusy(qs('#formRegistro button[type="submit"]'), 'Criando conta...');

    try {
        // Validação básica do lado do cliente
        if (senhaInput.value !== senhaConfInput.value) {
            throw new Error('As senhas não coincidem');
        }
        
        if (senhaInput.value.length < 6) {
            throw new Error('A senha deve ter no mínimo 6 caracteres');
        }
        
        const resposta = await auth.registrar(
            nomeInput.value,
            emailInput.value,
            telefoneInput?.value || '',
            senhaInput.value,
            senhaConfInput.value
        );

        notify(resposta.message || 'Conta criada com sucesso. Faça login para continuar.');
        if (formRegistro) formRegistro.reset();
        mostrarAba('login');
    } catch (error) {
        console.error('Erro ao registrar:', error);
        const mensagem = error.message || 'Não foi possível criar sua conta.';
        notify(mensagem);
    } finally {
        restoreButton();
    }
}

function logout() {
    if (window.confirm('Tem certeza que deseja sair?')) {
        auth.logout();
    }
}

function irParaAdmin(event) {
    if (event) event.preventDefault();
    notify('O painel administrativo ainda não está disponível nesta versão do site.');
}

function verificarAutenticacao() {
    auth.atualizarUI();
}

function inicializarPagina() {
    setupSmoothScroll();
    setupFaqs();
    setupFilterButtons();
    setupGalleryModal();
    setupAnimations();
    setupCopyActions();
    setupDonationActions();
    setupGrCards();
    setupContactForm();
    setupProximoCulto();
    verificarAutenticacao();
}

document.addEventListener('DOMContentLoaded', async () => {
    await carregarHeader();
    await carregarFooter();
    inicializarPagina();
});

window.addEventListener('click', (event) => {
    const modal = qs('#modalAuth');
    if (modal && event.target === modal) {
        fecharLoginModal();
    }
});
