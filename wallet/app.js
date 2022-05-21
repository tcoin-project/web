const api = axios.create({ baseURL: rpcUrl });

const opts = { dark: false };
Vue.use(Vuetify);

window.msgCache = {}

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
        <p> Balance: {{ showCoin(balance) }} TCoin <v-btn text small @click="send" class="no-upper-case">Send</v-btn></p>
        <v-card v-for="tx in stxs">
            <v-card-title>
                <div style="display:inline-box;width:100%">
                    <span :style="'float:left;color:' + tx.colorMain">{{ tx.op }}</span>
                    <span :style="'float:right;color:' + tx.color">{{ tx.prefix + showCoin(tx.value) }} TCoin</span>
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
            api.get('get_account_info/' + this.eaddr).then(response => {
                this.balance = response.data.data.balance
                if (this.working && setnxt) setTimeout(this.update, 3000)
            })
            api.get('explorer/get_account_transactions/' + this.eaddr + '/1').then(response => {
                const lim = 10
                const txs = response.data.txs
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
                            api.get('explorer/get_transaction/' + tx.hash).then(resp => {
                                const tx = decodeTx(base64ToBytes(resp.data.tx))
                                const msg = showUtf8(tx.data)
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