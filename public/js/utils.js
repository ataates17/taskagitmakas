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
    return address.substring(0, 6) + '...' + address.substring(address.length - 4);
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

// Firebase kullanıcı bilgilerini getir
async function getUserProfile() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return null;
        
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) return null;
        
        return userDoc.data();
    } catch (error) {
        console.error("Kullanıcı profili getirme hatası:", error);
        return null;
    }
}

// Kullanıcı istatistiklerini güncelle
async function updateUserStats(gameData, result) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return;
        
        const userRef = db.collection('users').doc(user.uid);
        const userDoc = await userRef.get();
        
        if (!userDoc.exists) return;
        
        const userData = userDoc.data();
        const stake = parseFloat(ethers.utils.formatEther(gameData.stake));
        
        // İstatistikleri güncelle
        const updates = {
            gamesPlayed: firebase.firestore.FieldValue.increment(1)
        };
        
        if (result.winner === user.uid) {
            updates.gamesWon = firebase.firestore.FieldValue.increment(1);
            updates.totalWon = firebase.firestore.FieldValue.increment(stake * 2);
        } else if (result.winner === 'tie') {
            updates.gamesTied = firebase.firestore.FieldValue.increment(1);
        } else {
            updates.gamesLost = firebase.firestore.FieldValue.increment(1);
            updates.totalLost = firebase.firestore.FieldValue.increment(stake);
        }
        
        updates.totalStaked = firebase.firestore.FieldValue.increment(stake);
        
        await userRef.update(updates);
    } catch (error) {
        console.error("Kullanıcı istatistikleri güncelleme hatası:", error);
    }
}

// Oyun sonucunu belirle
function determineWinner(creatorMove, challengerMove) {
    // 1: Taş, 2: Kağıt, 3: Makas
    if (creatorMove === challengerMove) {
        return 'tie';
    } else if (
        (creatorMove === 1 && challengerMove === 3) || // Taş > Makas
        (creatorMove === 2 && challengerMove === 1) || // Kağıt > Taş
        (creatorMove === 3 && challengerMove === 2)    // Makas > Kağıt
    ) {
        return 'creator';
    } else {
        return 'challenger';
    }
}

// Firebase'den oyunları getir
async function getFirebaseGames(limit = 20) {
    try {
        const gamesSnapshot = await db.collection('games')
            .where('state', '==', 'ACTIVE')
            .orderBy('createdAt', 'desc')
            .limit(limit)
            .get();
        
        const games = [];
        gamesSnapshot.forEach(doc => {
            const game = doc.data();
            game.id = doc.id;
            games.push(game);
        });
        
        return games;
    } catch (error) {
        console.error("Oyun listesi hatası:", error);
        return [];
    }
}

// Kullanıcının oyunlarını getir
async function getUserGames() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) return [];
        
        const gamesSnapshot = await db.collection('games')
            .where('creatorAddress', '==', userAddress)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        
        const games = [];
        gamesSnapshot.forEach(doc => {
            const game = doc.data();
            game.id = doc.id;
            games.push(game);
        });
        
        return games;
    } catch (error) {
        console.error("Kullanıcı oyunları hatası:", error);
        return [];
    }
} 