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
                
                // Oyunları yükle
                loadGames();
            }
            
            // Platform istatistiklerini yükle
            loadPlatformStats();
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
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts.length === 0) {
                throw new Error("Kullanıcı cüzdan erişimine izin vermedi");
            }
            
            // Provider'ı yeniden başlat
            provider = new ethers.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
            userAddress = await signer.getAddress();
            
            // Bağlı cüzdan bilgisini göster
            const walletInfo = document.getElementById('wallet-info');
            walletInfo.textContent = shortenAddress(userAddress);
            walletInfo.style.display = 'block';
            
            // Kontratı signer ile bağla
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            
            // Cüzdan adresi ile kullanıcı oluştur veya giriş yap
            await signInWithWalletAddress();
            
            // Oyunları yükle
            loadGames();
            
            // Kullanıcı bilgilerini yükle
            loadUserInfo();
            
            // Oyun durumunu dinle ve otomatik reveal yap
            await setupGameEventListeners();
            
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

// Oyun oluşturma işleyicisi - artık kullanılmıyor, popup kullanılıyor
async function handleCreateGame() {
    openCreateGameModal();
}

// Oyun oluşturma transaction'ı
async function createGameTransaction(move, stake) {
    try {
        if (!move || move < 1 || move > 3) {
            throw new Error("Geçersiz hamle!");
        }

        // Minimum stake kontrolü
        const minStake = await contract.MIN_STAKE();
        const stakeWei = ethers.utils.parseEther(stake.toString());
        if (stakeWei.lt(minStake)) {
            throw new Error(`Minimum bahis miktarı: ${ethers.utils.formatEther(minStake)} ETH`);
        }

        // Aktif oyun sayısı kontrolü
        const activeGames = await contract.getActiveGames(userAddress);
        const maxGames = await contract.MAX_GAMES_PER_USER();
        if (activeGames.gte(maxGames)) {
            throw new Error(`Maksimum ${maxGames} aktif oyununuz olabilir`);
        }

        // Zaman kontrolü
        const nextAllowedTime = await contract.getNextAllowedGameTime(userAddress);
        if (nextAllowedTime.gt(0)) {
            const waitTime = Math.ceil(nextAllowedTime.toNumber() - Date.now() / 1000);
            throw new Error(`Lütfen ${waitTime} saniye bekleyin`);
        }

        // Rastgele bir salt değeri oluştur
        const salt = generateRandomSalt();
        
        // Commit hash'i oluştur - uint8 yerine uint olarak deneyelim
        const commitHash = ethers.utils.solidityKeccak256(
            ["uint", "string"],
            [move, salt]
        );
        
        console.log("Transaction detayları:", {
            commitHash,
            salt,
            move,
            stakeWei: stakeWei.toString()
        });

        // Kontrat fonksiyonlarını doğrula
        await validateContractFunctions();

        // Commit hash'i ve salt değerini gönder - farklı parametre sırası deneyelim
        const tx = await contract.createGame(commitHash, salt, {
            value: stakeWei,
            gasLimit: 500000
        });

        console.log("Transaction gönderildi:", tx.hash);
        console.log("Transaction onayı bekleniyor...");
        
        // Transaction'ı bekle
        const receipt = await tx.wait();
        console.log("Transaction receipt:", receipt);

        return receipt;
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        
        // Hata mesajını daha detaylı göster
        let errorMessage = "Bilinmeyen hata";
        
        if (error.reason) {
            errorMessage = error.reason;
        } else if (error.message) {
            errorMessage = error.message;
            
            // Revert sebebini çıkarmaya çalış
            const revertMatch = error.message.match(/reverted with reason string '([^']+)'/);
            if (revertMatch && revertMatch[1]) {
                errorMessage = revertMatch[1];
            }
        }
        
        // Hata mesajını göster
        const resultDiv = document.getElementById('create-result');
        if (resultDiv) {
            resultDiv.innerHTML = "Hata: " + errorMessage;
            resultDiv.className = "result error";
        }
        
        throw error;
    }
}

// Daha güvenli rastgele salt değeri oluştur
function generateRandomSalt() {
    // Basit bir salt değeri oluştur
    const randomBytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(randomBytes);
    } else {
        for (let i = 0; i < 16; i++) {
            randomBytes[i] = Math.floor(Math.random() * 256);
        }
    }
    
    // Hex string'e dönüştür
    let salt = '';
    for (let i = 0; i < randomBytes.length; i++) {
        salt += randomBytes[i].toString(16).padStart(2, '0');
    }
    
    return salt;
}

