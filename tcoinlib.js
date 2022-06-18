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
                throw 'address prefix invalid'
            }
            const tmp = from_b58(addr.substr(5), alphabet)
            if (tmp.length != 34) {
                throw 'address length invalid'
            }
            if (tmp[0] != 1) {
                throw 'address prefix invalid'
            }
            let sum = 0
            for (let i = 1; i < 33; i++) {
                sum += tmp[i]
            }
            if (sum % 256 != tmp[33]) {
                throw 'address checksum invalid'
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
            const response = await api.post('estimate_gas', { origin: this.encodeAddr(pubkeyToAddr(tx.pubkey)), code: bytesToBase64(tx.data) })
            return response.data.gas
        },
        runViewCode: async function (origin, code) {
            const response = await api.post('run_view_raw_code', { origin: origin, code: bytesToBase64(code) })
            return { data: base64ToBytes(response.data.data), error: response.data.error }
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
                return new Date(x / 1e6).toLocaleString('zh-CN')
            },
            showUtf8: function (x) {
                const dec = new TextDecoder()
                return dec.decode(x)
            },
            encodeUvarint: encodeUvarint,
            encodeUint64BE: encodeUint64BE,
            decodeUvarint: decodeUvarint,
            decodeUint64LE: decodeUint64LE
        },
        nullAddr: new Uint8Array(Array(32).fill(0)),
    }
}

const tcoin = TCoin()

