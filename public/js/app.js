// Ana uygulama kodu
let provider;
let signer;
let contract;
let userAddress;
let gameCreationData = {}; // Oyun oluşturma verilerini saklamak için
let firebaseUser = null; // Firebase kullanıcısı

// Modal işlemleri
let selectedMove = null;
let selectedStake = null;

// Otomatik reveal seçeneğini sakla
let autoRevealEnabled = true;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    // Kontrat adresini göster
    document.getElementById('contract-address').textContent = contractAddress;
    
    // Cüzdana bağlan butonuna tıklandığında
    document.getElementById('connect-wallet').addEventListener('click', connectWallet);
    
    // Oyun oluştur butonuna tıklandığında
    document.getElementById('create-game').addEventListener('click', handleCreateGame);
    
    // Oyunları yenile butonuna tıklandığında
    document.getElementById('refresh-games').addEventListener('click', loadGames);
    
    // Oyuna katıl butonuna tıklandığında
    document.getElementById('join-game').addEventListener('click', handleJoinGame);
    
    // Oyun ID'si değiştiğinde
    document.getElementById('game-id').addEventListener('change', loadGameDetails);
    
    // Ethereum sağlayıcısını kontrol et
    if (window.ethereum) {
        try {
            // Modern provider (EIP-1193)
            provider = new ethers.providers.Web3Provider(window.ethereum);
            
            // Kontrat ABI'sini yükle
            contract = new ethers.Contract(contractAddress, contractABI, provider);
            
            // Cüzdan bağlı mı kontrol et
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                // Kullanıcı zaten bağlı, signer'ı ayarla
                signer = provider.getSigner();
                userAddress = accounts[0];
                
                // Kontratı signer ile bağla
                contract = new ethers.Contract(contractAddress, contractABI, signer);
                
                // Bağlı cüzdan bilgisini göster
                const walletInfo = document.getElementById('wallet-info');
                walletInfo.textContent = shortenAddress(userAddress);
                walletInfo.style.display = 'block';
                
                // Cüzdan adresi ile kullanıcı oluştur veya giriş yap
                await signInWithWalletAddress();
                
                // Kullanıcı bilgilerini yükle
                await loadUserInfo();
                
                // Oyunları yükle
                loadGames();
            }
            
            // Platform istatistiklerini yükle
            loadPlatformStats();
            
            // Blockchain olaylarını dinle
            listenToBlockchainEvents();
        } catch (error) {
            console.error("Provider başlatma hatası:", error);
            alert("Ethereum provider başlatılamadı. Lütfen MetaMask'ı kontrol edin.");
        }
    } else if (window.web3) {
        // Legacy provider
        provider = new ethers.providers.Web3Provider(window.web3.currentProvider);
        contract = new ethers.Contract(contractAddress, contractABI, provider);
        loadPlatformStats();
    } else {
        alert("Ethereum sağlayıcısı bulunamadı. Lütfen MetaMask yükleyin.");
    }

    // Ethereum provider olaylarını dinle
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', async (accounts) => {
            console.log('Hesap değişti:', accounts);
            if (accounts.length > 0) {
                // Provider'ı yeniden başlat
                provider = new ethers.providers.Web3Provider(window.ethereum);
                await connectWallet();
            } else {
                // Kullanıcı bağlantıyı kesti
                userAddress = null;
                signer = null;
                
                // UI'ı güncelle
                const walletInfo = document.getElementById('wallet-info');
                walletInfo.textContent = '';
                walletInfo.style.display = 'none';
                
                // Oyun listesini temizle
                document.getElementById('games-list').innerHTML = '<p>Lütfen önce cüzdanınızı bağlayın</p>';
            }
        });
        
        window.ethereum.on('chainChanged', (chainId) => {
            console.log('Zincir değişti:', chainId);
            // Sayfayı yenile
            window.location.reload();
        });
        
        window.ethereum.on('disconnect', (error) => {
            console.log('Provider bağlantısı kesildi:', error);
            // UI'ı güncelle
            const walletInfo = document.getElementById('wallet-info');
            walletInfo.textContent = '';
            walletInfo.style.display = 'none';
        });
    }

    // Modal kapatma butonlarına tıklandığında
    document.querySelectorAll('.close-modal, .close-join-modal').forEach(button => {
        button.addEventListener('click', closeModal);
    });
    
    // Oyun oluşturma butonuna tıklandığında
    document.getElementById('confirm-create')?.addEventListener('click', createGame);
});

// Ethereum Provider'ı başlat
async function initEthereumProvider() {
    if (window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        
        try {
            // Kullanıcının adresini kontrol et
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0 && accounts[0].toLowerCase() === userAddress.toLowerCase()) {
                signer = provider.getSigner();
                contract = new ethers.Contract(contractAddress, contractABI, signer);
                
                // Bağlı cüzdan bilgisini göster
                const walletInfo = document.getElementById('wallet-info');
                walletInfo.textContent = shortenAddress(userAddress);
                walletInfo.style.display = 'block';
                
                return true;
            }
        } catch (error) {
            console.error("Ethereum provider başlatma hatası:", error);
        }
    }
    
    return false;
}