// Oyuna katılma işlemi
async function joinGameTransaction(gameId, move, stake) {
    try {
        // Cüzdan bağlı mı kontrol et
        if (!signer || !userAddress) {
            throw new Error("Lütfen önce cüzdanınızı bağlayın");
        }
        
        // Oyun bilgilerini kontrol et
        const gameCheck = await checkGameBeforeJoining(gameId);
        if (!gameCheck.valid) {
            throw new Error(gameCheck.error);
        }
        
        // Move'u sayıya çevir
        const moveValue = parseInt(move);
        
        // Stake'i kontrat'tan al
        const stakeWei = gameCheck.stake;
        
        console.log("Oyuna katılma detayları:", {
            gameId,
            move: moveValue,
            stake: ethers.utils.formatEther(stakeWei)
        });
        
        // Gas fiyatını al
        const feeData = await provider.getFeeData();
        console.log("Fee data:", {
            maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas, 'gwei'),
            maxPriorityFeePerGas: ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, 'gwei'),
            gasPrice: ethers.utils.formatUnits(feeData.gasPrice, 'gwei')
        });
        
        console.log("Transaction gönderiliyor...");
        
        // Oyuna katıl - BigNumber kullanarak
        const tx = await contract.joinGame(
            ethers.BigNumber.from(gameId), 
            ethers.BigNumber.from(moveValue), 
            {
                value: stakeWei,
                gasLimit: 500000
            }
        );
        
        console.log("Transaction gönderildi:", tx.hash);
        console.log("Transaction onayı bekleniyor...");
        
        // Transaction'ı bekle
        const receipt = await tx.wait();
        console.log("Transaction receipt:", receipt);
        
        return receipt;
    } catch (error) {
        console.error("Join Transaction detaylı hata:", error);
        
        // Hata mesajını daha detaylı göster
        let errorMessage = "Bilinmeyen hata";
        
        if (error.reason) {
            errorMessage = error.reason;
        } else if (error.message) {
            errorMessage = error.message;
            
            // Revert sebebini çıkarmaya çalış
            const revertMatch = error.message.match(/reverted with reason string '([^']+)'/);
            if (revertMatch && revertMatch[1]) {
                errorMessage = revertMatch[1];
            }
        }
        
        throw new Error(errorMessage);
    }
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
        // Oyunları yüklemeden önce kullanıcı kontrolü
        if (!userAddress) {
            document.getElementById('games-list').innerHTML = '<p>Lütfen önce cüzdanınızı bağlayın</p>';
            return;
        }
        
        if (!firebaseUser) {
            // Kullanıcı giriş yapmamış, cüzdan adresi ile giriş yap
            const success = await signInWithWalletAddress();
            if (!success) {
                document.getElementById('games-list').innerHTML = '<p>Kullanıcı oluşturulamadı. Lütfen cüzdanınızı kontrol edin.</p>';
                return;
            }
        }
        
        // Firebase'den oyunları yükle
        await loadFirebaseGames();
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = `
            <p class="error">Oyunlar yüklenirken bir hata oluştu: ${error.message}</p>
        `;
    }
}

