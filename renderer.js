window.electronAPI.onQRCode((qrCodeData) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer');

    // Limpa o container antes de gerar o novo QR Code
    qrCodeContainer.innerHTML = '';

    // Gera o QR Code no container
    QRCode.toCanvas(qrCodeContainer, qrCodeData, { width: 300 })
        .then(() => console.log('QR Code gerado com sucesso!'))
        .catch(err => console.error('Erro ao gerar QR Code:', err));
});