// Cüzdana bağlan
async function connectWallet() {
    try {
        // Modern request method (EIP-1193)
        if (window.ethereum) {
            // Provider'ın hazır olduğundan emin ol
            ensureProvider();
            
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length === 0) {
                throw new Error("Kullanıcı cüzdan erişimine izin vermedi");
            }
            
            // Signer'ı ayarla
            signer = provider.getSigner();
            userAddress = accounts[0];
            
            // Kontratı signer ile bağla
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            
            // Bağlı cüzdan bilgisini göster
            const walletInfo = document.getElementById('wallet-info');
            walletInfo.textContent = shortenAddress(userAddress);
            walletInfo.style.display = 'block';
            
            // Cüzdan adresi ile kullanıcı oluştur veya giriş yap
            await signInWithWalletAddress();
            
            // Kullanıcı bilgilerini yükle
            await loadUserInfo();
            
            // Oyunları yükle
            loadGames();
            
            return true;
        } else {
            throw new Error("Ethereum provider bulunamadı");
        }
    } catch (error) {
        console.error("Cüzdan bağlantı hatası:", error);
        showResult('create-result', "Cüzdan bağlantı hatası: " + error.message, false);
        return false;
    }
}

// Cüzdan adresi ile kullanıcı oluştur veya giriş yap
async function signInWithWalletAddress() {
    try {
        if (!userAddress) {
            throw new Error("Ethereum adresi bulunamadı");
        }
        
        // Önce mevcut kullanıcıyı kontrol et
        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
            // Kullanıcı zaten giriş yapmış, profili güncelle
            await updateUserProfile(currentUser.uid, userAddress);
            firebaseUser = currentUser;
            console.log("Mevcut kullanıcı profili güncellendi:", firebaseUser.uid);
            return true;
        }
        
        // Anonim oturum aç
        const userCredential = await firebase.auth().signInAnonymously();
        firebaseUser = userCredential.user;
        
        // Kullanıcı profilini oluştur
        await createUserProfile(firebaseUser.uid, userAddress);
        
        console.log("Yeni kullanıcı oluşturuldu:", firebaseUser.uid);
        
        // Oyunları yükle
        await loadFirebaseGames();
        
        return true;
    } catch (error) {
        console.error("Kullanıcı oluşturma hatası:", error);
        return false;
    }
}