// Oyunları sekmelere ayırarak render et
function renderGameTabs(openGames, activeGames, finishedGames) {
    const gamesList = document.getElementById('games-list');
    gamesList.innerHTML = '';
    
    // Sekme başlıkları
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'tabs-container';
    
    tabsContainer.innerHTML = `
        <div class="tabs">
            <button class="tab-btn active" data-tab="open-games">Açık Oyunlar <span class="badge">${openGames.length}</span></button>
            <button class="tab-btn" data-tab="active-games">Aktif Oyunlarım <span class="badge">${activeGames.length}</span></button>
            <button class="tab-btn" data-tab="finished-games">Tamamlanan Oyunlarım <span class="badge">${finishedGames.length}</span></button>
        </div>
    `;
    
    // Sekme içerikleri
    const tabContents = document.createElement('div');
    tabContents.className = 'tab-contents';
    
    // Açık oyunlar sekmesi
    const openGamesTab = document.createElement('div');
    openGamesTab.className = 'tab-content active';
    openGamesTab.id = 'open-games';
    openGamesTab.appendChild(renderGamesTable(openGames, 'open'));
    
    // Aktif oyunlar sekmesi
    const activeGamesTab = document.createElement('div');
    activeGamesTab.className = 'tab-content';
    activeGamesTab.id = 'active-games';
    activeGamesTab.appendChild(renderGamesTable(activeGames, 'active'));
    
    // Tamamlanan oyunlar sekmesi
    const finishedGamesTab = document.createElement('div');
    finishedGamesTab.className = 'tab-content';
    finishedGamesTab.id = 'finished-games';
    finishedGamesTab.appendChild(renderGamesTable(finishedGames, 'finished'));
    
    // Sekme içeriklerini ekle
    tabContents.appendChild(openGamesTab);
    tabContents.appendChild(activeGamesTab);
    tabContents.appendChild(finishedGamesTab);
    
    // Sekmeleri ve içerikleri ana container'a ekle
    gamesList.appendChild(tabsContainer);
    gamesList.appendChild(tabContents);
    
    // Sekme değiştirme işlevselliği
    const tabButtons = tabsContainer.querySelectorAll('.tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Aktif sekme butonunu değiştir
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Aktif içeriği değiştir
            const tabId = button.getAttribute('data-tab');
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Oyun tablosunu oluştur
function renderGamesTable(games, type) {
    if (games.length === 0) {
        const emptyMessage = document.createElement('p');
        
        if (type === 'open') {
            emptyMessage.textContent = 'Katılabileceğiniz açık oyun bulunmuyor.';
        } else if (type === 'active') {
            emptyMessage.textContent = 'Aktif oyununuz bulunmuyor.';
        } else {
            emptyMessage.textContent = 'Tamamlanan oyununuz bulunmuyor.';
        }
        
        return emptyMessage;
    }
    
    const table = document.createElement('table');
    table.className = 'games-table';
    
    // Tablo başlığı
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th>ID</th>
            <th>Oluşturan</th>
            <th>Katılan</th>
            <th>Bahis</th>
            <th>Durum</th>
            <th>İşlem</th>
        </tr>
    `;
    table.appendChild(thead);
    
    // Tablo içeriği
    const tbody = document.createElement('tbody');
    games.forEach(game => {
        const tr = document.createElement('tr');
        
        // Kullanıcının kendi oyunlarını vurgula
        if (game.isUserGame) {
            tr.className = 'user-game';
        }
        
        // Durum metni ve butonlar
        let statusBadge = '';
        let actionButton = '';
        
        switch(game.state) {
            case 0: // Created
                statusBadge = '<span class="status-badge status-created">Oluşturuldu</span>';
                if (game.creator === userAddress) {
                    actionButton = `<button class="btn small danger" onclick="cancelGame(${game.id})">İptal Et</button>`;
                } else {
                    actionButton = `<button class="btn small primary" onclick="prepareJoinGame(${game.id})">Katıl</button>`;
                }
                break;
            case 1: // Joined - Bu durum artık kullanılmıyor, oyunlar hemen sonuçlanıyor
                break;
            case 2: // Finished
                statusBadge = '<span class="status-badge status-finished">Tamamlandı</span>';
                if (game.winner === userAddress) {
                    statusBadge += ' <span class="badge win-badge">Kazandınız!</span>';
                } else if (game.winner !== ethers.constants.AddressZero && 
                          (game.creator === userAddress || game.challenger === userAddress)) {
                    statusBadge += ' <span class="badge lose-badge">Kaybettiniz</span>';
                } else if (game.winner === ethers.constants.AddressZero) {
                    statusBadge += ' <span class="badge draw-badge">Berabere</span>';
                }
                break;
            case 3: // Cancelled
                statusBadge = '<span class="status-badge status-cancelled">İptal Edildi</span>';
                break;
        }
        
        tr.innerHTML = `
            <td>${game.id}</td>
            <td>${shortenAddress(game.creator)}${game.creator === userAddress ? ' <span class="badge user-badge">Siz</span>' : ''}</td>
            <td>${game.challenger ? shortenAddress(game.challenger) + (game.challenger === userAddress ? ' <span class="badge user-badge">Siz</span>' : '') : '-'}</td>
            <td>${game.stake} ETH</td>
            <td>${statusBadge}</td>
            <td>${actionButton}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    return table;
}

// Oyuna katılmak için hazırlık
function prepareJoinGame(gameId) {
    document.getElementById('game-id').value = gameId;
    loadGameDetails();
    
    // Sayfayı oyuna katıl bölümüne kaydır
    document.querySelector('section:nth-child(3)').scrollIntoView({ behavior: 'smooth' });
}

// Oyun durumu metni
function getGameStateText(state) {
    switch(state) {
        case 0: return "Katılım Bekliyor";
        case 1: return "Oyun Başladı";
        case 2: return "Hamle Açıklandı";
        case 3: return "Tamamlandı";
        default: return "Bilinmiyor";
    }
}

// Oyun durumu CSS sınıfı
function getGameStateClass(state) {
    switch(state) {
        case 0: return "state-waiting";
        case 1: return "state-active";
        case 2: return "state-revealed";
        case 3: return "state-finished";
        default: return "state-unknown";
    }
}

// Kullanıcı bilgilerini yükle
async function loadUserInfo() {
    try {
        if (!firebaseUser || !userAddress) {
            return;
        }
        
        // Kullanıcı profilini getir
        const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
        if (!userDoc.exists) {
            return;
        }
        
        const userData = userDoc.data();
        
        // Kullanıcı istatistiklerini göster
        const statsContainer = document.createElement('div');
        statsContainer.className = 'user-stats';
        statsContainer.innerHTML = `
            <div class="stats-header">Oyuncu İstatistikleri</div>
            <div class="stats-item">
                <span class="label">Toplam Oyun:</span>
                <span class="value">${userData.gamesPlayed || 0}</span>
            </div>
            <div class="stats-item">
                <span class="label">Kazanılan:</span>
                <span class="value">${userData.gamesWon || 0}</span>
            </div>
            <div class="stats-item">
                <span class="label">Kaybedilen:</span>
                <span class="value">${userData.gamesLost || 0}</span>
            </div>
            <div class="stats-item">
                <span class="label">Berabere:</span>
                <span class="value">${userData.gamesTied || 0}</span>
            </div>
            <div class="stats-item">
                <span class="label">Toplam Bahis:</span>
                <span class="value">${ethers.utils.formatEther(userData.totalStaked || 0)} ETH</span>
            </div>
            <div class="stats-item">
                <span class="label">Toplam Kazanç:</span>
                <span class="value">${ethers.utils.formatEther(userData.totalWon || 0)} ETH</span>
            </div>
        `;
        
        // Kullanıcı istatistiklerini sayfaya ekle
        const walletInfo = document.getElementById('wallet-info');
        walletInfo.appendChild(statsContainer);
    } catch (error) {
        console.error("Kullanıcı bilgileri yükleme hatası:", error);
    }
}

// Oyun listesini güncelleme fonksiyonu
async function updateGameList() {
    try {
        const contract = new ethers.Contract(contractAddress, contractABI, provider);
        const gameCount = await contract.gameCount();
        
        const gameListElement = document.getElementById("gameList");
        gameListElement.innerHTML = "";
        
        for (let i = gameCount - 1; i >= Math.max(0, gameCount - 10); i--) {
            const game = await contract.games(i);
            const isValid = await contract.isValidGame(i);
            
            if (!isValid) continue;
            
            const gameState = await contract.getGameState(i);
            const gameInfo = document.createElement("div");
            gameInfo.className = "game-info";
            
            let stateText = "";
            switch (gameState.state) {
                case 0: stateText = "Oluşturuldu"; break;
                case 1: stateText = "Katılındı"; break;
                case 2: stateText = "Açıklandı"; break;
                case 3: stateText = "Tamamlandı"; break;
            }
            
            gameInfo.innerHTML = `
                <p>Oyun #${i}</p>
                <p>Oluşturan: ${game.creator}</p>
                <p>Bahis: ${ethers.utils.formatEther(game.stake)} ETH</p>
                <p>Durum: ${stateText}</p>
                ${game.state === 0 ? `
                    <button onclick="joinGamePrompt(${i}, '${ethers.utils.formatEther(game.stake)}')">
                        Oyuna Katıl
                    </button>
                ` : ''}
            `;
            
            gameListElement.appendChild(gameInfo);
        }
    } catch (error) {
        console.error("Oyun listesi güncelleme hatası:", error);
    }
}

// Yeni fonksiyonlar
async function getActiveGames(address) {
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    return await contract.getActiveGames(address);
}

async function getNextAllowedGameTime(address) {
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    return await contract.getNextAllowedGameTime(address);
}

async function emergencyWithdraw(gameId) {
    try {
        const signer = provider.getSigner();
        const contract = new ethers.Contract(contractAddress, contractABI, signer);
        const tx = await contract.emergencyWithdraw(gameId);
        await tx.wait();
        console.log("Acil durum çekilmesi başarılı!");
        updateGameList();
    } catch (error) {
        console.error("Acil durum çekilmesi hatası:", error);
    }
}

// Gas fiyatlarını kontrol et
async function checkGasPrices() {
    const block = await provider.getBlock("latest");
    const baseFee = block.baseFeePerGas;
    const gasPrice = await provider.getGasPrice();
    
    console.log("Gas Fiyatları:", {
        baseFee: ethers.utils.formatUnits(baseFee, "gwei") + " gwei",
        currentPrice: ethers.utils.formatUnits(gasPrice, "gwei") + " gwei",
        maxFeePerGas: ethers.utils.formatUnits(baseFee.mul(2), "gwei") + " gwei"
    });

    return {
        baseFee,
        gasPrice,
        maxFeePerGas: baseFee.mul(2)
    };
}

// Transaction göndermeden önce gas kontrolü
async function validateTransaction(value) {
    const gasPrices = await checkGasPrices();
    const balance = await provider.getBalance(userAddress);
    
    // Tahmini gas maliyeti (150,000 gas * current gas price)
    const estimatedGasCost = gasPrices.gasPrice.mul(150000);
    const totalCost = estimatedGasCost.add(value);
    
    if (balance.lt(totalCost)) {
        throw new Error(`Yetersiz bakiye. Gereken: ${ethers.utils.formatEther(totalCost)} ETH`);
    }
    
    return {
        gasPrice: gasPrices.gasPrice,
        gasLimit: 150000
    };
}

// Yeni oyun oluştur ve katıl
async function createAndJoinGame() {
    try {
        // Yeni oyun oluştur
        const createTx = await contract.createGame(1, {
            value: ethers.utils.parseEther("0.001"),
            gasLimit: 300000
        });
        const createReceipt = await createTx.wait();
        console.log("Oyun oluşturuldu:", createReceipt);
        
        // Oyun ID'sini al
        const gameId = await contract.gameCount() - 1;
        console.log("Oluşturulan oyun ID:", gameId.toString());
        
        // Oyuna katıl
        const joinTx = await contract.joinGame(gameId, 2, {
            value: ethers.utils.parseEther("0.001"),
            gasLimit: 300000
        });
        const joinReceipt = await joinTx.wait();
        console.log("Oyuna katılındı:", joinReceipt);
        
        return joinReceipt;
    } catch (error) {
        console.error("Hata:", error);
        throw error;
    }
}

// Test butonu için event listener
document.getElementById('create-and-join').addEventListener('click', async () => {
    const resultDiv = document.getElementById('test-result');
    resultDiv.innerHTML = "Test işlemi başlatılıyor...";
    resultDiv.className = "result pending";
    
    try {
        const receipt = await createAndJoinGame();
        resultDiv.innerHTML = "Test başarılı! Transaction: " + receipt.transactionHash;
        resultDiv.className = "result success";
        
        // Oyun listesini güncelle
        await loadGames();
    } catch (error) {
        resultDiv.innerHTML = "Test başarısız: " + error.message;
        resultDiv.className = "result error";
    }
});

// Reveal işlemi için fonksiyon
async function revealMove(gameId) {
    try {
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }
        
        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdNum);
        
        if (gameInfo.creator !== userAddress) {
            throw new Error("Sadece oyun yaratıcısı reveal yapabilir");
        }
        
        if (gameInfo.state !== 1) { // 1 = Joined state
            throw new Error("Oyun reveal için uygun durumda değil");
        }
        
        console.log("Reveal işlemi başlatılıyor...");
        const tx = await contract.revealMove(gameIdNum, {
            gasLimit: 300000
        });
        
        console.log("Reveal transaction gönderildi:", tx.hash);
        const receipt = await tx.wait(1);
        console.log("Reveal transaction onaylandı:", receipt);
        
        return receipt;
    } catch (error) {
        console.error("Reveal hatası:", error);
        throw error;
    }
}

