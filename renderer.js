window.electronAPI.onQRCode((qrCodeData) => {
    const qrCodeContainer = document.getElementById('qrCodeContainer');

    // Renderiza o QR Code usando qrcode.js
    QRCode.toCanvas(qrCodeContainer, qrCodeData, { width: 300 })
        .then(() => console.log('QR Code gerado com sucesso!'))
        .catch(err => console.error('Erro ao gerar QR Code:', err));
});
