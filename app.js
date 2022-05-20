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

const api = axios.create({ baseURL: rpcUrl });

const opts = { dark: false };
Vue.use(Vuetify);

const CreateWallet = {
    template: `
    <v-col>
        <h2>Create Wallet</h2>
        <v-textarea :value="privkeyHex" style="font-size:20px" rows="2" no-resize readonly></v-textarea>
        <p>Please save your private key securely!</p>
        <v-btn class="no-upper-case" outlined @click="submit"> I Saved </v-btn>
    </v-col>
    `,
    data: function () {
        return {
            privkey: '',
            privkeyHex: '',
        }
    },
    created: function () {
        this.privkey = nobleEd25519.utils.randomPrivateKey()
        this.privkeyHex = toHex(this.privkey)
    },
    methods: {
        submit: function () {
            localStorage.privkey = this.privkeyHex
            this.$router.push({ name: 'index' })
        }
    }
}

const Index = {
    template: `
    <v-col>
        <h2>Wallet Overview</h2>
        <p> {{ eaddr }} <v-btn text icon small v-on:click="copyAddr"><v-icon>mdi-content-copy</v-icon></v-btn> </p>
        <p> Balance: {{ showCoin(balance) }} TCoin <v-btn text small @click="send" class="no-upper-case">Send</v-btn></p>
    </v-col>
    `,
    data: function () {
        return {
            privkey: '',
            pubkey: '',
            addr: '',
            eaddr: '',
            balance: 0,
        }
    },
    created: function () {
        initWallet(this).then(() => {
            api.get('get_account_info/' + this.eaddr).then(response => {
                this.balance = response.data.data.balance
            })
        })
    },
    methods: {
        copyAddr: function () {
            copyTextToClipboard(this.eaddr)
        },
        send: function () {
            this.$router.push({ name: 'send' })
        }
    }
}

const Send = {
    template: `
    <v-col>
        <h2>Send funds</h2>
        <v-text-field v-model="toAddr" label="Recipient address" :rules="[addrCheck]"></v-text-field>
        <v-text-field v-model="amount" label="Amount" suffix="TCoin"></v-text-field>
        <v-text-field v-model="msg" label="Additional message"></v-text-field>
        <v-btn class="no-upper-case" outlined @click="submit"> Send </v-btn>
    </v-col>
    `,
    data: function () {
        return {
            privkey: '',
            pubkey: '',
            addr: '',
            eaddr: '',
            toAddr: '',
            amount: 0,
            msg: '',
        }
    },
    created: function () {
        initWallet(this)
    },
    methods: {
        addrCheck: function () {
            if (this.toAddr == '') return 'recipient cannot be empty'
            try {
                decodeAddr(this.toAddr)
            } catch (e) {
                return e
            }
            return true
        },
        submit: function () {
            const intAmount = Math.floor(this.amount * 1000000000)
            api.get('get_account_info/' + this.eaddr).then(response => {
                genTx(this, this.toAddr, intAmount, response.data.data.nonce, this.msg).then(txData => {
                    api.post('submit_tx', { tx: bytesToBase64(txData) }).then(_ => {
                        this.$router.push({ name: 'index' })
                    })
                })
            })
        }
    }
}

const router = new VueRouter({
    mode: 'hash',
    routes: [
        { path: '/', component: Index, name: 'index' },
        { path: '/create', component: CreateWallet, name: 'create_wallet' },
        { path: '/send', component: Send, name: 'send' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})