// Reveal butonu için handler
async function handleRevealMove(gameId) {
    const resultDiv = document.getElementById('join-result');
    resultDiv.innerHTML = "Reveal işlemi başlatılıyor...";
    resultDiv.className = "result pending";
    
    try {
        const receipt = await revealMove(gameId);
        resultDiv.innerHTML = "Reveal başarılı! Transaction: " + receipt.transactionHash;
        resultDiv.className = "result success";
        
        // Oyun listesini güncelle
        await loadGames();
    } catch (error) {
        resultDiv.innerHTML = "Reveal başarısız: " + error.message;
        resultDiv.className = "result error";
    }
}

// Oyunu iptal et
async function cancelGame(gameId) {
    try {
        const gameIdNum = parseInt(gameId);
        if (isNaN(gameIdNum) || gameIdNum < 0) {
            throw new Error("Geçersiz oyun ID");
        }
        
        // Oyun bilgilerini kontrol et
        const gameInfo = await contract.getGameInfo(gameIdNum);
        
        if (gameInfo.creator !== userAddress) {
            throw new Error("Sadece oyun yaratıcısı iptal edebilir");
        }
        
        if (gameInfo.state !== 0) { // 0 = Created state
            throw new Error("Oyun iptal için uygun durumda değil");
        }
        
        console.log("İptal işlemi başlatılıyor...");
        const tx = await contract.cancelGame(gameIdNum, {
            gasLimit: 200000
        });
        
        console.log("İptal transaction gönderildi:", tx.hash);
        const receipt = await tx.wait(1);
        console.log("İptal transaction onaylandı:", receipt);
        
        // Oyun listesini güncelle
        await loadGames();
        
        return receipt;
    } catch (error) {
        console.error("İptal hatası:", error);
        alert("Oyun iptal edilirken hata: " + error.message);
        throw error;
    }
}