const codegen = (function () {
    const b = x => parseInt(x, 2)

    function checkOpcode(x) {
        if (x >= 128) {
            throw new Error('opcode error: ' + x)
        }
    }

    function checkReg(x) {
        if (x >= 32) {
            throw new Error('reg error: ' + x)
        }
    }

    function checkFunct3(x) {
        if (x >= 8) {
            throw new Error('funct3 error: ' + x)
        }
    }

    function checkFunct7(x) {
        if (x >= 128) {
            throw new Error('funct7 error: ' + x)
        }
    }

    function lshift(x, y) {
        while (y--) x *= 2
        return x
    }

    function genRType(opcode, rd, funct3, rs1, rs2, funct7) {
        checkOpcode(opcode)
        checkReg(rd)
        checkReg(rs1)
        checkReg(rs2)
        checkFunct3(funct3)
        checkFunct7(funct7)
        return opcode + (rd << 7) + (funct3 << 12) + (rs1 << 15) + (rs2 << 20) + lshift(funct7, 25)
    }


    function genIType(opcode, rd, funct3, rs1, imm) {
        checkOpcode(opcode)
        checkReg(rd)
        checkReg(rs1)
        checkFunct3(funct3)
        if (imm < -2048 || imm > 2047) {
            throw new Error('I-type imm error: ' + imm)
        }
        const immt = imm & 4095
        return opcode + (rd << 7) + (funct3 << 12) + (rs1 << 15) + lshift(immt, 20)
    }

    function genSType(opcode, funct3, rs1, rs2, imm) {
        checkOpcode(opcode)
        checkReg(rs1)
        checkReg(rs2)
        checkFunct3(funct3)
        if (imm < -2048 || imm > 2047) {
            throw new Error('S-type imm error: ' + imm)
        }
        const immt = imm & 4095
        const imm_4_0 = immt & b('11111')
        const imm_11_5 = immt >> 5
        return opcode + (imm_4_0 << 7) + (funct3 << 12) + (rs1 << 15) + (rs2 << 20) + lshift(imm_11_5, 25)
    }

    function genBType(opcode, funct3, rs1, rs2, imm) {
        checkOpcode(opcode)
        checkReg(rs1)
        checkReg(rs2)
        checkFunct3(funct3)
        if (imm < -4096 || imm > 4095 || imm % 2 != 0) {
            throw new Error('B-type imm error: ' + imm)
        }
        const immt = imm & 8191
        const imm_4_1 = immt >> 1 & b('1111')
        const imm_10_5 = immt >> 5 & b('111111')
        const imm_11 = immt >> 11 & 1
        const imm_12 = immt >> 12 & 1
        const imm_4_1_11 = imm_4_1 << 1 | imm_11
        const imm_12_10_5 = imm_12 << 6 | imm_10_5
        return opcode + (imm_4_1_11 << 7) + (funct3 << 12) + (rs1 << 15) + (rs2 << 20) + lshift(imm_12_10_5, 25)
    }

    function genUType(opcode, rd, imm) {
        checkOpcode(opcode)
        checkReg(rd)
        if (imm % 4096 != 0) {
            throw new Error('U-type imm error: ' + imm)
        }
        const immt = imm < 0 ? imm + 0x100000000 : imm
        return opcode + (rd << 7) + immt
    }

    function genJType(opcode, rd, imm) {
        checkOpcode(opcode)
        checkReg(rd)
        if (imm < -1048576 || imm > 1048575 || imm % 2 != 0) {
            throw new Error('J-type imm error: ' + imm)
        }
        const immt = imm & 2097151
        const imm_10_1 = immt >> 1 & b('1111111111')
        const imm_11 = immt >> 11 & 1
        const imm_19_12 = immt >> 12 & b('11111111')
        const imm_20 = immt >> 20 & 1
        const immn = imm_20 << 19 | imm_10_1 << 9 | imm_11 << 8 | imm_19_12
        return opcode + (rd << 7) + lshift(immn, 12)
    }

    function reg(x) {
        if (x == 'zero') return 0
        if (x == 'ra') return 1
        if (x == 'sp') return 2
        if (x == 'gp') return 3
        if (x == 'tp') return 4
        if (x == 'fp') return 8
        const v = parseInt(x.substring(1))
        if (x[0] == 'x') return v
        if (x[0] == 'a') return 10 + v
        if (x[0] == 't') {
            if (v < 3) return 5 + v
            return 25 + v
        }
        if (x[0] == 's') {
            if (v < 2) return 8 + v
            return 16 + v
        }
        throw new Error('unknown register: ' + x)
    }

    function parseMem(x) {
        if (x[x.length - 1] != ')') {
            throw new Error('unknown memory: ' + x)
        }
        const t = x.substring(0, x.length - 1).split('(')
        if (t.length != 2) {
            throw new Error('unknown memory: ' + x)
        }
        return [parseInt(t[0]), reg(t[1])]
    }

    function bytesToUint32(s) {
        let res = 0
        for (let i = 0; i < 4; i++) {
            res += lshift(s[i], i << 3)
        }
        return res
    }

    function bytesToUint64(s) {
        let res = 0
        for (let i = 0; i < 8; i++) {
            res += lshift(s[i], i << 3)
        }
        return res
    }

    function int32ToBytes(x) {
        const res = new Array(4)
        for (let i = 0; i < 4; i++) {
            res[i] = x % 256
            x = (x - x % 256) / 256
        }
        return res
    }

    function int64ToBytes(x) {
        const res = new Array(8)
        for (let i = 0; i < 8; i++) {
            res[i] = x % 256
            x = (x - x % 256) / 256
        }
        return res
    }

    function asmToBytes(asm) {
        const rest = []
        const tbuf = []
        const labels = {}
        const later = {}
        for (const line of ('_start:\n' + asm).split('\n')) {
            const t = line.trim()
            if (t.length == 0) continue
            if (t[t.length - 1] == ':') {
                labels[t.substring(0, t.length - 1)] = rest.length
                continue
            }
            if (t[0] == '.') {
                if (t.substring(1, 6) != 'byte ') {
                    throw new Error('only supports .byte')
                }
                tbuf.push(parseInt(t.substring(6)))
                if (tbuf.length == 4) {
                    rest.push(bytesToUint32(tbuf.splice(0, 4)))
                }
                continue
            }
            if (tbuf.length != 0) {
                throw new Error('insn not aligned to 4')
            }
            let op = line
            const args = []
            if (line.indexOf(' ') != -1) {
                const p = line.indexOf(' ')
                op = line.substring(0, p)
                for (const k of line.substring(p + 1).split(',')) {
                    args.push(k.trim())
                }
            }
            const lin = { op: op, args: args }
            switch (op) {
                case 'mv':
                    rest.push(genIType(b('0010011'), reg(args[0]), b('000'), reg(args[1]), 0))
                    break
                case 'la':
                    later[rest.length] = lin
                    rest.push(0, 0)
                    break
                case 'li': {
                    const rd = reg(args[0])
                    const v = parseInt(args[1])
                    const intLim = 0x80000000
                    if (v < 2048 && v >= -2048) {
                        rest.push(genIType(b('0010011'), rd, b('000'), 0, v))
                    } else if (v < intLim && v >= -intLim) {
                        let u = v & 0xfff
                        if (u >= 2048) {
                            u -= 4096
                        }
                        const v2 = v - u
                        rest.push(genUType(b('0110111'), rd, v2))
                        if (u != 0) {
                            rest.push(genIType(b('0011011'), rd, b('000'), rd, u))
                        }
                    } else {
                        const bs = int64ToBytes(v)
                        const vlo = bytesToUint32(bs.slice(0, 4))
                        const vhi = bytesToUint32(bs.slice(4, 8))
                        // different from toolchain
                        if (rest.length % 2 != 0) {
                            rest.push(genIType(b('0010011'), 0, b('000'), 0, 0))
                        }
                        rest.push(
                            genUType(b('0010111'), rd, 0),
                            genJType(b('1101111'), 0, 12),
                            vlo,
                            vhi,
                            genIType(b('0000011'), rd, b('011'), rd, 8)
                        )
                    }
                    break
                }
                case 'srli':
                    rest.push(genIType(b('0010011'), reg(args[0]), b('101'), reg(args[1]), parseInt(args[2])))
                    break
                case 'jalr': {
                    let rd, rs1
                    if (args.length == 1) {
                        rd = 1
                        rs1 = reg(args[0])
                    } else {
                        rd = reg(args[0])
                        rs1 = reg(args[1])
                    }
                    rest.push(genIType(b('1100111'), rd, b('000'), rs1, 0))
                    break
                }
                case 'j':
                    later[rest.length] = lin
                    rest.push(0)
                    break
                case 'beq':
                    later[rest.length] = lin
                    rest.push(0)
                    break
                case 'bne':
                    later[rest.length] = lin
                    rest.push(0)
                    break
                case 'ret':
                    rest.push(genIType(b('1100111'), 0, b('000'), 1, 0))
                    break
                case 'addi':
                    rest.push(genIType(b('0010011'), reg(args[0]), b('000'), reg(args[1]), parseInt(args[2])))
                    break
                case 'sub':
                    rest.push(genRType(b('0110011'), reg(args[0]), b('000'), reg(args[1]), reg(args[2]), b('0100000')))
                    break
                case 'lb': {
                    const [offset, rs1] = parseMem(args[1])
                    rest.push(genIType(b('0000011'), reg(args[0]), b('000'), rs1, offset))
                    break
                }
                case 'ld': {
                    const [offset, rs1] = parseMem(args[1])
                    rest.push(genIType(b('0000011'), reg(args[0]), b('011'), rs1, offset))
                    break
                }
                case 'sb': {
                    const [offset, rs1] = parseMem(args[1])
                    rest.push(genSType(b('0100011'), b('000'), rs1, reg(args[0]), offset))
                    break
                }
                case 'sd': {
                    const [offset, rs1] = parseMem(args[1])
                    rest.push(genSType(b('0100011'), b('011'), rs1, reg(args[0]), offset))
                    break
                }
                default:
                    throw new Error(op + ' not implemented')
            }
        }
        for (const pt in later) {
            const lin = later[pt]
            const p = parseInt(pt)
            const args = lin.args
            switch (lin.op) {
                case 'la': {
                    const diff = (labels[args[1]] - p) * 4
                    const rd = reg(args[0])
                    rest[p] = genUType(b('0010111'), rd, 0)
                    rest[p + 1] = genIType(b('0010011'), rd, b('000'), rd, diff)
                    break
                }
                case 'j': {
                    const diff = (labels[args[0]] - p) * 4
                    rest[p] = genJType(b('1101111'), 0, diff)
                    break
                }
                case 'beq': {
                    const diff = (labels[args[2]] - p) * 4
                    rest[p] = genBType(b('1100011'), b('000'), reg(args[0]), reg(args[1]), diff)
                    break
                }
                case 'bne': {
                    const diff = (labels[args[2]] - p) * 4
                    rest[p] = genBType(b('1100011'), b('001'), reg(args[0]), reg(args[1]), diff)
                    break
                }
                default:
                    throw new Error(lin.op + ' not implemented in phase 2', lin.op)
            }
        }
        //console.log(rest)
        const res = []
        for (const k of rest) {
            res.push(...int32ToBytes(k))
        }
        return new Uint8Array(res)
    }

    function asAsmByteArr(st) {
        const s = [...st]
        while (s.length % 4 != 0) s.push(0)
        const res = []
        for (const x of s) {
            res.push('.byte ' + x)
        }
        return res.join('\n')
    }

    function fnv1a_32(s) {
        let r = 2166136261
        for (let i = 0; i < s.length; i++) {
            const t = r ^ s.charCodeAt(i)
            r = (((t & 0xff) << 24) + (t * 0x193)) & 0xffffffff
        }
        return r
    }

    function genWorker(op, addr, method, argSpec, callValue, args) {
        const selector = fnv1a_32(method)
        const s = [
            'mv s0, ra',
            'la a0, caddr',
            'li t0, -72',
            'srli t0, t0, 1',
            'jalr t0',
            'mv s1, a0',
            'j later',
            'calldata:',
        ]
        const final = [
            'mv ra, s0',
            'ret',
            'caddr:',
            asAsmByteArr(tcoin.decodeAddr(addr))
        ]
        const at = argSpec.substring(1)
        let a1s
        if (at.length == 0) {
            a1s = 'li a1, 0'
        } else if (at.length == 1 && at[0] == 'i') {
            a1s = 'li a1, ' + args[0]
        } else {
            a1s = 'la a1, calldata'
            const datas = []
            let pos = 0x10000020 + 0x8 * at.length
            for (let i = 0; i < at.length; i++) {
                let k
                if (at[i] == 'i') {
                    k = parseInt(args[i])
                } else if (at[i] == 'a') {
                    k = pos
                    const addr = tcoin.decodeAddr(args[i])
                    datas.push(asAsmByteArr(addr))
                    pos += addr.length
                }
                s.push(asAsmByteArr(int64ToBytes(k)))
            }
            if (at.length == 1) {
                s.splice(s.length - 1)
                s.push(datas[0])
            } else {
                s.push(...datas)
            }
        }
        if (callValue == 0) {
            s.push(
                'later:',
                'li a0, ' + selector,
                a1s,
                'jalr s1',
            )
        } else {
            s.push(
                'later:',
                'mv a0, s1',
                'li a1, ' + selector,
                a1s.replace('a1', 'a2'),
                'li a3, ' + callValue,
                'li a4, 1000000000',
                'addi a5, sp, -1200',
                'addi a6, a5, 8',
                'li t0, -80',
                'srli t0, t0, 1',
                'jalr t0',
                'lb t1, 0(a5)',
                'bne t1, zero, success',
                'mv a0, a6',
                'li t0, -88',
                'srli t0, t0, 1',
                'jalr t0',
                'success:',
            )
        }
        if (op == 'read') {
            if (argSpec[0] == 'i') {
                s.push(
                    'sd a0, -8(sp)',
                    'li a0, 8',
                    'sd a0, -16(sp)',
                    'addi a0, sp, -16',
                )
            } else if (argSpec[0] == 'c') {
                s.push(
                    'addi a1, sp, -1024',
                    'mv a2, a1',
                    'loop:',
                    'lb a3, 0(a0)',
                    'beq a3, zero, final',
                    'sb a3, 0(a2)',
                    'addi a0, a0, 1',
                    'addi a2, a2, 1',
                    'j loop',
                    'final:',
                    'addi a0, a1, -8',
                    'sub a2, a2, a1',
                    'sd a2, 0(a0)',
                )
            } else if (argSpec[0] == 'a') {
                s.push(
                    'ld t0, 0(a0)',
                    'sd t0, -32(sp)',
                    'ld t0, 8(a0)',
                    'sd t0, -24(sp)',
                    'ld t0, 16(a0)',
                    'sd t0, -16(sp)',
                    'ld t0, 24(a0)',
                    'sd t0, -8(sp)',
                    'addi a0, sp, -40',
                    'li t0, 32',
                    'sd t0, 0(a0)',
                )
            }
        }
        s.push(...final)
        return asmToBytes(s.join('\n'))
    }

    function parseResult(r, data) {
        if (r == 'i') {
            return bytesToUint64(data)
        } else if (r == 'c') {
            return tcoin.utils.showUtf8(data)
        } else if (r == 'a') {
            return tcoin.encodeAddr(data)
        }
    }

    return {
        asmToBytes: asmToBytes,
        genWorker: genWorker,
        parseResult: parseResult,
    }
})()