// Kullanıcı profili oluştur
async function createUserProfile(userId, walletAddress) {
    try {
        // Önce bu cüzdan adresiyle ilişkili kullanıcı var mı kontrol et
        const existingUsers = await db.collection('users')
            .where('walletAddress', '==', walletAddress.toLowerCase())
            .limit(1)
            .get();
        
        if (!existingUsers.empty) {
            // Bu cüzdan adresi zaten kayıtlı, mevcut profili kullan
            const existingUser = existingUsers.docs[0];
            console.log("Bu cüzdan adresi zaten kayıtlı:", existingUser.id);
            
            // Mevcut kullanıcı verilerini al
            const userData = existingUser.data();
            
            // Yeni kullanıcı ID'si ile mevcut verileri birleştir
            await db.collection('users').doc(userId).set({
                ...userData,
                walletAddress: walletAddress.toLowerCase(),
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Eski kullanıcı profilini sil (isteğe bağlı)
            // await db.collection('users').doc(existingUser.id).delete();
            
            return;
        }
        
        // Yeni kullanıcı profili oluştur
        await db.collection('users').doc(userId).set({
            walletAddress: walletAddress.toLowerCase(),
            displayName: shortenAddress(walletAddress),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
            gamesPlayed: 0,
            gamesWon: 0,
            gamesLost: 0,
            gamesTied: 0,
            totalStaked: 0,
            totalWon: 0,
            totalLost: 0
        });
    } catch (error) {
        console.error("Kullanıcı profili oluşturma hatası:", error);
        throw error;
    }
}

// Kullanıcı profilini güncelle
async function updateUserProfile(userId, walletAddress) {
    try {
        await db.collection('users').doc(userId).update({
            walletAddress: walletAddress.toLowerCase(),
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error("Kullanıcı profili güncelleme hatası:", error);
        throw error;
    }
}

// Cüzdan adresine göre kullanıcı profili getir
async function getUserProfileByWalletAddress(walletAddress) {
    try {
        const snapshot = await db.collection('users')
            .where('walletAddress', '==', walletAddress.toLowerCase())
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return null;
        }
        
        const userDoc = snapshot.docs[0];
        return {
            id: userDoc.id,
            ...userDoc.data()
        };
    } catch (error) {
        console.error("Kullanıcı profili getirme hatası:", error);
        return null;
    }
}

// Oyun oluştur butonuna tıklandığında
async function handleCreateGame() {
    try {
        if (!userAddress || !signer) {
            const connected = await connectWallet();
            if (!connected) return;
        }
        
        // Oyun oluşturma modalını aç
        openCreateGameModal();
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        showResult('create-result', "Oyun oluşturma hatası: " + error.message, false);
    }
}

// Oyun oluşturma modalında oyun oluştur
async function createGame() {
    try {
        if (!selectedMove || !selectedStake) {
            alert("Lütfen hamle ve bahis miktarı seçin");
            return;
        }
        
        // Modal'ı kapat
        closeModal();
        
        showResult('create-result', "Oyun oluşturuluyor...", true);
        
        // Firebase'de oyun oluştur
        const gameId = await createFirebaseGame(selectedMove, selectedStake);
        
        showResult('create-result', `Oyun başarıyla oluşturuldu! Firebase ID: ${gameId}`, true);
        
        // Oyunları yenile
        loadGames();
        
        // Seçimleri sıfırla
        selectedMove = null;
        selectedStake = null;
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        showResult('create-result', "Oyun oluşturma hatası: " + error.message, false);
    }
}

// Firebase'den oyunları yükle
async function loadFirebaseGames() {
    try {
        if (!firebaseUser) {
            console.log("Firebase kullanıcısı bulunamadı");
            return;
        }
        
        const gamesList = document.getElementById('games-list');
        gamesList.innerHTML = '<p>Oyunlar yükleniyor...</p>';
        
        // Aktif oyunları getir
        const games = await getFirebaseGames();
        
        if (games.length === 0) {
            gamesList.innerHTML = '<p>Aktif oyun bulunamadı. Yeni bir oyun oluşturabilirsiniz.</p>';
            return;
        }
        
        // Basitleştirilmiş yaklaşım - Tab sistemi olmadan
        const openGames = games.filter(g => g.state === 'ACTIVE');
        
        if (openGames.length === 0) {
            gamesList.innerHTML = '<p>Aktif oyun bulunamadı. Yeni bir oyun oluşturabilirsiniz.</p>';
            return;
        }
        
        let html = '<h3>Açık Oyunlar</h3>';
        html += renderGamesList(openGames, 'open');
        
        gamesList.innerHTML = html;
        
        // Oyuna katıl butonlarına olay dinleyicisi ekle
        document.querySelectorAll('.join-btn').forEach(button => {
            button.addEventListener('click', () => {
                const gameId = button.getAttribute('data-id');
                const stake = button.getAttribute('data-stake');
                openJoinGameModal(gameId, stake);
            });
        });
        
        console.log("Basitleştirilmiş HTML eklendi");
        
        // Debug için oyunları konsola yazdır
        console.log("Açık oyunlar:", openGames);
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = `
            <p class="error">Oyunlar yüklenirken bir hata oluştu: ${error.message}</p>
        `;
    }
}

// Oyun listesini render et
function renderGamesList(games, type) {
    if (games.length === 0) {
        return `<p class="no-games">Bu kategoride oyun bulunamadı.</p>`;
    }
    
    let html = '<div class="games-grid">';
    
    games.forEach(game => {
        const gameId = game.blockchain?.gameId || game.id || 'Bekliyor';
        const stake = weiToEth(game.stake);
        
        // Debug için
        console.log(`Game ${game.id}:`, game);
        
        let statusText = '';
        let statusClass = '';
        let actionButton = '';
        
        if (type === 'open') {
            statusClass = 'status-open';
            statusText = 'Katılıma Açık';
            actionButton = `
                <button class="btn primary join-btn" data-id="${game.id}" data-stake="${stake}">
                    Oyuna Katıl
                </button>
            `;
        } else if (type === 'my') {
            if (game.state === 'CREATED') {
                statusClass = 'status-pending';
                statusText = 'Onay Bekleniyor';
                actionButton = '';
            } else if (game.state === 'ACTIVE') {
                statusClass = 'status-active';
                statusText = 'Rakip Bekleniyor';
                actionButton = '';
            } else if (game.state === 'JOINED') {
                statusClass = 'status-joined';
                statusText = 'Katılım Sağlandı';
                
                if (game.creatorAddress.toLowerCase() === userAddress.toLowerCase()) {
                    actionButton = `
                        <button class="btn primary reveal-btn" data-id="${game.id}">
                            Hamleyi Açıkla
                        </button>
                    `;
                } else {
                    actionButton = `
                        <div class="waiting-reveal">
                            Hamle açıklanması bekleniyor...
                        </div>
                    `;
                }
            }
        } else if (type === 'finished') {
            if (game.winnerAddress === userAddress.toLowerCase()) {
                statusClass = 'status-won';
                statusText = 'Kazandınız';
            } else if (game.winnerAddress === null) {
                statusClass = 'status-tie';
                statusText = 'Berabere';
            } else {
                statusClass = 'status-lost';
                statusText = 'Kaybettiniz';
            }
            
            actionButton = `
                <div class="game-result">
                    <div class="moves">
                        <span class="move">${moveToString(game.creatorMove)}</span>
                        <span class="vs">vs</span>
                        <span class="move">${moveToString(game.challengerMove)}</span>
                    </div>
                </div>
            `;
        }
        
        html += `
            <div class="game-card ${statusClass}">
                <div class="game-header">
                    <span class="game-id">Oyun #${gameId}</span>
                    <span class="game-stake">${stake} ETH</span>
                </div>
                <div class="game-info">
                    <div class="game-creator">
                        <span class="label">Oluşturan:</span>
                        <span class="value">${shortenAddress(game.creatorAddress)}</span>
                    </div>
                    ${game.challengerAddress ? `
                        <div class="game-challenger">
                            <span class="label">Rakip:</span>
                            <span class="value">${shortenAddress(game.challengerAddress)}</span>
                        </div>
                    ` : ''}
                    <div class="game-status">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>
                <div class="game-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    console.log(`Rendered ${type} games HTML:`, html);
    return html;
}

// Oyun detaylarını yükle
async function loadGameDetails() {
    try {
        const gameId = document.getElementById('game-id').value;
        if (!gameId) return;
        
        // gameId'yi sayıya çevir ve kontrol et
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }

        const gameInfo = await contract.getGameInfo(gameIdNum);
        if (!gameInfo || !gameInfo.creator || gameInfo.creator === ethers.constants.AddressZero) {
            throw new Error("Oyun bulunamadı");
        }

        const stake = ethers.utils.formatEther(gameInfo.stake);
        
        // Bahis miktarını güncelle
        document.getElementById('join-stake').value = stake;
    } catch (error) {
        console.error("Oyun detayları yükleme hatası:", error);
        document.getElementById('join-stake').value = "";
        alert("Hata: " + error.message);
    }
}

// Platform istatistiklerini yükle
async function loadPlatformStats() {
    try {
        if (!contract) return;
        
        const stats = await contract.getPlatformStats();
        
        // Hata düzeltmesi: stats değerlerini kontrol et
        if (stats && stats.length >= 2) {
            const totalGamesPlayed = stats[0] ? stats[0].toString() : "0";
            const totalEthTraded = stats[1] ? ethers.utils.formatEther(stats[1]) : "0";
            
            console.log("Platform istatistikleri:", { totalGamesPlayed, totalEthTraded });
            
            // İstatistikleri göster
            document.getElementById('total-games').textContent = totalGamesPlayed;
            document.getElementById('total-eth').textContent = totalEthTraded + " ETH";
        } else {
            console.log("Platform istatistikleri alınamadı");
        }
    } catch (error) {
        console.error("Platform istatistikleri yükleme hatası:", error);
    }
}

// Oyunları yükle
async function loadGames() {
    try {
        if (!userAddress) {
            document.getElementById('games-list').innerHTML = '<p>Lütfen önce cüzdanınızı bağlayın</p>';
            return;
        }
        
        // Firebase'den oyunları yükle
        await loadFirebaseGames();
        
        // Debug için
        console.log("Oyunlar yüklendi");
        
        // Oyun listesi elementini kontrol et
        setTimeout(checkGamesList, 500);
    } catch (error) {
        console.error("Oyun yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = `
            <p class="error">Oyunlar yüklenirken bir hata oluştu: ${error.message}</p>
        `;
    }
}

// Blockchain olaylarını dinle
function listenToBlockchainEvents() {
    if (!contract) return;
    
    // GameCreated olayını dinle
    contract.on('GameCreated', async (gameId, creator, stake, event) => {
        console.log('Yeni oyun oluşturuldu:', gameId.toString());
        
        // Oyunları yenile
        loadFirebaseGames();
    });
    
    // GameJoined olayını dinle
    contract.on('GameJoined', async (gameId, challenger, stake, event) => {
        console.log('Oyuna katılım:', gameId.toString());
        
        // Oyunları yenile
        loadFirebaseGames();
    });
    
    // GameRevealed olayını dinle
    contract.on('GameRevealed', async (gameId, creatorMove, challengerMove, winner, event) => {
        console.log('Oyun sonuçlandı:', gameId.toString());
        
        // Oyunları yenile
        loadFirebaseGames();
    });
}

// Oyun durumunu kontrol et ve gerekirse reveal hatırlatıcısı göster
async function checkGamesForReveal() {
    // Reveal mekanizması kaldırıldı
    return;
}

// Reveal hatırlatıcısı göster
function showRevealReminder(gameId) {
    // Reveal mekanizması kaldırıldı
    return;
}

// Oyun durumunu dinle ve otomatik reveal yap
async function setupGameEventListeners() {
    if (!contract || !userAddress) return;
    
    try {
        // GameJoined olayını dinle
        contract.on("GameJoined", async (gameId, challenger, stake, event) => {
            console.log("Oyuna katılım olayı:", { gameId, challenger, stake });
            
            // Oyun listesini güncelle
            await loadGames();
            
            // Oyun sonuçlandı bildirimi göster
            showNotification(`Oyun #${gameId} sonuçlandı! Sonucu görmek için oyun listesini kontrol edin.`, "success");
        });
        
        console.log("Oyun olayları dinleniyor...");
    } catch (error) {
        console.error("Olay dinleyici hatası:", error);
    }
}

// Bildirim göster
function showNotification(message, type = "info") {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Animasyon ile göster
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Otomatik kapat
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 5000);
    
    // Kapatma butonuna tıklandığında
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    });
}

