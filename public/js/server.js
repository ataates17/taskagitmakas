const express = require('express');
const admin = require('firebase-admin');
const ethers = require('ethers');
const app = express();

// Firebase Admin başlat
admin.initializeApp({
  credential: admin.credential.cert(require('./serviceAccountKey.json'))
});

// Middleware
app.use(express.json());

// MetaMask imzası ile kimlik doğrulama
app.post('/api/auth', async (req, res) => {
    try {
        const { address, signature, message, nonce } = req.body;
        
        // İmzayı doğrula
        const recoveredAddress = ethers.utils.verifyMessage(message, signature);
        
        if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ error: 'Geçersiz imza' });
        }
        
        // Kullanıcıyı Firebase'de bul veya oluştur
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(`${address.toLowerCase()}@ethereum.org`);
        } catch (error) {
            // Kullanıcı yoksa oluştur
            userRecord = await admin.auth().createUser({
                email: `${address.toLowerCase()}@ethereum.org`,
                emailVerified: true,
                displayName: address,
                disabled: false
            });
            
            // Kullanıcı profili oluştur
            await admin.firestore().collection('users').doc(userRecord.uid).set({
                address: address,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                gamesPlayed: 0,
                gamesWon: 0,
                gamesLost: 0,
                gamesTied: 0,
                totalStaked: 0,
                totalWon: 0,
                totalLost: 0
            });
        }
        
        // Custom token oluştur
        const token = await admin.auth().createCustomToken(userRecord.uid, {
            address: address
        });
        
        res.json({ token });
    } catch (error) {
        console.error('Auth error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Blockchain olaylarını dinle ve Firebase'i güncelle
const listenToBlockchainEvents = () => {
    const provider = new ethers.providers.JsonRpcProvider('https://sepolia.infura.io/v3/3d2f9b78be8f40a8a31dbcb08d2f7865');
    const contract = new ethers.Contract(contractAddress, contractABI, provider);
    
    // GameCreated olayını dinle
    contract.on('GameCreated', async (gameId, creator, stake, event) => {
        console.log('Yeni oyun oluşturuldu:', gameId.toString());
        
        // Firebase'de bu oyunu bul
        const gamesSnapshot = await admin.firestore()
            .collection('games')
            .where('creatorAddress', '==', creator)
            .where('blockchain.confirmed', '==', false)
            .where('blockchain.txHash', '==', event.transactionHash)
            .get();
        
        if (!gamesSnapshot.empty) {
            const gameDoc = gamesSnapshot.docs[0];
            await gameDoc.ref.update({
                'blockchain.confirmed': true,
                'blockchain.gameId': gameId.toString(),
                'state': 'ACTIVE'
            });
        }
    });
    
    // GameJoined olayını dinle
    contract.on('GameJoined', async (gameId, challenger, stake, event) => {
        console.log('Oyuna katılım:', gameId.toString());
        
        // Firebase'de bu oyunu bul
        const gamesSnapshot = await admin.firestore()
            .collection('games')
            .where('blockchain.gameId', '==', gameId.toString())
            .get();
        
        if (!gamesSnapshot.empty) {
            const gameDoc = gamesSnapshot.docs[0];
            
            // Oyun sonucunu blockchain'den al
            const gameResult = await contract.getGameResult(gameId);
            
            await gameDoc.ref.update({
                'blockchain.joinConfirmed': true,
                'blockchain.joinTxHash': event.transactionHash,
                'state': 'FINISHED',
                'result': gameResult.winner,
                'finishedAt': admin.firestore.FieldValue.serverTimestamp()
            });
            
            // Kullanıcı istatistiklerini güncelle
            updateUserStats(gameDoc.data(), gameResult);
        }
    });
};

// Uygulama başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    listenToBlockchainEvents();
});
