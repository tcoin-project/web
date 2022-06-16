const TCoin = function (rpcUrl) {
    const api = axios.create({ baseURL: rpcUrl || 'https://tcrpc2.mcfx.us/' });
    const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

    function pubkeyToAddr(pubkey) {
        return fromHex(sha256(pubkey))
    }

    function encodeUvarint(s, x) {
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

    function readTx(s, cur) {
        const oldCur = cur
        const tp = s[cur++]
        const pubkey = s.slice(cur, cur + 32)
        cur += 32
        const sig = s.slice(cur, cur + 64)
        cur += 64
        var toAddr1, value1
        if (tp == 1) {
            const toAddr = s.slice(cur, cur + 32)
            cur += 32
            const [cur1, value] = decodeUvarint(s, cur)
            cur = cur1
            toAddr1 = toAddr
            value1 = value
        } else {
            toAddr1 = new Uint8Array(32)
            value1 = 0
        }
        const [cur2, gasLimit] = decodeUvarint(s, cur)
        const [cur3, fee] = decodeUvarint(s, cur2)
        const [cur4, nonce] = decodeUvarint(s, cur3)
        const [cur5, dataLen] = decodeUvarint(s, cur4)
        return [{
            type: tp,
            pubkey: pubkey,
            sig: sig,
            fromAddr: pubkeyToAddr(pubkey),
            toAddr: toAddr1,
            value: value1,
            gasLimit: gasLimit,
            fee: fee,
            nonce: nonce,
            data: s.slice(cur5, cur5 + dataLen),
            raw: s.slice(oldCur, cur5 + dataLen)
        }, cur5 + dataLen]
    }

    return {
        pubkeyToAddr: pubkeyToAddr,
        encodeAddr: function (addr) {
            let sum = 0
            for (let i = 0; i < 32; i++) {
                sum += addr[i]
            }
            const tmp = new Uint8Array([1, ...addr, sum % 256])
            return 'tcoin' + to_b58(tmp, alphabet)
        },
        decodeAddr: function (addr) {
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
        },
        signTx: async function (tx, privkey) {
            let tmp = []
            if (tx.type != 1) {
                tmp = [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff - tx.type]
            }
            const signData = new Uint8Array([
                ...tx.toAddr,
                ...encodeUint64BE(tx.value),
                ...encodeUint64BE(tx.gasLimit),
                ...encodeUint64BE(tx.fee),
                ...tmp,
                ...encodeUint64BE(tx.nonce),
                ...tx.data
            ])
            return await nobleEd25519.sign(signData, privkey)
        },
        encodeTx: function (tx) {
            let recTmp = []
            if (tx.type == 1) {
                recTmp = tx.toAddr
            }
            const data = [
                tx.type,
                ...tx.pubkey,
                ...tx.sig,
                ...recTmp,
            ]
            if (tx.type == 1) {
                encodeUvarint(data, tx.value)
            }
            encodeUvarint(data, tx.gasLimit)
            encodeUvarint(data, tx.fee)
            encodeUvarint(data, tx.nonce)
            encodeUvarint(data, tx.data.length)
            return new Uint8Array([...data, ...tx.data])
        },
        decodeTx: function (s) {
            return readTx(s, 0)[0]
        },
        decodeBlock: function (s) {
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
        },
        estimateGas: async function (tx) {
            if (tx.type == 1) {
                return 40000 + tx.data.length
            }
            api.post('estimate_gas', { origin: pubkeyToAddr(tx.pubkey), code: bytesToBase64(tx.data) }).then(response => {
                return response.data.gas
            })
        },
        getAccountInfo: async function (addr) {
            const response = await api.get('get_account_info/' + addr)
            return response.data.data
        },
        getBalance: async function (addr) {
            return (await this.getAccountInfo(addr)).balance
        },
        getNonce: async function (addr) {
            return (await this.getAccountInfo(addr)).nonce
        },
        sendTransaction: async function (tx) {
            const txData = this.encodeTx(tx)
            return await api.post('submit_tx', { tx: bytesToBase64(txData) })
        },
        getAccountTransactions: async function (addr, page) {
            const response = await api.get('explorer/get_account_transactions/' + addr + '/' + page)
            return response.data
        },
        getTransactionByHash: async function (txh) {
            const response = await api.get('explorer/get_transaction/' + txh)
            return this.decodeTx(base64ToBytes(response.data.tx))
        },
        utils: {
            showCoin: function (x) {
                const bn = 1000000000
                if (x % bn == 0) {
                    return (x / bn).toString()
                }
                res = ((x - x % bn) / bn).toString() + '.' + (bn + x % bn).toString().substring(1)
                while (res.substring(res.length - 1) == '0') res = res.substring(0, res.length - 1)
                return res
            },
            formatTime: function (x) {
                return new Date(x / 1e6).toLocaleString("zh-CN")
            },
            showUtf8: function (x) {
                const dec = new TextDecoder()
                return dec.decode(x)
            },
            encodeUvarint: encodeUvarint,
            encodeUint64BE: encodeUint64BE,
            decodeUvarint: decodeUvarint,
            decodeUint64LE: decodeUint64LE
        }
    }
}

const tcoin = TCoin()