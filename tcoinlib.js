const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const rpcUrl = 'https://uarpc.mcfx.us/'

function getAddr(pubkey) {
    return fromHex(sha256(pubkey))
}

function encodeAddr(addr) {
    let sum = 0
    for (let i = 0; i < 32; i++) {
        sum += addr[i]
    }
    const tmp = new Uint8Array([1, ...addr, sum % 256])
    return 'tcoin' + to_b58(tmp, alphabet)
}

function decodeAddr(addr) {
    if (!addr.startsWith('tcoin')) {
        throw "address prefix invalid"
    }
    const tmp = from_b58(addr.substr(5), alphabet)
    if (tmp.length != 34) {
        throw "address length invalid"
    }
    if (tmp[0] != 1) {
        throw "address prefix invalid"
    }
    let sum = 0
    for (let i = 1; i < 33; i++) {
        sum += tmp[i]
    }
    if (sum % 256 != tmp[33]) {
        throw "address checksum invalid"
    }
    return tmp.slice(1, 33)
}

async function initWallet(x) {
    if (!localStorage.privkey) {
        x.$router.push({ name: 'create_wallet' })
    }
    x.privkey = fromHex(localStorage.privkey)
    x.pubkey = await nobleEd25519.getPublicKey(x.privkey)
    x.addr = getAddr(x.pubkey)
    x.eaddr = encodeAddr(x.addr)
}

function appendUvarint(s, x) {
    while (x >= 128) {
        s.push(x % 128 + 128)
        x = (x - x % 128) / 128
    }
    s.push(x)
}

function encodeUint64(x) {
    const res = new Array(8)
    for (let i = 0; i < 8; i++) {
        res[7 - i] = x % 256
        x = (x - x % 256) / 256
    }
    return res
}

async function genTx(x, toAddr, amount, nonce, msg) {
    const enc = new TextEncoder()
    const msgEnc = enc.encode(msg)
    const signData = new Uint8Array([
        ...decodeAddr(toAddr),
        ...encodeUint64(amount),
        ...encodeUint64(0),
        ...encodeUint64(0),
        ...encodeUint64(nonce),
        ...msgEnc
    ])
    const sig = await nobleEd25519.sign(signData, x.privkey)
    const data = [
        1,
        ...x.pubkey,
        ...sig,
        ...decodeAddr(toAddr),
    ]
    appendUvarint(data, amount)
    appendUvarint(data, 0)
    appendUvarint(data, 0)
    appendUvarint(data, nonce)
    appendUvarint(data, msgEnc.length)
    return new Uint8Array([...data, ...msgEnc])
}

function showCoin(x) {
    const bn = 1000000000
    if (x % bn == 0) {
        return (x / bn).toString()
    }
    return ((x - x % bn) / bn).toString() + '.' + (bn + x % bn).toString().substring(1)
}