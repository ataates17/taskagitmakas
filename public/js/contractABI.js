// Yeni kontrat ABI'si
const contractABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stake",
        "type": "uint256"
      }
    ],
    "name": "GameCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "winner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "prize",
        "type": "uint256"
      }
    ],
    "name": "GameFinished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "challenger",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "enum RockPaperScissorsV3.Move",
        "name": "move",
        "type": "uint8"
      }
    ],
    "name": "GameJoined",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commit",
        "type": "bytes32"
      }
    ],
    "name": "createGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "gameCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "games",
    "outputs": [
      {
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "challenger",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "creatorCommit",
        "type": "bytes32"
      },
      {
        "internalType": "enum RockPaperScissorsV3.Move",
        "name": "creatorMove",
        "type": "uint8"
      },
      {
        "internalType": "enum RockPaperScissorsV3.Move",
        "name": "challengerMove",
        "type": "uint8"
      },
      {
        "internalType": "uint256",
        "name": "stake",
        "type": "uint256"
      },
      {
        "internalType": "bool",
        "name": "finished",
        "type": "bool"
      },
      {
        "internalType": "address",
        "name": "winner",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "gameId",
        "type": "uint256"
      },
      {
        "internalType": "enum RockPaperScissorsV3.Move",
        "name": "move",
        "type": "uint8"
      },
      {
        "internalType": "string",
        "name": "secret",
        "type": "string"
      }
    ],
    "name": "joinGame",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  }
];

// Sepolia testnet üzerindeki kontrat adresi
const contractAddress = "0x6B4d5C70b79916192ab7d16AcBa2D5b4A6c5Af8d"; // Yeni kontrat adresinizi buraya ekleyin