// Kontrat fonksiyonlarını doğrula
async function validateContractFunctions() {
    try {
        console.log("Kontrat fonksiyonları:", Object.keys(contract.functions));
        
        // createGame fonksiyonunun imzasını kontrol et
        const createGameFunction = Object.keys(contract.functions).find(f => f.startsWith('createGame('));
        console.log("createGame fonksiyon imzası:", createGameFunction);
        
        // joinGame fonksiyonunun imzasını kontrol et
        const joinGameFunction = Object.keys(contract.functions).find(f => f.startsWith('joinGame('));
        console.log("joinGame fonksiyon imzası:", joinGameFunction);
        
        // Minimum stake değerini kontrol et
        const minStake = await contract.MIN_STAKE();
        console.log("Minimum stake:", ethers.utils.formatEther(minStake), "ETH");
        
        // Kontrat fonksiyonlarını test et
        console.log("Kontrat fonksiyonları test ediliyor...");
        
        // gameCount fonksiyonunu çağır
        const gameCount = await contract.gameCount();
        console.log("Toplam oyun sayısı:", gameCount.toString());
        
        // Kontrat fonksiyonlarının parametrelerini kontrol et
        const joinGameAbi = contractABI.find(item => item.name === 'joinGame');
        if (joinGameAbi) {
            console.log("joinGame fonksiyonu parametreleri:", joinGameAbi.inputs);
        }
        
        return true;
    } catch (error) {
        console.error("Kontrat fonksiyon doğrulama hatası:", error);
        return false;
    }
}

