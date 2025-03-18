// Yardımcı fonksiyonlar

// Hamle numarasını metne dönüştür
function moveToString(moveNumber) {
    switch (parseInt(moveNumber)) {
        case 0: return "Yok";
        case 1: return "Taş";
        case 2: return "Kağıt";
        case 3: return "Makas";
        default: return "Bilinmiyor";
    }
}

// Oyun durumunu metne dönüştür
function stateToString(stateNumber) {
    switch (parseInt(stateNumber)) {
        case 0: return "Oluşturuldu";
        case 1: return "Katılındı";
        case 2: return "Açıklandı";
        case 3: return "Tamamlandı";
        default: return "Bilinmiyor";
    }
}

// Adresi kısalt
function shortenAddress(address) {
    if (!address) return "";
    return address.substring(0, 6) + "..." + address.substring(address.length - 4);
}

// Wei'yi ETH'ye dönüştür
function weiToEth(wei) {
    return ethers.utils.formatEther(wei);
}

// ETH'yi Wei'ye dönüştür
function ethToWei(eth) {
    return ethers.utils.parseEther(eth.toString());
}

// Timestamp'i tarih formatına dönüştür
function timestampToDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

// Rastgele salt değeri oluştur
function generateRandomSalt() {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hamle ve salt değerinden commitment oluştur
async function createCommitment(move, salt) {
    // ethers.js ile hash oluştur
    const encoded = ethers.utils.defaultAbiCoder.encode(
        ['uint8', 'bytes32'],
        [move, salt]
    );
    const commitment = ethers.utils.keccak256(encoded);
    return commitment;
}

// Sonuç mesajını göster
function showResult(elementId, message, isSuccess = true) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `result ${isSuccess ? 'success' : 'error'}`;
    element.style.display = 'block';
    
    // 5 saniye sonra mesajı gizle
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// Oyun durumuna göre renk sınıfı döndür
function getStateColorClass(state) {
    switch (parseInt(state)) {
        case 0: return "state-created";
        case 1: return "state-joined";
        case 2: return "state-revealed";
        case 3: return "state-finished";
        default: return "";
    }
}

// LocalStorage'a veri kaydet
function saveToLocalStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

// LocalStorage'dan veri al
function getFromLocalStorage(key) {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
} 