// Modal'ı aç
function openCreateGameModal() {
    document.getElementById('create-game-modal').style.display = 'block';
    document.getElementById('modal-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden'; // Sayfanın kaydırılmasını engelle
    
    // Seçimleri sıfırla
    resetModalSelections();
}

// Modal'ı kapat
function closeCreateGameModal() {
    document.getElementById('create-game-modal').style.display = 'none';
    document.getElementById('modal-overlay').style.display = 'none';
    document.body.style.overflow = 'auto'; // Sayfanın kaydırılmasını tekrar etkinleştir
}

// Modal seçimlerini sıfırla
function resetModalSelections() {
    // Hamle seçimlerini sıfırla
    selectedMove = null;
    selectedStake = null;
    
    // Hamle seçimlerini temizle
    document.querySelectorAll('#create-game-modal .move-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Bahis seçimlerini temizle
    document.querySelectorAll('.stake-option').forEach(option => {
        option.classList.remove('selected');
    });
    
    // Özel bahis alanını temizle
    const customStakeInput = document.getElementById('custom-stake');
    if (customStakeInput) {
        customStakeInput.value = '';
    }
    
    // Varsayılan bahis miktarını ayarla
    const stakeAmountInput = document.getElementById('stake-amount');
    if (stakeAmountInput) {
        stakeAmountInput.value = "0.01";
    }
    
    // Otomatik reveal seçeneğini varsayılan olarak etkinleştir
    const autoRevealCheckbox = document.getElementById('auto-reveal');
    if (autoRevealCheckbox) {
        autoRevealCheckbox.checked = true;
        autoRevealEnabled = true;
    } else {
        // Checkbox yoksa varsayılan olarak true kabul et
        autoRevealEnabled = true;
    }
    
    // Oluştur butonunu devre dışı bırak
    document.getElementById('modal-create-game').disabled = true;
    
    // Sonuç alanını temizle
    const modalResult = document.getElementById('modal-result');
    if (modalResult) {
        modalResult.innerHTML = '';
        modalResult.className = 'modal-result';
    }
    
    // Seçim özetini güncelle
    updateSelectionSummary();
}

// Seçim özetini güncelle
function updateSelectionSummary() {
    const moveValue = document.querySelector('.selected-move .value');
    const stakeValue = document.querySelector('.selected-stake .value');
    
    // Hamle seçimi
    if (selectedMove === 1) {
        moveValue.textContent = 'Taş';
    } else if (selectedMove === 2) {
        moveValue.textContent = 'Kağıt';
    } else if (selectedMove === 3) {
        moveValue.textContent = 'Makas';
    } else {
        moveValue.textContent = 'Seçilmedi';
    }
    
    // Bahis seçimi
    if (selectedStake) {
        stakeValue.textContent = `${selectedStake} ETH`;
    } else {
        stakeValue.textContent = 'Seçilmedi';
    }
    
    // Oluştur butonunu etkinleştir/devre dışı bırak
    const createButton = document.getElementById('modal-create-game');
    if (selectedMove && selectedStake) {
        createButton.disabled = false;
    } else {
        createButton.disabled = true;
    }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
    // Yeni oyun oluştur butonuna tıklandığında
    document.getElementById('create-game').addEventListener('click', function() {
        openCreateGameModal();
    });
    
    // Modal'ı kapatma butonları
    document.querySelector('.close-modal').addEventListener('click', closeCreateGameModal);
    document.querySelector('.cancel-modal').addEventListener('click', closeCreateGameModal);
    document.getElementById('modal-overlay').addEventListener('click', closeCreateGameModal);
    
    // Hamle seçimi
    document.querySelectorAll('.move-option').forEach(option => {
        option.addEventListener('click', function() {
            // Önceki seçimi temizle
            document.querySelectorAll('.move-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            this.classList.add('selected');
            selectedMove = parseInt(this.getAttribute('data-move'));
            
            // Özeti güncelle
            updateSelectionSummary();
        });
    });
    
    // Bahis seçimi (hazır opsiyonlar)
    document.querySelectorAll('.stake-option').forEach(option => {
        option.addEventListener('click', function() {
            // Özel input alanı ise işlem yapma
            if (this.classList.contains('custom')) return;
            
            // Önceki seçimi temizle
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Yeni seçimi işaretle
            this.classList.add('selected');
            selectedStake = parseFloat(this.getAttribute('data-stake'));
            
            // Gizli input'a değeri kaydet
            const stakeAmountInput = document.getElementById('stake-amount');
            if (stakeAmountInput) {
                stakeAmountInput.value = selectedStake;
            }
            
            // Özel girişi temizle
            const customStakeInput = document.getElementById('custom-stake');
            if (customStakeInput) {
                customStakeInput.value = '';
            }
            
            // Özeti güncelle
            updateSelectionSummary();
        });
    });
    
    // Özel bahis girişi
    document.getElementById('custom-stake').addEventListener('input', function() {
        const value = parseFloat(this.value);
        
        if (value && value >= 0.001) {
            // Önceki seçimi temizle
            document.querySelectorAll('.stake-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            
            // Özel seçeneği işaretle
            this.parentElement.classList.add('selected');
            selectedStake = value;
            
            // Gizli input'a değeri kaydet
            const stakeAmountInput = document.getElementById('stake-amount');
            if (stakeAmountInput) {
                stakeAmountInput.value = selectedStake;
            }
            
            // Özeti güncelle
            updateSelectionSummary();
        } else {
            selectedStake = null;
            this.parentElement.classList.remove('selected');
            updateSelectionSummary();
        }
    });
    
    // Otomatik reveal seçeneği değiştiğinde
    const autoRevealCheckbox = document.getElementById('auto-reveal');
    if (autoRevealCheckbox) {
        autoRevealCheckbox.addEventListener('change', function() {
            autoRevealEnabled = this.checked;
        });
    }
    
    // Modal içinde oyun oluştur butonuna tıklandığında
    document.getElementById('modal-create-game').addEventListener('click', async () => {
        if (selectedMove && selectedStake) {
            try {
                // Loading mesajı göster
                const resultDiv = document.getElementById('modal-result');
                if (resultDiv) {
                    resultDiv.innerHTML = "Oyun oluşturuluyor...";
                    resultDiv.className = "modal-result pending";
                }
                
                // Modal'ı kapat
                closeCreateGameModal();
                
                // Oyun oluştur
                const receipt = await createGameTransaction(selectedMove, selectedStake);
                
                // Başarı mesajı göster
                const mainResultDiv = document.getElementById('create-result');
                if (mainResultDiv) {
                    mainResultDiv.innerHTML = `Oyun başarıyla oluşturuldu! Transaction: ${receipt.transactionHash}`;
                    mainResultDiv.className = "result success";
                }
                
                // Oyun listesini güncelle
                await loadGames();
                
            } catch (error) {
                console.error("Oyun oluşturma hatası:", error);
                // Hata mesajı göster
                const resultDiv = document.getElementById('create-result');
                if (resultDiv) {
                    resultDiv.innerHTML = "Hata: " + error.message;
                    resultDiv.className = "result error";
                }
            }
        }
    });
});

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
        
        let html = '<div class="games-grid">';
        
        games.forEach(game => {
            const stake = game.stake ? ethers.utils.formatEther(game.stake) : '0';
            
            html += `
                <div class="game-card">
                    <div class="game-header">
                        <span class="game-id">Oyun #${game.blockchain?.gameId || game.id}</span>
                        <span class="game-stake">${stake} ETH</span>
                    </div>
                    <div class="game-creator">
                        <span class="label">Oluşturan:</span>
                        <span class="value">${shortenAddress(game.creatorAddress)}</span>
                    </div>
                    <div class="game-actions">
                        <button class="btn primary join-btn" data-id="${game.id}" data-stake="${stake}">
                            Oyuna Katıl
                        </button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        gamesList.innerHTML = html;
        
        // Oyuna katıl butonlarına olay dinleyicisi ekle
        document.querySelectorAll('.join-btn').forEach(button => {
            button.addEventListener('click', () => {
                const gameId = button.getAttribute('data-id');
                const stake = button.getAttribute('data-stake');
                openJoinGameModal(gameId, stake);
            });
        });
    } catch (error) {
        console.error("Oyunları yükleme hatası:", error);
        document.getElementById('games-list').innerHTML = `
            <p class="error">Oyunlar yüklenirken bir hata oluştu: ${error.message}</p>
        `;
    }
}

// Firebase'de oyun oluştur
async function createFirebaseGame(move, stake) {
    try {
        if (!firebaseUser) {
            // Kullanıcı giriş yapmamış, cüzdan adresi ile giriş yap
            const success = await signInWithWalletAddress();
            if (!success) {
                throw new Error("Kullanıcı oluşturulamadı. Lütfen cüzdanınızı kontrol edin.");
            }
        }
        
        // Salt ve commit hash oluştur
        const salt = generateRandomSalt();
        const commitHash = await createCommitment(move, salt);
        
        // Firebase'e oyun bilgilerini kaydet
        const gameRef = await db.collection('games').add({
            creator: firebaseUser.uid,
            creatorAddress: userAddress,
            stake: ethers.utils.parseEther(stake.toString()).toString(),
            commitHash: commitHash,
            salt: salt,
            move: parseInt(move),
            state: 'CREATED',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            blockchain: {
                confirmed: false,
                txHash: null,
                gameId: null
            }
        });
        
        console.log("Firebase'de oyun oluşturuldu:", gameRef.id);
        
        // Arka planda blockchain işlemini başlat
        createBlockchainGame(gameRef.id, commitHash, stake);
        
        return gameRef.id;
    } catch (error) {
        console.error("Oyun oluşturma hatası:", error);
        throw error;
    }
}

// Blockchain'de oyun oluştur (arka planda)
async function createBlockchainGame(gameId, commitHash, salt, stake) {
    try {
        // Blockchain'e oyun oluştur
        const stakeWei = ethers.utils.parseEther(stake.toString());
        const tx = await contract.createGame(commitHash, salt, {
            value: stakeWei,
            gasLimit: 500000
        });
        
        console.log("Blockchain transaction gönderildi:", tx.hash);
        
        // Firebase'i güncelle
        await db.collection('games').doc(gameId).update({
            'blockchain.txHash': tx.hash,
            'blockchain.pending': true
        });
        
        // Transaction'ı bekle
        const receipt = await tx.wait();
        
        // Başarılı ise Firebase'i güncelle
        if (receipt.status === 1) {
            // Blockchain'den oyun ID'sini al
            const blockchainGameId = await getGameIdFromReceipt(receipt);
            
            await db.collection('games').doc(gameId).update({
                'blockchain.confirmed': true,
                'blockchain.pending': false,
                'blockchain.gameId': blockchainGameId,
                'state': 'ACTIVE'
            });
            
            // Oyun listesini güncelle
            loadFirebaseGames();
        } else {
            // Başarısız ise hata durumunu güncelle
            await db.collection('games').doc(gameId).update({
                'blockchain.confirmed': false,
                'blockchain.pending': false,
                'blockchain.error': 'Transaction failed',
                'state': 'ERROR'
            });
        }
        
        return receipt;
    } catch (error) {
        console.error("Blockchain oyun oluşturma hatası:", error);
        
        // Hata durumunu Firebase'e kaydet
        await db.collection('games').doc(gameId).update({
            'blockchain.confirmed': false,
            'blockchain.pending': false,
            'blockchain.error': error.message,
            'state': 'ERROR'
        });
        
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
            updateUserStats(gameDoc.data(), result);
            
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