// Kontrat adresini ve ABI'yi kontrol et
async function validateContract() {
    try {
        console.log("Kontrat adresi:", contractAddress);
        
        // Kontrat kodunu kontrol et
        const code = await provider.getCode(contractAddress);
        if (code === '0x') {
            console.error("Kontrat adresi geçersiz veya kontrat deploy edilmemiş!");
            return false;
        }
        
        console.log("Kontrat kodu mevcut, uzunluk:", code.length);
        return true;
    } catch (error) {
        console.error("Kontrat doğrulama hatası:", error);
        return false;
    }
}

// Oyuna katılmadan önce oyun bilgilerini kontrol et
async function checkGameBeforeJoining(gameId) {
    try {
        // Oyun bilgilerini al
        const gameInfo = await contract.getGameInfo(gameId);
        console.log("Oyun bilgileri:", {
            creator: gameInfo.creator,
            challenger: gameInfo.challenger,
            stake: ethers.utils.formatEther(gameInfo.stake),
            state: gameInfo.state
        });
        
        // Oyun durumunu kontrol et
        const gameState = await contract.getGameState(gameId);
        console.log("Oyun durumu:", gameState);
        
        // Oyun geçerliliğini kontrol et
        const isValid = await contract.isValidGame(gameId);
        console.log("Oyun geçerli mi:", isValid);
        
        // Kendi oyununuza katılmayı engelle
        if (gameInfo.creator === userAddress) {
            return { valid: false, error: "Kendi oyununuza katılamazsınız" };
        }
        
        // Oyun durumunu kontrol et
        if (gameState.state !== 0) {
            return { valid: false, error: "Bu oyuna katılınamaz" };
        }
        
        return { 
            valid: true, 
            stake: gameInfo.stake 
        };
    } catch (error) {
        console.error("Oyun kontrol hatası:", error);
        return { valid: false, error: "Oyun kontrol edilemedi: " + error.message };
    }
}

// Firebase'de oyun oluştur
async function createFirebaseGame(move, stake) {
    try {
        if (!firebaseUser || !userAddress) {
            throw new Error("Kullanıcı oturumu bulunamadı");
        }
        
        // Rastgele salt değeri oluştur
        const salt = generateRandomSalt();
        
        // Commitment hash oluştur
        const commitHash = await createCommitment(move, salt);
        
        // Firebase'de oyun oluştur
        const gameData = {
            creatorAddress: userAddress.toLowerCase(),
            stake: ethers.utils.parseEther(stake).toString(),
            move: move,
            salt: salt,
            commitHash: commitHash,
            state: 'CREATED',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            blockchain: {
                confirmed: false,
                pending: true
            }
        };
        
        // Firestore'a kaydet
        const gameRef = await db.collection('games').add(gameData);
        console.log("Firebase'de oyun oluşturuldu:", gameRef.id);
        
        // Blockchain'de oyun oluştur
        await createBlockchainGame(gameRef.id, commitHash, stake);
        
        return gameRef.id;
    } catch (error) {
        console.error("Firebase oyun oluşturma hatası:", error);
        throw error;
    }
}

// Blockchain'de oyun oluştur
async function createBlockchainGame(firebaseGameId, commitHash, stake) {
    try {
        if (!userAddress || !signer) {
            throw new Error("Cüzdan bağlantısı bulunamadı");
        }
        
        // Kontratı signer ile bağla
        const gameContract = new ethers.Contract(contractAddress, contractABI, signer);
        
        // Wei cinsinden bahis miktarı
        const weiAmount = ethers.utils.parseEther(stake);
        
        console.log("Blockchain'de oyun oluşturuluyor...");
        console.log("Commit Hash:", commitHash);
        console.log("Bahis Miktarı:", weiAmount.toString(), "wei");
        
        // Kontrat fonksiyonunu çağır
        const tx = await gameContract.createGame(commitHash, {
            value: weiAmount,
            gasLimit: 500000
        });
        
        console.log("Transaction gönderildi:", tx.hash);
        
        // Firebase'i güncelle
        await db.collection('games').doc(firebaseGameId).update({
            'blockchain.txHash': tx.hash
        });
        
        // Transaction'ı bekle
        const receipt = await tx.wait();
        console.log("Transaction onaylandı:", receipt);
        
        // GameCreated olayını bul
        const event = receipt.events.find(e => e.event === 'GameCreated');
        if (event) {
            const gameId = event.args.gameId.toString();
            
            // Firebase'i güncelle
            await db.collection('games').doc(firebaseGameId).update({
                'blockchain.gameId': gameId,
                'blockchain.confirmed': true,
                'blockchain.pending': false,
                'state': 'ACTIVE'
            });
            
            console.log("Oyun başarıyla oluşturuldu! Blockchain Game ID:", gameId);
        }
        
        return receipt;
    } catch (error) {
        console.error("Blockchain oyun oluşturma hatası:", error);
        
        // Firebase'i güncelle
        if (firebaseGameId) {
            await db.collection('games').doc(firebaseGameId).update({
                'blockchain.confirmed': false,
                'blockchain.pending': false,
                'blockchain.error': error.message,
                'state': 'ERROR'
            });
        }
        
        throw error;
    }
}

