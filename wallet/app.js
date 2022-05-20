

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