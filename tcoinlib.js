const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const rpcUrl = 'https://tcrpc2.mcfx.us/'

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

function encodeUint64BE(x) {
    const res = new Array(8)
    for (let i = 0; i < 8; i++) {
        res[7 - i] = x % 256
        x = (x - x % 256) / 256
    }
    return res
}

function decodeUvarint(s, k) {
    let res = 0, cur = 1
    while (s[k] >= 128) {
        res += (s[k] - 128) * cur
        k++
        cur *= 128
    }
    res += s[k] * cur
    return [k + 1, res]
}

function decodeUint64LE(x) {
    let res = 0
    for (let i = 7; i >= 0; i--) {
        res = res * 256 + x[i]
    }
    return res
}

async function genTx(x, toAddr, amount, nonce, msg) {
    const enc = new TextEncoder()
    const msgEnc = enc.encode(msg)
    const signData = new Uint8Array([
        ...decodeAddr(toAddr),
        ...encodeUint64BE(amount),
        ...encodeUint64BE(100000),
        ...encodeUint64BE(0),
        ...encodeUint64BE(nonce),
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

function readTx(s, cur) {
    const oldCur = cur
    cur++
    const pubkey = s.slice(cur, cur + 32)
    cur += 32
    const sig = s.slice(cur, cur + 64)
    cur += 64
    const toAddr = s.slice(cur, cur + 32)
    cur += 32
    const [cur1, value] = decodeUvarint(s, cur)
    const [cur2, gasLimit] = decodeUvarint(s, cur1)
    const [cur3, fee] = decodeUvarint(s, cur2)
    const [cur4, nonce] = decodeUvarint(s, cur3)
    const [cur5, dataLen] = decodeUvarint(s, cur4)
    return [{
        pubkey: pubkey,
        sig: sig,
        fromAddr: getAddr(pubkey),
        toAddr: toAddr,
        value: value,
        gasLimit: gasLimit,
        fee: fee,
        nonce: nonce,
        data: s.slice(cur5, cur5 + dataLen),
        raw: s.slice(oldCur, cur5 + dataLen)
    }, cur5 + dataLen]
}

function decodeTx(s) {
    return readTx(s, 0)[0]
}

function decodeBlock(s) {
    let cur = 0
    const hash = s.slice(cur, cur + 32)
    cur += 32
    const parentHash = s.slice(cur, cur + 32)
    cur += 32
    const bodyHash = s.slice(cur, cur + 32)
    cur += 32
    const extraData = s.slice(cur, cur + 32)
    cur += 32
    const miner = s.slice(cur, cur + 32)
    cur += 32
    const timet = s.slice(cur, cur + 8)
    cur += 8
    const time = decodeUint64LE(timet)
    const [cur1, txCount] = decodeUvarint(s, cur)
    const txs = new Array(txCount)
    cur = cur1
    for (let i = 0; i < txCount; i++) {
        const [tx, cur2] = readTx(s, cur)
        cur = cur2
        txs[i] = tx
    }
    return {
        hash: hash,
        parentHash: parentHash,
        bodyHash: bodyHash,
        extraData: extraData,
        miner: miner,
        time: time,
        txs: txs
    }
}

function showCoin(x) {
    const bn = 1000000000
    if (x % bn == 0) {
        return (x / bn).toString()
    }
    res = ((x - x % bn) / bn).toString() + '.' + (bn + x % bn).toString().substring(1)
    while (res.substring(res.length - 1) == '0') res = res.substring(0, res.length - 1)
    return res
}

function formatTime(x) {
    return new Date(x / 1e6).toLocaleString("zh-CN")
}

function showUtf8(x) {
    const dec = new TextDecoder()
    return dec.decode(x)
}