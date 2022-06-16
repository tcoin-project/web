const api = axios.create({ baseURL: 'https://tcrpc2.mcfx.us/' });

const opts = { dark: false };
Vue.use(Vuetify);

window.msgCache = {}

async function initWallet(x) {
    if (!localStorage.privkey) {
        x.$router.push({ name: 'create_wallet' })
    }
    x.privkey = fromHex(localStorage.privkey)
    x.pubkey = await nobleEd25519.getPublicKey(x.privkey)
    x.addr = tcoin.pubkeyToAddr(x.pubkey)
    x.eaddr = tcoin.encodeAddr(x.addr)
}

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
        <p>
            {{ eaddr }}
            <v-btn text icon small v-on:click="copyTextToClipboard(eaddr)"><v-icon>mdi-content-copy</v-icon></v-btn>
            <v-btn text icon small :href="'/explorer/#/account/' + eaddr"><v-icon>mdi-open-in-new</v-icon></v-btn>
        </p>
        <p> Balance: {{ tcoin.utils.showCoin(balance) }} TCoin <v-btn text small @click="send" class="no-upper-case">Send</v-btn></p>
        <v-card v-for="tx in stxs">
            <v-card-title>
                <div style="display:inline-box;width:100%">
                    <span :style="'float:left;color:' + tx.colorMain">{{ tx.op }}</span>
                    <span :style="'float:right;color:' + tx.color">{{ tx.prefix + tcoin.utils.showCoin(tx.value) }} TCoin</span>
                </div>
            </v-card-title>
            <v-card-subtitle v-if="tx.op == 'Mined'">
                Miner Reward of Block {{ tx.blockid }}
                <v-btn text icon small :href="'/explorer/#/block/' + tx.blockid"><v-icon small>mdi-open-in-new</v-icon></v-btn>
            </v-card-subtitle>
            <v-card-subtitle v-else>
                {{ tx.addr }}
                <v-btn text icon small v-on:click="copyTextToClipboard(tx.addr)"><v-icon small>mdi-content-copy</v-icon></v-btn>
                <v-btn text icon small :href="'/explorer/#/tx/' + tx.hash"><v-icon small>mdi-open-in-new</v-icon></v-btn>
            </v-card-subtitle>
            <div v-if="window.msgCache[tx.hash] != ''">
                <v-card-text style="padding-top:0"> {{ window.msgCache[tx.hash] }} </v-card-text>
            </div>
        </v-card>
    </v-col>
    `,
    data: function () {
        return {
            privkey: '',
            pubkey: '',
            addr: '',
            eaddr: '',
            balance: 0,
            working: false,
            stxs: [],
        }
    },
    created: function () {
        initWallet(this).then(() => {
            this.working = true
            this.update()
        })
    },
    destroyed: function () {
        this.working = false
    },
    methods: {
        send: function () {
            this.$router.push({ name: 'send' })
        },
        update: function (setnxt = true) {
            tcoin.getBalance(this.eaddr).then(balance => {
                this.balance = balance
                if (this.working && setnxt) setTimeout(this.update, 3000)
            })
            tcoin.getAccountTransactions(this.eaddr, 1).then(data => {
                const lim = 10
                const txs = data.txs
                const stxs = []
                let addPending = typeof (window.pendingTx) != 'undefined'
                for (let i = 0; i < txs.length && stxs.length < lim; i++) {
                    const tx = txs[i]
                    if (tx.from == tx.to) continue
                    let op = '', other = ''
                    if (tx.from == 'tcoin2K3n5t4wSaF5mj27Tw9vStXWLWyRjjiH5Cp3CFLpKVCr1d') {
                        op = 'Mined'
                    } else if (tx.to == this.eaddr) {
                        op = 'Received'
                        other = tx.from
                    } else {
                        op = 'Sent'
                        other = tx.to
                    }
                    stxs.push({
                        op: op,
                        prefix: op == 'Sent' ? '-' : '+',
                        color: op == 'Sent' ? 'rgb(235,55,66)' : 'rgb(33,169,77)',
                        colorMain: 'black',
                        value: tx.value,
                        addr: other,
                        hash: tx.hash,
                        blockid: tx.blockid
                    })
                    if (addPending && tx.hash == window.pendingTx.hash) {
                        addPending = false
                        delete window.pendingTx
                    }
                    if (typeof (window.msgCache[tx.hash]) == "undefined") {
                        window.msgCache[tx.hash] = ''
                        if (op != 'Mined') {
                            tcoin.getTransactionByHash(tx.hash).then(tx => {
                                const msg = tcoin.utils.showUtf8(tx.data)
                                const hash = sha256(tx.raw)
                                if (msg != '') {
                                    window.msgCache[hash] = msg
                                    this.$forceUpdate()
                                }
                            })
                        }
                    }
                }
                if (addPending) {
                    stxs.unshift({
                        op: 'Sending',
                        prefix: '-',
                        color: 'rgb(235,165,171)',
                        colorMain: 'rgb(175,175,175)',
                        value: window.pendingTx.value,
                        addr: window.pendingTx.to,
                        hash: window.pendingTx.hash,
                        blockid: -1
                    })
                    if (stxs.length > lim) {
                        stxs.pop()
                    }
                }
                this.stxs = stxs
            })
        },
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
                tcoin.decodeAddr(this.toAddr)
            } catch (e) {
                return e
            }
            return true
        },
        submit: function () {
            const intAmount = Math.floor(this.amount * 1000000000)
            tcoin.getNonce(this.eaddr).then(nonce => {
                const enc = new TextEncoder()
                const msgEnc = enc.encode(this.msg)
                const tx = {
                    type: 1,
                    pubkey: this.pubkey,
                    toAddr: tcoin.decodeAddr(this.toAddr),
                    value: intAmount,
                    gasLimit: 40000 + msgEnc.length,
                    fee: 0,
                    nonce: nonce,
                    data: msgEnc
                }
                tcoin.signTx(tx, this.privkey).then(sig => {
                    tx.sig = sig
                    const txData = tcoin.encodeTx(tx)
                    tcoin.sendTransaction(tx).then(_ => {
                        this.$router.push({ name: 'index' })
                        const hash = sha256(txData)
                        window.pendingTx = {
                            to: this.toAddr,
                            value: intAmount,
                            hash: hash
                        }
                        window.msgCache[hash] = this.msg
                    })
                })
            })
        }
    }
}

const Inject = {
    template: `
    <v-col>
        <div v-if="method == 'connect'">
            <h2>Connect</h2>
            <p> Are you sure to connect wallet </p>
            <p> {{ eaddr }} </p>
            <p> to {{ origin }}? </p>
            <v-btn class="no-upper-case" outlined @click="connectConfirm"> Connect </v-btn>
            <v-btn class="no-upper-case" outlined @click="cancel"> Cancel </v-btn>
        </div>
        <div v-if="method == 'approve'">
            <h2>Approve transaction</h2>
            <p> {{ origin }} wants to </p>
            <div v-if="tx.type == 1">
                <p> send {{ tcoin.utils.showCoin(tx.value) }} TCoin </p>
                <p> to {{ tcoin.encodeAddr(tx.toAddr) }} </p>
                <p v-if="tx.data"> with message {{ tcoin.utils.showUtf8(tx.data) }} </p>
            </div>
            <div v-if="tx.type == 2">
                <p> execute code </p>
                <v-textarea :value="toHex(tx.data)" rows="1" auto-grow no-resize readonly></v-textarea>
            </div>
            <p> Expected gas usage: {{ tx.gasLimit }} </p>
            <v-btn class="no-upper-case" outlined @click="approveConfirm"> Confirm </v-btn>
            <v-btn class="no-upper-case" outlined @click="cancel"> Reject </v-btn>
        </div>
    </v-col>
    `,
    data: function () {
        return {
            privkey: '',
            pubkey: '',
            addr: '',
            eaddr: '',
            origin: '',
            hexOrigin: '',
            method: '',
            tx: '',
        }
    },
    created: function () {
        initWallet(this)
        this.origin = window.opener.origin
        const enc = new TextEncoder()
        this.hexOrigin = toHex(enc.encode(this.origin))
        window.addEventListener("message", (event) => {
            if (event.origin != this.origin) return
            if (event.data.target != 'tcoin-wallet') return
            const data = event.data.data
            const method = data.method
            const arg = data.arg
            if (this.method != '') return
            if (method == 'connect') {
                if (this.allowed()) {
                    this.connectConfirm()
                }
            } else if (method == 'disconnect') {
                document.cookie = 'allow_' + this.hexOrigin + '=1;expires=Thu, 01 Jan 1970 00:00:01 GMT'
                window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'disconnect' } }, this.origin)
            } else if (method == 'approve') {
                if (!this.allowed())
                    window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'error', arg: 'wallet not connected' } }, this.origin)
                const tx = {
                    type: parseInt(arg.type),
                    pubkey: this.pubkey,
                    toAddr: this.purifyUint8Array(arg.toAddr),
                    value: parseInt(arg.value),
                    fee: 0,
                    data: this.purifyUint8Array(arg.data),
                }
                tcoin.estimateGas(tx).then(gas => {
                    tx.gasLimit = gas
                    this.tx = tx
                })
            }
            this.method = method
        }, false)
        window.onbeforeunload = function () {
            window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'unload' } }, this.origin)
        }
        window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'load' } }, this.origin)
    },
    methods: {
        purifyUint8Array: function (s) {
            return fromHex(toHex(s))
        },
        allowed: function () {
            return getCookie('allow_' + this.hexOrigin) == '1'
        },
        connectConfirm: function () {
            document.cookie = 'allow_' + this.hexOrigin + '=1'
            window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'connect', arg: this.eaddr } }, this.origin)
            window.close()
        },
        approveConfirm: function () {
            tcoin.getNonce(this.eaddr).then(nonce => {
                const tx = this.tx
                tx.nonce = nonce
                tcoin.signTx(tx, this.privkey).then(sig => {
                    tx.sig = sig
                    window.opener.postMessage({ target: 'tcoin-wallet', data: { method: 'approve', arg: tx } }, this.origin)
                })
            })
        },
        cancel: function () {
            window.close()
        }
    }
}

const router = new VueRouter({
    mode: 'hash',
    routes: [
        { path: '/', component: Index, name: 'index' },
        { path: '/create', component: CreateWallet, name: 'create_wallet' },
        { path: '/send', component: Send, name: 'send' },
        { path: '/inject', component: Inject, name: 'inject' },
    ]
})

new Vue({
    router,
    el: '#app',
    vuetify: new Vuetify(opts)
})