// Transaction receipt'ten oyun ID'sini al
async function getGameIdFromReceipt(receipt) {
    try {
        // GameCreated olayını bul
        const gameCreatedEvent = receipt.events.find(e => e.event === 'GameCreated');
        if (gameCreatedEvent) {
            return gameCreatedEvent.args.gameId.toString();
        }
        
        // Olayı bulamazsak, son oyun ID'sini al
        const gameCount = await contract.gameCount();
        return (gameCount - 1).toString();
    } catch (error) {
        console.error("Oyun ID'si alma hatası:", error);
        return "unknown";
    }
}

// Firebase'de oyuna katıl
async function joinFirebaseGame(gameId, move) {
    try {
        if (!firebaseUser) {
            // Kullanıcı giriş yapmamış, cüzdan adresi ile giriş yap
            const success = await signInWithWalletAddress();
            if (!success) {
                throw new Error("Kullanıcı oluşturulamadı. Lütfen cüzdanınızı kontrol edin.");
            }
        }
        
        // Oyun bilgilerini al
        const gameDoc = await db.collection('games').doc(gameId).get();
        if (!gameDoc.exists) {
            throw new Error("Oyun bulunamadı");
        }
        
        const gameData = gameDoc.data();
        
        // Oyun durumunu kontrol et
        if (gameData.state !== 'ACTIVE') {
            throw new Error("Bu oyuna katılınamaz");
        }
        
        if (gameData.creator === firebaseUser.uid) {
            throw new Error("Kendi oyununuza katılamazsınız");
        }
        
        // Firebase'de oyunu güncelle
        await db.collection('games').doc(gameId).update({
            challenger: firebaseUser.uid,
            challengerAddress: userAddress,
            challengerMove: move,
            state: 'JOINED',
            joinedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Arka planda blockchain işlemini başlat
        joinBlockchainGame(gameId, gameData.blockchain.gameId, move, gameData.stake);
        
        return true;
    } catch (error) {
        console.error("Oyuna katılma hatası:", error);
        throw error;
    }
}

// Blockchain'de oyuna katıl (arka planda)
async function joinBlockchainGame(firebaseGameId, blockchainGameId, move, stake) {
    try {
        // Blockchain'e oyuna katıl
        const stakeWei = ethers.utils.parseEther(stake.toString());
        const tx = await contract.joinGame(
            ethers.BigNumber.from(blockchainGameId), 
            ethers.BigNumber.from(move), 
            {
                value: stakeWei,
                gasLimit: 500000
            }
        );
        
        console.log("Blockchain join transaction gönderildi:", tx.hash);
        
        // Firebase'i güncelle
        await db.collection('games').doc(firebaseGameId).update({
            'blockchain.joinTxHash': tx.hash,
            'blockchain.joinPending': true
        });
        
        // Transaction'ı bekle
        const receipt = await tx.wait();
        
        // Başarılı ise Firebase'i güncelle
        if (receipt.status === 1) {
            // Oyun sonucunu blockchain'den al
            const result = await getGameResultFromBlockchain(blockchainGameId);
            
            await db.collection('games').doc(firebaseGameId).update({
                'blockchain.joinConfirmed': true,
                'blockchain.joinPending': false,
                'state': 'FINISHED',
                'result': result.winner,
                'finishedAt': firebase.firestore.FieldValue.serverTimestamp()
            });
            
            // Kullanıcı istatistiklerini güncelle
            await updateUserStats(gameData, result);
            
            // Oyun listesini güncelle
            loadFirebaseGames();
        } else {
            // Başarısız ise hata durumunu güncelle
            await db.collection('games').doc(firebaseGameId).update({
                'blockchain.joinConfirmed': false,
                'blockchain.joinPending': false,
                'blockchain.joinError': 'Transaction failed',
                'state': 'ERROR'
            });
        }
        
        return receipt;
    } catch (error) {
        console.error("Blockchain oyuna katılma hatası:", error);
        
        // Hata durumunu Firebase'e kaydet
        await db.collection('games').doc(firebaseGameId).update({
            'blockchain.joinConfirmed': false,
            'blockchain.joinPending': false,
            'blockchain.joinError': error.message,
            'state': 'ERROR'
        });
        
        throw error;
    }
}

// Blockchain'den oyun sonucunu al
async function getGameResultFromBlockchain(gameId) {
    try {
        const gameResult = await contract.getGameResult(gameId);
        
        // Sonucu dönüştür
        return {
            winner: gameResult.winner,
            creatorMove: gameResult.creatorMove,
            challengerMove: gameResult.challengerMove
        };
    } catch (error) {
        console.error("Oyun sonucu alma hatası:", error);
        return { winner: 'unknown', creatorMove: 0, challengerMove: 0 };
    }
}

// Kullanıcı istatistiklerini güncelle
async function updateUserStats(gameData, result) {
    try {
        // Oyun bilgilerini al
        const creatorAddress = gameData.creatorAddress.toLowerCase();
        const challengerAddress = gameData.challengerAddress.toLowerCase();
        const stake = ethers.BigNumber.from(gameData.stake);
        
        // Kazanan adresini belirle
        const winnerAddress = result.winner ? result.winner.toLowerCase() : null;
        
        // Berabere durumu
        const isTie = winnerAddress === null;
        
        // Creator istatistiklerini güncelle
        const creatorSnapshot = await db.collection('users')
            .where('walletAddress', '==', creatorAddress)
            .limit(1)
            .get();
            
        if (!creatorSnapshot.empty) {
            const creatorDoc = creatorSnapshot.docs[0];
            const creatorData = creatorDoc.data();
            
            // İstatistikleri güncelle
            const updates = {
                gamesPlayed: firebase.firestore.FieldValue.increment(1),
                totalStaked: firebase.firestore.FieldValue.increment(parseInt(stake))
            };
            
            if (isTie) {
                updates.gamesTied = firebase.firestore.FieldValue.increment(1);
            } else if (winnerAddress === creatorAddress) {
                updates.gamesWon = firebase.firestore.FieldValue.increment(1);
                updates.totalWon = firebase.firestore.FieldValue.increment(parseInt(stake) * 2);
            } else {
                updates.gamesLost = firebase.firestore.FieldValue.increment(1);
                updates.totalLost = firebase.firestore.FieldValue.increment(parseInt(stake));
            }
            
            await creatorDoc.ref.update(updates);
        }
        
        // Challenger istatistiklerini güncelle
        const challengerSnapshot = await db.collection('users')
            .where('walletAddress', '==', challengerAddress)
            .limit(1)
            .get();
            
        if (!challengerSnapshot.empty) {
            const challengerDoc = challengerSnapshot.docs[0];
            const challengerData = challengerDoc.data();
            
            // İstatistikleri güncelle
            const updates = {
                gamesPlayed: firebase.firestore.FieldValue.increment(1),
                totalStaked: firebase.firestore.FieldValue.increment(parseInt(stake))
            };
            
            if (isTie) {
                updates.gamesTied = firebase.firestore.FieldValue.increment(1);
            } else if (winnerAddress === challengerAddress) {
                updates.gamesWon = firebase.firestore.FieldValue.increment(1);
                updates.totalWon = firebase.firestore.FieldValue.increment(parseInt(stake) * 2);
            } else {
                updates.gamesLost = firebase.firestore.FieldValue.increment(1);
                updates.totalLost = firebase.firestore.FieldValue.increment(parseInt(stake));
            }
            
            await challengerDoc.ref.update(updates);
        }
    } catch (error) {
        console.error("Kullanıcı istatistikleri güncelleme hatası:", error);
    }
}

// Kullanıcı bilgilerini yükle
async function loadUserInfo() {
    try {
        if (!firebaseUser || !userAddress) {
            return;
        }
        
        // Kullanıcı profilini getir
        const userSnapshot = await db.collection('users')
            .where('walletAddress', '==', userAddress.toLowerCase())
            .limit(1)
            .get();
            
        if (userSnapshot.empty) {
            console.log("Kullanıcı profili bulunamadı");
            return;
        }
        
        const userDoc = userSnapshot.docs[0];
        const userData = userDoc.data();
        
        // Kullanıcı istatistiklerini göster
        const statsContainer = document.createElement('div');
        statsContainer.className = 'user-stats';
        statsContainer.innerHTML = `
            <h3>Oyun İstatistikleri</h3>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${userData.gamesPlayed || 0}</span>
                    <span class="stat-label">Toplam Oyun</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${userData.gamesWon || 0}</span>
                    <span class="stat-label">Kazanılan</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${userData.gamesLost || 0}</span>
                    <span class="stat-label">Kaybedilen</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${userData.gamesTied || 0}</span>
                    <span class="stat-label">Berabere</span>
                </div>
            </div>
            <div class="stats-grid">
                <div class="stat-item">
                    <span class="stat-value">${weiToEth(userData.totalStaked || 0)} ETH</span>
                    <span class="stat-label">Toplam Bahis</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${weiToEth(userData.totalWon || 0)} ETH</span>
                    <span class="stat-label">Kazanılan</span>
                </div>
                <div class="stat-item">
                    <span class="stat-value">${weiToEth(userData.totalLost || 0)} ETH</span>
                    <span class="stat-label">Kaybedilen</span>
                </div>
            </div>
        `;
        
        // Kullanıcı istatistiklerini sayfaya ekle
        const walletInfo = document.getElementById('wallet-info');
        walletInfo.appendChild(statsContainer);
    } catch (error) {
        console.error("Kullanıcı bilgileri yükleme hatası:", error);
    }
}

// Firebase'den oyunları getir
async function getFirebaseGames() {
    try {
        // Önce ACTIVE oyunları getir
        const activeGamesSnapshot = await db.collection('games')
            .where('state', '==', 'ACTIVE')
            .get();
        
        // Sonra JOINED oyunları getir
        const joinedGamesSnapshot = await db.collection('games')
            .where('state', '==', 'JOINED')
            .get();
        
        // Son olarak FINISHED oyunları getir
        const finishedGamesSnapshot = await db.collection('games')
            .where('state', '==', 'FINISHED')
            .get();
        
        // Tüm oyunları birleştir
        const games = [];
        
        activeGamesSnapshot.forEach(doc => {
            games.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        joinedGamesSnapshot.forEach(doc => {
            games.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        finishedGamesSnapshot.forEach(doc => {
            games.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        // Bellek içinde sıralama yap
        games.sort((a, b) => {
            const dateA = a.createdAt ? a.createdAt.toDate() : new Date(0);
            const dateB = b.createdAt ? b.createdAt.toDate() : new Date(0);
            return dateB - dateA; // Azalan sıralama (en yeniden en eskiye)
        });
        
        // İlk 20 oyunu al
        return games.slice(0, 20);
    } catch (error) {
        console.error("Oyun listesi hatası:", error);
        return [];
    }
}

// Provider'ın hazır olup olmadığını kontrol et
function ensureProvider() {
    if (!provider && window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum);
        console.log("Provider yeniden başlatıldı");
    }
    
    if (!provider) {
        throw new Error("Ethereum provider bulunamadı. Lütfen MetaMask yükleyin.");
    }
    
    return provider;
}

// Modal işlemleri
function openCreateGameModal() {
    // Modal'ı göster
    document.getElementById('create-game-modal').style.display = 'block';
    
    // Hamle seçimlerini sıfırla
    selectedMove = null;
    selectedStake = null;
    
    document.querySelectorAll('.move-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    document.querySelectorAll('.stake-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Hamle seçim butonlarına olay dinleyicisi ekle
    document.querySelectorAll('.move-option').forEach(option => {
        option.addEventListener('click', () => {
            // Önceki seçimi kaldır
            document.querySelectorAll('.move-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            option.classList.add('selected');
            
            // Seçilen hamleyi kaydet
            selectedMove = option.getAttribute('data-move');
        });
    });
    
    // Bahis seçim butonlarına olay dinleyicisi ekle
    document.querySelectorAll('.stake-option').forEach(option => {
        option.addEventListener('click', () => {
            // Önceki seçimi kaldır
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            option.classList.add('selected');
            
            // Seçilen bahisi kaydet
            selectedStake = option.getAttribute('data-stake');
        });
    });
    
    // Özel bahis input'una olay dinleyicisi ekle
    document.getElementById('custom-stake').addEventListener('input', (e) => {
        const value = e.target.value;
        if (value && !isNaN(value) && parseFloat(value) > 0) {
            // Önceki seçimleri kaldır
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Özel bahisi kaydet
            selectedStake = value;
        }
    });
    
    // Modal kapatma butonuna olay dinleyicisi ekle
    document.querySelector('.close-modal').addEventListener('click', closeModal);
}

// Modal'ı kapat
function closeModal() {
    document.getElementById('create-game-modal').style.display = 'none';
    document.getElementById('join-game-modal').style.display = 'none';
}

// Oyuna katılma modalını aç
function openJoinGameModal(gameId, stake) {
    // Modal'ı göster
    document.getElementById('join-game-modal').style.display = 'block';
    
    // Oyun bilgilerini göster
    document.getElementById('join-game-id').textContent = gameId;
    document.getElementById('join-game-stake').textContent = stake + ' ETH';
    
    // Hamle seçimlerini sıfırla
    selectedMove = null;
    
    document.querySelectorAll('.join-move-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Hamle seçim butonlarına olay dinleyicisi ekle
    document.querySelectorAll('.join-move-option').forEach(option => {
        option.addEventListener('click', () => {
            // Önceki seçimi kaldır
            document.querySelectorAll('.join-move-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            option.classList.add('selected');
            
            // Seçilen hamleyi kaydet
            selectedMove = option.getAttribute('data-move');
        });
    });
    
    // Katıl butonuna olay dinleyicisi ekle
    document.getElementById('confirm-join').addEventListener('click', async () => {
        if (!selectedMove) {
            alert("Lütfen bir hamle seçin");
            return;
        }
        
        try {
            await joinGame(gameId, selectedMove, stake);
            closeModal();
        } catch (error) {
            console.error("Oyuna katılma hatası:", error);
            alert("Oyuna katılma hatası: " + error.message);
        }
    });
    
    // Modal kapatma butonuna olay dinleyicisi ekle
    document.querySelector('.close-join-modal').addEventListener('click', closeModal);
}

// DOM yapısını kontrol et
function checkDOMStructure() {
    console.log("DOM Yapısı Kontrolü:");
    
    // games-list elementini kontrol et
    const gamesList = document.getElementById('games-list');
    console.log("games-list element:", gamesList);
    
    if (gamesList) {
        console.log("games-list içeriği:", gamesList.innerHTML);
        
        // Tab'ları kontrol et
        const tabs = gamesList.querySelector('.games-tabs');
        console.log("games-tabs element:", tabs);
        
        if (tabs) {
            // Tab butonlarını kontrol et
            const tabButtons = tabs.querySelectorAll('.tab-button');
            console.log("tab-button elements:", tabButtons.length);
            
            // Tab içeriklerini kontrol et
            const tabPanes = tabs.querySelectorAll('.tab-pane');
            console.log("tab-pane elements:", tabPanes.length);
            
            // Aktif tab'ı kontrol et
            const activeTab = tabs.querySelector('.tab-pane.active');
            console.log("active tab-pane:", activeTab);
            
            if (activeTab) {
                console.log("active tab-pane içeriği:", activeTab.innerHTML);
            }
        }
    }
}

// Oyun listesi elementini kontrol et
function checkGamesList() {
    const gamesList = document.getElementById('games-list');
    console.log("games-list element:", gamesList);
    
    if (!gamesList) {
        console.error("games-list elementi bulunamadı!");
        return;
    }
    
    // Element görünür mü?
    const style = window.getComputedStyle(gamesList);
    console.log("games-list display:", style.display);
    console.log("games-list visibility:", style.visibility);
    console.log("games-list height:", style.height);
    console.log("games-list width:", style.width);
    
    // Element içeriği
    console.log("games-list innerHTML:", gamesList.innerHTML);
    
    // Element pozisyonu
    const rect = gamesList.getBoundingClientRect();
    console.log("games-list position:", rect);
} 