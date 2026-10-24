export function installationSteps({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  const ios = /iPad|iPhone|iPod/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1);
  if (ios) return [
    'Abra o Entrelinhas no Safari e toque no botão de compartilhar.',
    'Escolha “Adicionar à Tela de Início”. A opção pode estar em “Mais”.',
    'Se aparecer “Abrir como App da Web”, mantenha a opção ativada. Toque em “Adicionar”.',
  ];
  if (/Android/i.test(userAgent)) return [
    'Abra o menu do navegador, ao lado da barra de endereço.',
    'Escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.',
    'Confirme a instalação. O Entrelinhas ficará disponível entre seus aplicativos.',
  ];
  if (/Mac/i.test(platform) && /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent)) return [
    'No Safari, abra o menu “Arquivo” ou o botão de compartilhar.',
    'Escolha “Adicionar ao Dock”.',
    'Confirme o nome Entrelinhas e clique em “Adicionar”.',
  ];
  return [
    'Abra este endereço no Chrome ou no Edge.',
    'Use o ícone de instalação na barra de endereço ou procure “Instalar” no menu do navegador.',
    'Confirme a instalação para abrir o Entrelinhas em sua própria janela.',
  ];
}

export function setupPwa({ toast }) {
  const button = document.querySelector('#install-app');
  const dialog = document.querySelector('#install-dialog');
  const steps = document.querySelector('#install-steps');
  const standalone = window.matchMedia('(display-mode: standalone)');
  let installed = standalone.matches || navigator.standalone === true;
  let installPrompt = null;
  const update = () => { button.hidden = installed || standalone.matches || navigator.standalone === true; };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installPrompt = null;
    dialog.close();
    update();
    toast('Entrelinhas instalado. Boa leitura!');
  });
  standalone.addEventListener('change', update);
  button.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      button.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
          button.hidden = true;
          toast('Instalação iniciada. Aguarde a confirmação do navegador.');
        }
        return;
      } catch {
        // A consumed or expired browser prompt falls back to installation help.
      } finally {
        button.disabled = false;
      }
    }
    const instructions = installationSteps({
      userAgent: navigator.userAgent,
      platform: navigator.userAgentData?.platform || navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    });
    steps.replaceChildren(...instructions.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    dialog.showModal();
  });
  update();
}
